// apps/robot/src/pages/ReplayControls/mcap/replayMcapTopicLoader.js
import { McapIndexedReader } from '@mcap/core'
import { BlobReadable } from '@mcap/browser'

// Logreplay 디코더 유틸
import { tryDecodePayload, buildDecoderForSchema } from '../../Logreplay/mcap/decoder.js'

// 패키지 기반 디컴프
import * as fzstd from 'fzstd'
import * as lz4ns from 'lz4js'

const lz4 = lz4ns && lz4ns.default ? lz4ns.default : lz4ns
const textDecoder = new TextDecoder()

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

  return { id: Number(schemaRec.id), name: schemaRec.name, encoding: enc, data: dataText }
}

async function decodeMessageToObject({ dataU8, channel, schemasById }) {
  // 1) schema 전용 디코더 우선
  let obj = null
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

/**
 * ✅ ReplayControls용: 토픽 목록 + 통계 + "시간축 전체를 커버하는" 샘플(버킷 샘플링)
 *
 * options:
 *  - sampleTopics: 기본 ['/joint_states']
 *  - samplePerTopic: 버킷 개수(=최대 샘플 수) ex) 300
 *  - maxScanMessages: pass당 스캔 상한
 *  - debug: 콘솔 출력
 */
export async function loadMcapTopicsAndSamplesFromArrayBuffer(input, options = {}) {
  const {
    // System/Performance 실데이터 전환을 위한 기본 샘플 토픽 확장
    sampleTopics = [
      '/joint_states',
      '/hmc_ros2_control/diagnostic',
      '/hmc_ros2_control/actuator_states',
      '/tracking_controller/joint'
      // 필요해지면 다음 단계에서 추가:
      // '/tf',
      // '/tf_static'
    ],
    samplePerTopic = 300,
    maxScanMessages = 300000,
    decompressHandlers = null,
    debug = true
  } = options

  const blob = toBlob(input)
  if (!blob) throw new Error('Invalid MCAP input (expected ArrayBuffer/Uint8Array/Blob)')

  const handlers =
    decompressHandlers && typeof decompressHandlers === 'object' ? decompressHandlers : buildDefaultDecompressHandlers()

  const reader = await McapIndexedReader.Initialize({
    readable: new BlobReadable(blob),
    decompressHandlers: handlers
  })

  const channelsById = reader?.channelsById || new Map()
  const schemasById = reader?.schemasById || new Map()

  // 1) 토픽 메타 목록
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

  // ─────────────────────────────────────────────
  // PASS 1) stats만 수집 (전체 duration 계산 목적)
  // ─────────────────────────────────────────────
  const statsByTopic = new Map() // topic -> {count, firstSec, lastSec}
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

    const s = statsByTopic.get(topic) || { count: 0, firstSec: tSecAbs, lastSec: tSecAbs }
    s.count += 1
    if (tSecAbs < s.firstSec) s.firstSec = tSecAbs
    if (tSecAbs > s.lastSec) s.lastSec = tSecAbs
    statsByTopic.set(topic, s)
  }

  // stats 결과 정리
  const stats = {}
  for (const [topic, s] of statsByTopic) {
    const dt = s.lastSec - s.firstSec
    const hz = dt > 0 ? (s.count - 1) / dt : null
    stats[topic] = { count: s.count, hz, firstSec: s.firstSec, lastSec: s.lastSec }
  }

  if (debug && stats['/joint_states']) {
    const j = stats['/joint_states']
    console.log(`[ReplayControls][MCAP] /joint_states stats: hz=${j.hz?.toFixed?.(2) ?? j.hz} count=${j.count}`)
  }

  // ✅ timeRange는 joint_states 기준(시간축 single source)
  const jsStat = statsByTopic.get('/joint_states')
  const absStartSec = jsStat && Number.isFinite(jsStat.firstSec) ? jsStat.firstSec : null
  const absEndSec = jsStat && Number.isFinite(jsStat.lastSec) ? jsStat.lastSec : null

  const duration = absStartSec != null && absEndSec != null ? Math.max(0, absEndSec - absStartSec) : 0

  // 🔥 동기화 기준(timeRange.startSec/endSec)은 "상대초"로 통일
  const timeRange =
    absStartSec != null && absEndSec != null ? { startSec: 0, endSec: duration, absStartSec, absEndSec } : null

  // PASS2에서 상대초 계산용 기준은 절대 시작(sec)
  const baseAbsStartSec = absStartSec

  if (debug) {
    console.log('[ReplayControls][MCAP] timeRange:', timeRange, 'duration(s)=', duration)
  }

  // ─────────────────────────────────────────────
  // PASS 2) 샘플 수집 (버킷 샘플링) + A안 tSec 상대초
  // ─────────────────────────────────────────────
  const wantAll = !sampleTopics || sampleTopics.length === 0
  const wantSet = wantAll ? null : new Set(sampleTopics)

  // topic -> Map(bucketIndex -> {tSec,msg})
  const bucketMaps = new Map()
  const bucketCount = Math.max(1, Number(samplePerTopic) || 300)

  // 기본: 요청한 토픽들만
  const initTopics = wantAll ? topics.map((t) => t.topic) : [...wantSet]
  for (const tp of initTopics) bucketMaps.set(tp, new Map())

  let scanned2 = 0

  // duration이 없으면(=timeRange 없음) 기존처럼 초반 N개만 뽑는 fallback
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

    // ✅ timeRange가 있으면: 버킷 샘플링
    if (baseAbsStartSec != null && duration > 0 && bucketMaps.has(topic)) {
      const relSec = tSecAbs - baseAbsStartSec // ✅ 상대초(0~duration)

      const r = Math.min(0.999999, Math.max(0, relSec / duration))
      const b = Math.floor(r * bucketCount)

      const bm = bucketMaps.get(topic)
      if (bm.has(b)) continue // 이미 채워진 버킷이면 decode도 안 함(성능 핵심)

      const obj = await decodeMessageToObject({ dataU8, channel, schemasById })
      if (!obj) continue

      bm.set(b, { tSec: relSec, msg: obj })
    } else {
      // ✅ fallback: timeRange 없을 때는 초반 N개만
      const arr = fallbackSamplesByTopic.get(topic) || []
      if (arr.length >= bucketCount) continue
      const obj = await decodeMessageToObject({ dataU8, channel, schemasById })
      if (!obj) continue
      arr.push({ tSec: tSecAbs, msg: obj })
      fallbackSamplesByTopic.set(topic, arr)
    }
  }

  // bucketMaps -> samples 배열로 변환 (정렬 보장)
  const samplesOut = {}

  if (baseAbsStartSec != null && duration > 0) {
    for (const [topic, bm] of bucketMaps.entries()) {
      const arr = Array.from(bm.values()).sort((a, b) => a.tSec - b.tSec)
      samplesOut[topic] = arr
    }

    if (debug && samplesOut['/joint_states']?.length) {
      const arr = samplesOut['/joint_states']
      console.log('[ReplayControls][MCAP] timeRange(rel/abs):', timeRange, 'duration(s)=', duration)
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
    timeRange
  }
}
