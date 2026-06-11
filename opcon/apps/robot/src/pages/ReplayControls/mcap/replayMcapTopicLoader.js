import { McapIndexedReader } from '@mcap/core'
import { BlobReadable } from '@mcap/browser'

// Logreplay 디코더 유틸
import { tryDecodePayload, buildDecoderForSchema } from '../../Logreplay/mcap/decoder.js'

// 패키지 기반 디컴프
import * as fzstd from 'fzstd'
import * as lz4ns from 'lz4js'

const lz4 = lz4ns && lz4ns.default ? lz4ns.default : lz4ns
const textDecoder = new TextDecoder()

// ============================================================
// Step1 최소 이식 버전
// - 목표:
//   1) ArrayBuffer full fetch -> URL + HTTP Range reader 전환 기반 마련
//   2) 현재 A가 기대하는 반환 형식(topics/stats/samples/timeRange/robotDescription) 유지
//   3) 상위 훅은 다음 step에서 loadMcapTopicsAndSamplesFromUrl(url, ...)로만 바꾸면 됨
//
// - 아직 안 넣는 것:
//   - playhead 연동 window loader
//   - chunk 단위 prefetch
//   - sparse overview 전용 loader
// ============================================================

// ===== HTTP Range Readable (minimal) =====
class HttpRangeReadable {
  constructor(url, opts = {}) {
    this.url = url
    this._knownSize = typeof opts.knownSize === 'bigint' ? opts.knownSize : null
    this._fetchInit = opts.fetchInit || { mode: 'cors' }
    this._blockSize = Math.max(64 * 1024, Number(opts.blockSizeBytes || 4 * 1024 * 1024)) // default 4MB
    this._maxBlocks = Math.max(1, Number(opts.maxCachedBlocks || 8)) // small LRU
    this._cache = new Map()
    this._inflight = new Set()
  }

  async size() {
    if (this._knownSize != null) return this._knownSize

    await this._fetchRange(0n, 0n)
    if (this._knownSize != null) return this._knownSize

    throw new Error('[ReplayMCAP][HttpRangeReadable] cannot determine remote file size')
  }

  async read(offset, size) {
    const off = BigInt(offset)
    const sz = BigInt(size)
    if (sz <= 0n) return new Uint8Array(0)

    const outLen = Number(sz)
    const out = new Uint8Array(outLen)

    const blockSize = BigInt(this._blockSize)
    let written = 0
    let cur = off
    let remain = sz

    while (remain > 0n) {
      const blockStart = (cur / blockSize) * blockSize
      const blockEnd = blockStart + blockSize - 1n

      const block = await this._getBlock(blockStart, blockEnd)
      const inBlockOffset = Number(cur - blockStart)
      const canTake = Math.min(block.length - inBlockOffset, Number(remain))
      if (canTake <= 0) break

      out.set(block.subarray(inBlockOffset, inBlockOffset + canTake), written)

      written += canTake
      cur += BigInt(canTake)
      remain -= BigInt(canTake)
    }

    return written === out.length ? out : out.subarray(0, written)
  }

  async _getBlock(blockStart, blockEnd, { prefetchNext = true } = {}) {
    const key = blockStart.toString()
    if (this._cache.has(key)) {
      const hit = this._cache.get(key)
      // LRU refresh
      this._cache.delete(key)
      this._cache.set(key, hit)
      return hit
    }

    const buf = await this._fetchRange(blockStart, blockEnd)
    this._cache.set(key, buf)

    if (prefetchNext) this._prefetchNext(blockStart)
    this._evict()
    return buf
  }

  _prefetchNext(currentBlockStart) {
    const nextStart = currentBlockStart + BigInt(this._blockSize)
    if (this._knownSize != null && nextStart >= this._knownSize) return

    const key = nextStart.toString()
    if (this._cache.has(key) || this._inflight.has(key)) return
    this._inflight.add(key)

    const nextEnd =
      this._knownSize != null
        ? nextStart + BigInt(this._blockSize) - 1n < this._knownSize
          ? nextStart + BigInt(this._blockSize) - 1n
          : this._knownSize - 1n
        : nextStart + BigInt(this._blockSize) - 1n

    this._fetchRange(nextStart, nextEnd)
      .then((buf) => {
        if (!this._cache.has(key)) {
          this._cache.set(key, buf)
          this._evict()
        }
      })
      .catch(() => {})
      .finally(() => this._inflight.delete(key))
  }

  _evict() {
    while (this._cache.size > this._maxBlocks) {
      const firstKey = this._cache.keys().next().value
      this._cache.delete(firstKey)
    }
  }

  _parseTotalFromContentRange(h) {
    if (!h) return null
    const m = String(h).match(/bytes\s+\d+\s*-\s*\d+\s*\/\s*(\d+)/i)
    if (!m) return null
    try {
      const total = BigInt(m[1])
      return total > 0n ? total : null
    } catch {
      return null
    }
  }

  async _fetchRange(start, end) {
    const s = BigInt(start)
    const e = BigInt(end)

    const headers = new Headers(this._fetchInit.headers || {})
    headers.set('Range', `bytes=${s.toString()}-${e.toString()}`)

    const resp = await fetch(this.url, {
      ...this._fetchInit,
      method: 'GET',
      headers
    })
    if (!resp.ok) {
      throw new Error(`[ReplayMCAP][HttpRangeReadable] range fetch failed: HTTP ${resp.status}`)
    }

    const cr = resp.headers.get('Content-Range') || resp.headers.get('content-range')
    const total = this._parseTotalFromContentRange(cr)
    if (total != null) this._knownSize = total

    const ab = await resp.arrayBuffer()
    return new Uint8Array(ab)
  }
}

// ===== decompress helpers =====
function wrapHandler(name, fn) {
  return (buf) => {
    const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
    try {
      const out = fn(u8)
      return out instanceof Uint8Array ? out : new Uint8Array(out)
    } catch (e) {
      console.error(`[ReplayMCAP] decompress failed: ${name}`, e)
      throw e
    }
  }
}

function buildDefaultDecompressHandlers() {
  const handlers = {}

  if (typeof fzstd?.decompress === 'function') {
    handlers.zstd = wrapHandler('zstd(fzstd)', (u8) => fzstd.decompress(u8))
  }
  if (lz4 && typeof lz4?.decompress === 'function') {
    handlers.lz4 = wrapHandler('lz4(lz4js)', (u8) => lz4.decompress(u8))
  }

  return handlers
}

async function resolveDecompressHandlers(customHandlers) {
  if (customHandlers && typeof customHandlers === 'object') {
    return customHandlers
  }
  return buildDefaultDecompressHandlers()
}

// ===== common utils =====
function toBlob(input) {
  if (!input) return null
  if (input instanceof Blob) return input
  if (input instanceof Uint8Array) return new Blob([input])
  if (input instanceof ArrayBuffer) return new Blob([input])
  if (ArrayBuffer.isView(input)) return new Blob([input.buffer])
  return null
}

function nsToSec(ns) {
  if (typeof ns === 'bigint') return Number(ns) / 1e9
  if (typeof ns === 'number') return ns / 1e9
  return NaN
}

// Map 키가 bigint/number 섞여도 안전하게 get
function getFromMapFlexible(map, id) {
  if (!map || typeof map.get !== 'function') return undefined
  if (map.has(id)) return map.get(id)

  try {
    const bid = typeof id === 'bigint' ? id : BigInt(id)
    if (map.has(bid)) return map.get(bid)
  } catch {}

  try {
    const nid = typeof id === 'number' ? id : Number(id)
    if (!Number.isNaN(nid) && map.has(nid)) return map.get(nid)
  } catch {}

  return undefined
}

// schema 레코드를 buildDecoderForSchema에 맞게 "텍스트화"
function schemaToTextual(schemaRec) {
  if (!schemaRec) return null

  let dataText = null
  if (typeof schemaRec.data === 'string') dataText = schemaRec.data
  else if (schemaRec.data instanceof Uint8Array) dataText = textDecoder.decode(schemaRec.data)
  else if (schemaRec.data?.buffer) dataText = textDecoder.decode(new Uint8Array(schemaRec.data.buffer))
  if (!dataText) return null

  let enc = String(schemaRec.encoding || '').toLowerCase()
  if (enc === 'ros2') enc = 'ros2msg'
  if (enc === 'ros1') enc = 'ros1msg'
  if (enc === 'ros2idl') enc = 'ros2idl'

  return {
    id: Number(schemaRec.id),
    name: schemaRec.name,
    encoding: enc,
    data: dataText
  }
}

async function decodeMessageToObject({ dataU8, channel, schemasById }) {
  let obj = null

  // 1) schema 전용 디코더 우선
  try {
    const schemaRec = channel?.schemaId != null ? getFromMapFlexible(schemasById, channel.schemaId) : null
    const schText = schemaToTextual(schemaRec)
    if (schText) {
      const dec = await buildDecoderForSchema(schText)
      if (dec && typeof dec.decode === 'function') {
        obj = dec.decode(dataU8)
      }
    }
  } catch {
    obj = null
  }

  // 2) generic decode
  if (!obj) {
    try {
      const schemaResolver = (id) => (id != null ? (getFromMapFlexible(schemasById, id) ?? null) : null)
      obj = await tryDecodePayload(dataU8, channel, schemaResolver)

      if (typeof obj === 'string') {
        try {
          const s = obj.trim()
          if (s && (s[0] === '{' || s[0] === '[')) obj = JSON.parse(s)
        } catch {}
      }
    } catch {
      obj = null
    }
  }

  // 3) 최후: utf8 -> JSON
  if (!obj) {
    try {
      const s = textDecoder.decode(dataU8)
      if (s && (s[0] === '{' || s[0] === '[')) {
        try {
          obj = JSON.parse(s)
        } catch {}
      }
    } catch {}
  }

  return obj && typeof obj === 'object' ? obj : null
}

// ===== reader cache =====
const __readerCache = new Map() // key -> Promise<{ reader }>

function _handlersKey(handlers) {
  if (!handlers) return 'none'
  return Object.keys(handlers).sort().join(',')
}

async function openReaderFromBlob(blob, opts = {}) {
  const decompressHandlers = await resolveDecompressHandlers(opts.decompressHandlers)
  return await McapIndexedReader.Initialize({
    readable: new BlobReadable(blob),
    decompressHandlers
  })
}

async function openReaderFromUrlRange(url, opts = {}) {
  const decompressHandlers = await resolveDecompressHandlers(opts.decompressHandlers)

  const readable = new HttpRangeReadable(url, {
    blockSizeBytes: opts.blockSizeBytes || 4 * 1024 * 1024,
    maxCachedBlocks: opts.maxCachedBlocks || 8
  })

  const reader = await McapIndexedReader.Initialize({
    readable,
    decompressHandlers
  })

  return reader
}

async function getOrOpenIndexedReaderFromUrl(url, options = {}) {
  const decompressHandlers = await resolveDecompressHandlers(options.decompressHandlers)
  const key = `${url}::${_handlersKey(decompressHandlers)}::range`

  if (!__readerCache.has(key)) {
    const p = (async () => {
      const reader = await openReaderFromUrlRange(url, { decompressHandlers })
      return { reader }
    })()
    __readerCache.set(key, p)
  }

  return await __readerCache.get(key)
}

export function clearReplayMcapReaderCache() {
  __readerCache.clear()
}

// ===== core collector =====
async function collectTopicsAndSamplesFromReader(reader, options = {}) {
  const {
    sampleTopics = [
      '/joint_states',
      '/hmc_ros2_control/diagnostic',
      '/hmc_ros2_control/actuator_states',
      '/tracking_controller/joint'
      // 필요 시 추후 확장:
      // '/tf',
      // '/tf_static'
    ],
    samplePerTopic = 300,
    maxScanMessages = 300000,
    debug = true
  } = options

  const channelsById = reader?.channelsById || new Map()
  const schemasById = reader?.schemasById || new Map()

  // ============================================================
  // STEP0: robot_description / URDF 추출
  // ============================================================
  let robotDescription = null
  try {
    for await (const entry of reader.readMessages({ topics: ['/robot_description'] })) {
      const channel =
        entry?.channel || (entry?.channelId != null ? getFromMapFlexible(channelsById, entry.channelId) : null) || null

      const data = entry?.message?.data ?? entry?.data
      if (!data) continue

      const obj = await decodeMessageToObject({
        dataU8: data instanceof Uint8Array ? data : new Uint8Array(data),
        channel,
        schemasById
      })

      if (obj?.data) {
        robotDescription = obj.data
        break
      }
    }
  } catch (e) {
    if (debug) console.warn('[ReplayControls][URDF] read failed:', e)
  }

  if (debug && robotDescription) {
    console.log('[ReplayControls][URDF] loaded', robotDescription.slice(0, 200))
  }

  // ============================================================
  // 1) topic catalog
  // ============================================================
  const topics = []
  for (const [, ch] of channelsById) {
    const sch = ch?.schemaId != null ? (getFromMapFlexible(schemasById, ch.schemaId) ?? null) : null
    topics.push({
      topic: String(ch?.topic || ''),
      schemaName: String(sch?.name || ''),
      schemaEncoding: String(sch?.encoding || ''),
      messageEncoding: String(ch?.messageEncoding || ''),
      schemaId: ch?.schemaId != null ? Number(ch.schemaId) : null
    })
  }
  topics.sort((a, b) => a.topic.localeCompare(b.topic))

  if (debug) {
    console.groupCollapsed(`[ReplayControls][MCAP] topic catalog (${topics.length})`)
    console.table(
      topics.map((t) => ({
        topic: t.topic,
        schema: t.schemaName,
        msgEnc: t.messageEncoding,
        schemaEnc: t.schemaEncoding
      }))
    )
    console.groupEnd()
  }

  // ============================================================
  // PASS1) stats만 수집
  // ============================================================
  const statsByTopic = new Map()
  let scanned1 = 0

  for await (const entry of reader.readMessages({})) {
    scanned1++
    if (scanned1 > maxScanMessages) break

    const channel =
      entry?.channel || (entry?.channelId != null ? getFromMapFlexible(channelsById, entry.channelId) : null) || null

    const topic = String(channel?.topic || '(unknown)')
    const tNs = entry?.logTime ?? entry?.publishTime ?? entry?.message?.logTime ?? entry?.message?.publishTime ?? null
    const tSecAbs = nsToSec(tNs)
    if (!Number.isFinite(tSecAbs)) continue

    const s = statsByTopic.get(topic) || {
      count: 0,
      firstSec: tSecAbs,
      lastSec: tSecAbs
    }

    s.count += 1
    if (tSecAbs < s.firstSec) s.firstSec = tSecAbs
    if (tSecAbs > s.lastSec) s.lastSec = tSecAbs
    statsByTopic.set(topic, s)
  }

  const stats = {}
  for (const [topic, s] of statsByTopic) {
    const dt = s.lastSec - s.firstSec
    const hz = dt > 0 ? (s.count - 1) / dt : null
    stats[topic] = {
      count: s.count,
      hz,
      firstSec: s.firstSec,
      lastSec: s.lastSec
    }
  }

  if (debug && stats['/joint_states']) {
    const j = stats['/joint_states']
    console.log(`[ReplayControls][MCAP] /joint_states stats: hz=${j.hz?.toFixed?.(2) ?? j.hz} count=${j.count}`)
  }

  // ============================================================
  // timeRange는 joint_states 기준(시간축 single source)
  // ============================================================
  const jsStat = statsByTopic.get('/joint_states')
  const absStartSec = jsStat && Number.isFinite(jsStat.firstSec) ? jsStat.firstSec : null
  const absEndSec = jsStat && Number.isFinite(jsStat.lastSec) ? jsStat.lastSec : null

  const duration = absStartSec != null && absEndSec != null ? Math.max(0, absEndSec - absStartSec) : 0

  const timeRange =
    absStartSec != null && absEndSec != null
      ? {
          startSec: 0,
          endSec: duration,
          absStartSec,
          absEndSec
        }
      : null

  const baseAbsStartSec = absStartSec

  if (debug) {
    console.log('[ReplayControls][MCAP] timeRange:', timeRange, 'duration(s)=', duration)
  }

  // ============================================================
  // PASS2) 샘플 수집 (버킷 샘플링)
  // ============================================================
  const wantAll = !sampleTopics || sampleTopics.length === 0
  const wantSet = wantAll ? null : new Set(sampleTopics)

  // topic -> Map(bucketIndex -> {tSec,msg})
  const bucketMaps = new Map()
  const bucketCount = Math.max(1, Number(samplePerTopic) || 300)

  const initTopics = wantAll ? topics.map((t) => t.topic) : [...wantSet]
  for (const tp of initTopics) bucketMaps.set(tp, new Map())

  let scanned2 = 0
  const fallbackSamplesByTopic = new Map()

  for await (const entry of reader.readMessages({})) {
    scanned2++
    if (scanned2 > maxScanMessages) break

    const channel =
      entry?.channel || (entry?.channelId != null ? getFromMapFlexible(channelsById, entry.channelId) : null) || null

    const topic = String(channel?.topic || '(unknown)')
    if (!wantAll && !wantSet.has(topic)) continue

    const tNs = entry?.logTime ?? entry?.publishTime ?? entry?.message?.logTime ?? entry?.message?.publishTime ?? null
    const tSecAbs = nsToSec(tNs)
    if (!Number.isFinite(tSecAbs)) continue

    const data = entry?.message?.data ?? entry?.data
    if (!data) continue
    const dataU8 = data instanceof Uint8Array ? data : new Uint8Array(data)

    // timeRange가 있으면: 버킷 샘플링
    if (baseAbsStartSec != null && duration > 0 && bucketMaps.has(topic)) {
      const relSec = tSecAbs - baseAbsStartSec // 상대초
      const r = Math.min(0.999999, Math.max(0, relSec / duration))
      const b = Math.floor(r * bucketCount)

      const bm = bucketMaps.get(topic)
      if (bm.has(b)) continue // 이미 채워진 버킷이면 decode skip

      const obj = await decodeMessageToObject({ dataU8, channel, schemasById })
      if (!obj) continue

      bm.set(b, { tSec: relSec, msg: obj })
    } else {
      // fallback: timeRange 없을 때는 초반 N개만
      const arr = fallbackSamplesByTopic.get(topic) || []
      if (arr.length >= bucketCount) continue

      const obj = await decodeMessageToObject({ dataU8, channel, schemasById })
      if (!obj) continue

      arr.push({ tSec: tSecAbs, msg: obj })
      fallbackSamplesByTopic.set(topic, arr)
    }
  }

  const samplesOut = {}

  if (baseAbsStartSec != null && duration > 0) {
    for (const [topic, bm] of bucketMaps.entries()) {
      const arr = Array.from(bm.values()).sort((a, b) => a.tSec - b.tSec)
      samplesOut[topic] = arr
    }

    if (debug && samplesOut['/joint_states']?.length) {
      console.log('[ReplayControls][MCAP] samples /joint_states =', samplesOut['/joint_states'].length)
    }
  } else {
    for (const [topic, arr] of fallbackSamplesByTopic.entries()) {
      samplesOut[topic] = arr
    }

    if (debug) {
      console.warn('[ReplayControls][MCAP] timeRange not available; using fallback first-N sampling')
    }
  }

  return {
    topics,
    stats,
    samples: samplesOut,
    timeRange,
    robotDescription
  }
}

// ============================================================
// 기존 호환 API (ArrayBuffer / Uint8Array / Blob 기반)
// ============================================================
export async function loadMcapTopicsAndSamplesFromArrayBuffer(input, options = {}) {
  const blob = toBlob(input)
  if (!blob) throw new Error('Invalid MCAP input (expected ArrayBuffer/Uint8Array/Blob)')

  const reader = await openReaderFromBlob(blob, {
    decompressHandlers: options.decompressHandlers
  })

  return await collectTopicsAndSamplesFromReader(reader, options)
}

// ============================================================
// 신규 API (URL + HTTP Range 기반)
// Step2에서 상위 훅은 이 함수로 갈아타면 됨
// ============================================================
export async function loadMcapTopicsAndSamplesFromUrl(url, options = {}) {
  if (!url || typeof url !== 'string') {
    throw new Error('Invalid MCAP url')
  }

  const { reader } = await getOrOpenIndexedReaderFromUrl(url, {
    decompressHandlers: options.decompressHandlers
  })

  return await collectTopicsAndSamplesFromReader(reader, options)
}

// ============================================================
// 신규: /joint_states 현재 구간 window 로더
// - Step2 최소 연결용
// - 반환 형식은 기존 samples['/joint_states']와 동일: [{ tSec, msg }]
// ============================================================
export async function loadJointStatesWindowFromUrl(url, options = {}) {
  const {
    topic = '/joint_states',
    startSec = 0,
    endSec = 3,
    maxMessages = 800,
    timeDownsampleMs = 0,
    baseAbsStartSec = null,
    decompressHandlers
  } = options

  if (!url || typeof url !== 'string') {
    throw new Error('Invalid MCAP url')
  }

  const { reader } = await getOrOpenIndexedReaderFromUrl(url, {
    decompressHandlers
  })

  const channelsById = reader?.channelsById || new Map()
  const schemasById = reader?.schemasById || new Map()

  const absBaseSec = Number.isFinite(baseAbsStartSec) ? baseAbsStartSec : nsToSec(reader?.statistics?.messageStartTime)

  if (!Number.isFinite(absBaseSec)) {
    throw new Error('[ReplayControls][joint window] cannot determine baseAbsStartSec')
  }

  const secToNsBigInt = (sec) => BigInt(Math.floor(Number(sec) * 1e9))
  const startTimeNs = secToNsBigInt(absBaseSec + Number(startSec || 0))
  const endTimeNs = secToNsBigInt(absBaseSec + Number(endSec || 0))

  const out = []
  let lastKeptT = -Infinity
  let count = 0

  for await (const entry of reader.readMessages({
    topics: [topic],
    startTime: startTimeNs,
    endTime: endTimeNs
  })) {
    const channel =
      entry?.channel || (entry?.channelId != null ? getFromMapFlexible(channelsById, entry.channelId) : null) || null

    const tNs = entry?.logTime ?? entry?.publishTime ?? entry?.message?.logTime ?? entry?.message?.publishTime ?? null
    const tSecAbs = nsToSec(tNs)
    if (!Number.isFinite(tSecAbs)) continue

    const relSec = tSecAbs - absBaseSec
    if (!Number.isFinite(relSec)) continue

    if (timeDownsampleMs > 0 && Number.isFinite(lastKeptT) && (relSec - lastKeptT) * 1000 < timeDownsampleMs) {
      continue
    }
    lastKeptT = relSec

    const data = entry?.message?.data ?? entry?.data
    if (!data) continue
    const dataU8 = data instanceof Uint8Array ? data : new Uint8Array(data)

    const obj = await decodeMessageToObject({
      dataU8,
      channel,
      schemasById
    })
    if (!obj) continue

    out.push({ tSec: relSec, msg: obj })
    count++

    if (count >= maxMessages) break
  }

  out.sort((a, b) => (a.tSec ?? 0) - (b.tSec ?? 0))
  for (let i = out.length - 2; i >= 0; i--) {
    if ((out[i]?.tSec ?? 0) === (out[i + 1]?.tSec ?? 0)) {
      out.splice(i, 1)
    }
  }

  return {
    topic,
    samples: out
  }
}
