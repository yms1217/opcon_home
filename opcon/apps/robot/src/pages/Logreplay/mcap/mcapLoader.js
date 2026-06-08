// apps/robot/src/pages/Logreplay/mcap/mcapLoader.js
import { McapIndexedReader } from '@mcap/core'
import { BlobReadable } from '@mcap/browser'
import { tryDecodePayload, buildDecoderForSchema } from './decoder.js'

// 디코더 패키지(패키지 기반, WASM 파일 import 불필요)
import * as fzstd from 'fzstd' // zstd: pure JS (no wasm file import)  [fzstd.decompress(u8)]
import * as lz4ns from 'lz4js' // lz4: browser CJS -> ESM 호환 네임스페이스 임포트

const lz4 = lz4ns && lz4ns.default ? lz4ns.default : lz4ns
const textDecoder = new TextDecoder()

// ===== [REPLACE] 단일 full-scan 멀티 토픽 스캐너 =====
// 모든 토픽을 1회 readMessages()로 순회하고,
// topic별 handler로 fan-out 한다.
export async function scanMcapOnce(url, options = {}) {
  const {
    topics, // string[]  - 실제 scan 대상 토픽 목록
    decompressHandlers,
    handlers // { [topic]: ({ msg, ch, reader, schemaResolver }) => void | Promise<void> }
  } = options

  const { reader } = await getOrOpenIndexedReaderFromUrl(url, { decompressHandlers })

  const channelsById = reader.channelsById || new Map()
  const schemasById = reader.schemasById || new Map()
  const schemaResolver = (id) => (id != null ? (schemasById.get(id) ?? null) : null)

  // topic → handler 매핑 (빠른 분기용)
  const handlerByTopic = handlers || {}

  // ✅ 핵심: readMessages 단 1회
  for await (const msg of reader.readMessages({ topics })) {
    const ch = channelsById.get(msg.channelId)
    const topic = ch?.topic
    if (!topic) continue

    const fn = handlerByTopic[topic]
    if (!fn) continue

    // ✅ Promise일 때만 await (매 메시지 await 비용 최소화)
    const ret = fn({ msg, ch, reader, schemaResolver })
    if (ret && typeof ret.then === 'function') await ret
  }
}

/**
 * msg.data -> JS object(or array) 디코드 공통 유틸
 * - decoder(스키마 전용)가 있으면 우선 사용
 * - tryDecodePayload() -> string이면 JSON.parse 시도
 * - 최후: utf8 decode -> JSON.parse(헤더가 {/[ 인 경우만)
 */
async function decodeMsgToObject(msg, ch, schemaResolver, { decoder = null, tryUtf8Json = true } = {}) {
  let obj = null

  // 1) schema decoder 우선
  if (decoder && typeof decoder.decode === 'function') {
    try {
      obj = decoder.decode(msg.data instanceof Uint8Array ? msg.data : new Uint8Array(msg.data))
    } catch {
      obj = null
    }
  }

  // 2) generic decode
  if (!obj) {
    try {
      obj = await tryDecodePayload(msg.data, ch, schemaResolver)
    } catch {
      obj = null
    }
  }

  // 3) string -> JSON.parse
  if (typeof obj === 'string') {
    try {
      obj = JSON.parse(obj)
    } catch {
      // keep as string (caller expects object; will be filtered below)
    }
  }

  // 4) utf8 -> JSON.parse (optional)
  if ((!obj || typeof obj !== 'object') && tryUtf8Json && textDecoder) {
    try {
      const s = textDecoder.decode(msg.data)
      if (s && (s[0] === '{' || s[0] === '[')) {
        try {
          obj = JSON.parse(s)
        } catch {}
      }
    } catch {}
  }

  return obj && typeof obj === 'object' ? obj : null
}

// URL+코덱핸들러 조합별로 IndexedReader를 1회만 오픈하여 공유
const __readerCache = new Map() // key: `${url}::${Object.keys(handlers).sort().join(',')}` -> Promise<{ reader }>

function _handlersKey(handlers) {
  if (!handlers) return 'none'
  const ks = Object.keys(handlers).sort()
  return ks.join(',')
}

/**
 * 같은 URL에 대해 IndexedReader를 재사용한다.
 * - 최초 1회: fetch(blob) + openReaderFromBlob(blob) 수행
 * - 이후: 캐시된 reader/blob 즉시 반환
 */
async function getOrOpenIndexedReaderFromUrl(url, options = {}) {
  const decompressHandlers = await resolveDecompressHandlers(options.decompressHandlers)
  const key = `${url}::${_handlersKey(decompressHandlers)}`

  if (!__readerCache.has(key)) {
    const p = (async () => {
      const blob = await fetchBlob(url)
      const reader = await openReaderFromBlob(blob, { decompressHandlers })
      // blob은 reader 내부에서 참조되므로 별도 보관 불필요(메모리 절약)
      return { reader }
    })()
    __readerCache.set(key, p)
  }
  return await __readerCache.get(key)
}

// 채널/스키마 전부 나열
function listAllChannels(reader) {
  const channelsById = reader.channelsById || new Map()
  const schemasById = reader.schemasById || new Map()
  const out = []
  for (const [, ch] of channelsById) {
    const sch = ch?.schemaId != null ? (schemasById.get(ch.schemaId) ?? null) : null
    out.push({
      topic: String(ch?.topic || ''),
      schemaName: String(sch?.name || ''),
      encoding: String(sch?.encoding || '')
    })
  }
  return out
}

// 지도 토픽 후보 고르기: ① 스키마(occupancygrid) ② 토픽명 키워드 ③ 간단 점수(정적맵 선호)
function pickOccupancyGridTopic(reader) {
  // 대표 Grid: 정적 지도
  const candidates = ['/map', '/carto_service/occupancygrid']
  const chosen = findTopicByCandidates(reader, candidates)

  if (!chosen) {
    const topics = listAllChannels(reader).map((c) => c.topic)
    // preferredLower가 있으면 거기에 더 근접한 것 먼저
    console.warn('[GRID] no grid topic found. candidates=', candidates, 'available=', topics)
    // 2) 토픽 이름 키워드로 추려내기
    return null
  }

  // 디버그용 전체 목록
  return chosen
}

// ---- nav_ros_msgs/msg/OccupancyGrid 전용 최소 normalizer ----
function normalizeOccupancyGrid(raw) {
  // 1) 메타/치수 추출 (여러 변형 허용)
  const info = raw?.info
  const res = Number(info?.resolution)
  const width = Number(info?.width)
  const height = Number(info?.height)
  if (!(res > 0 && width > 0 && height > 0)) return null
  // 2) data 추출 (다양한 케이스)
  const originPose = info?.origin || {}
  // (a) { data: <TypedArray|Array> } 래핑
  const originPos = originPose?.position || {}
  // (b) base64 형태
  // atob 기반 디코드 (브라우저)
  const yaw = quatToYaw(originPose?.orientation)

  /* keep null */
  let src = raw?.data
  // (c) ArrayBuffer / DataView / TypedArray / Array
  let u8 = null
  if (src instanceof Uint8Array) u8 = src
  else if (ArrayBuffer.isView(src)) u8 = new Uint8Array(src.buffer, src.byteOffset, src.byteLength)
  else if (Array.isArray(src)) u8 = Uint8Array.from(src)
  // { buffer, byteOffset?, byteLength? } 형태

  // 3) 치수/해상도/데이터 유효성
  if (!u8) return null

  const need = width * height
  if (u8.length < need) return null
  // 길이가 더 길면 앞부분만 사용 (여분 채널/메타가 뒤에 붙는 경우)
  if (u8.length > need) u8 = u8.subarray(0, need)

  // 4) yaw 계산(있으면)

  return {
    frame_id: raw?.header?.frame_id || 'map',
    resolution: res,
    width,
    height,
    origin: { x: +originPos.x || 0, y: +originPos.y || 0, z: +originPos.z || 0, yaw },
    data: u8
  }
}

// 기대 토픽 후보(소문자) 중 하나로 끝나거나 포함되는 채널을 찾는다.
function findTopicByCandidates(reader, candidatesLower) {
  const topics = listAllChannels(reader).map((c) => c.topic)
  const lowers = topics.map((t) => ({ raw: t, low: t.toLowerCase() }))

  // 1) 완전 일치 우선
  for (const cand of candidatesLower) {
    const hit = lowers.find((x) => x.low === cand)
    if (hit) return hit.raw
  }
  // 2) suffix 매칭 (네임스페이스가 앞에 붙은 경우)
  for (const cand of candidatesLower) {
    const hit = lowers.find((x) => x.low.endsWith(cand))
    if (hit) return hit.raw
  }
  // 3) 부분 포함(안전장치)
  for (const cand of candidatesLower) {
    const hit = lowers.find((x) => x.low.includes(cand))
    if (hit) return hit.raw
  }

  // 4) 디버깅을 위해 콘솔에 전체 목록 출력
  //console.warn("[mcapLoader] No candidate topic found. available topics:", topics);
  return null
}

function wrapHandler(name, fn) {
  return (buf) => {
    try {
      const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
      const out = fn(u8)
      return out instanceof Uint8Array ? out : new Uint8Array(out)
    } catch (e) {
      console.error(`dec: ${name} decompress failed`, e)
      // 실패를 명확히 알리기 위해 예외를 다시 던진다.
      throw e
    }
  }
}

/** 디컴프 핸들러 기본 세트(fzstd/lz4js) */
function buildDefaultDecompressHandlers() {
  const handlers = {}

  // zstd: fzstd (pure JS)
  if (typeof fzstd?.decompress === 'function') {
    handlers['zstd'] = wrapHandler('zstd(fzstd)', (u8) => fzstd.decompress(u8))
  }

  // lz4: lz4js — 기본은 '프레임'용 decompress.
  // 만약 raw block이면 이 자리에선 실패할 수 있음 → dsa dec 로그로 확인 가능
  if (lz4 && typeof lz4?.decompress === 'function') {
    handlers['lz4'] = wrapHandler('lz4(lz4js)', (u8) => lz4.decompress(u8))
  }

  return handlers
}

/**
 * 디컴프 핸들러 해결
 * 우선순위:
 *   1) 호출자가 주입한 handlers (options.decompressHandlers)
 *   2) 패키지 기반 기본 핸들러(fzstd/lz4js)
 */
async function resolveDecompressHandlers(customHandlers) {
  if (customHandlers && typeof customHandlers === 'object') {
    const keys = Object.keys(customHandlers)
    console.log('using injected decompress handlers:', keys)
    return customHandlers
  }
  const handlers = buildDefaultDecompressHandlers()
  const keys = Object.keys(handlers)
  if (keys.length === 0) {
    console.warn('no decompress handlers available (only uncompressed MCAP will work)')
  } else {
    console.log('using package-based handlers:', keys)
  }
  return handlers
}

async function fetchBlob(url) {
  const resp = await fetch(url, { mode: 'cors' })
  if (!resp.ok) throw new Error(`MCAP fetch failed: HTTP ${resp.status}`)
  return await resp.blob()
}

/**
 * blob으로부터 McapIndexedReader 오픈
 * opts.decompressHandlers: { [codec: string]: (buf: Uint8Array|ArrayBuffer) => Uint8Array }
 */
async function openReaderFromBlob(blob, opts = {}) {
  const decompressHandlers = await resolveDecompressHandlers(opts.decompressHandlers)
  console.log('2-2 : decompressHandlers keys:', Object.keys(decompressHandlers || {}))

  try {
    const reader = await McapIndexedReader.Initialize({
      readable: new BlobReadable(blob),
      decompressHandlers
    })
    return reader
  } catch (e) {
    console.error('2-3: McapIndexedReader.Initialize failed', e)
    throw e
  }
}

function nsToSec(ns) {
  if (typeof ns === 'bigint') return Number(ns) / 1e9
  if (typeof ns === 'number') return ns / 1e9
  return 0
}

function quatToYaw(q) {
  if (!q || typeof q.w !== 'number') return 0
  const qx = +q.x || 0
  const qy = +q.y || 0
  const qz = +q.z || 0
  const qw = +q.w || 1
  const siny_cosp = 2 * (qw * qz + qx * qy)
  const cosy_cosp = 1 - 2 * (qy * qy + qz * qz)
  return Math.atan2(siny_cosp, cosy_cosp)
}

// ---- Pose2dStamped (geometry_ros_msgs/msg/Pose2dStamped) 전용 최소 추출기 ----
function pickPose2dStamped(obj) {
  // 1) Pose2dStamped: obj.pose
  let p = obj?.pose
  if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) {
    return { x: +p.x, y: +p.y, z: 0, yaw: Number(p.yaw ?? p.theta ?? 0) || 0 }
  }

  // 2) DWA goal: obj.goal.pose
  p = obj?.goal?.pose
  if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) {
    return { x: +p.x, y: +p.y, z: 0, yaw: Number(p.yaw ?? p.theta ?? 0) || 0 }
  }

  // 3) fallback: flat object (rare but safe)
  p = obj
  if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) {
    return { x: +p.x, y: +p.y, z: 0, yaw: Number(p.yaw ?? p.theta ?? 0) || 0 }
  }

  return null
}

// ✅ 범용 Pose 추출기: Pose2dStamped + Odometry + PoseStamped + PoseWithCovarianceStamped 지원
function pickPoseAny(obj) {
  // 1) 기존 Pose2dStamped 우선
  const p2 = pickPose2dStamped(obj)
  if (p2) return p2

  // 2) nav_msgs/Odometry: obj.pose.pose.position / orientation
  const posOdom = obj?.pose?.pose?.position
  const oriOdom = obj?.pose?.pose?.orientation
  if (posOdom && Number.isFinite(posOdom.x) && Number.isFinite(posOdom.y)) {
    return {
      x: +posOdom.x,
      y: +posOdom.y,
      z: Number(posOdom.z) || 0,
      yaw: quatToYaw(oriOdom)
    }
  }

  // 3) geometry_msgs/PoseStamped: obj.pose.position / orientation
  const posPS = obj?.pose?.position
  const oriPS = obj?.pose?.orientation
  if (posPS && Number.isFinite(posPS.x) && Number.isFinite(posPS.y)) {
    return {
      x: +posPS.x,
      y: +posPS.y,
      z: Number(posPS.z) || 0,
      yaw: quatToYaw(oriPS)
    }
  }

  // 4) geometry_msgs/PoseWithCovarianceStamped: obj.pose.pose.position / orientation
  const posPWCS = obj?.pose?.pose?.position
  const oriPWCS = obj?.pose?.pose?.orientation
  if (posPWCS && Number.isFinite(posPWCS.x) && Number.isFinite(posPWCS.y)) {
    return {
      x: +posPWCS.x,
      y: +posPWCS.y,
      z: Number(posPWCS.z) || 0,
      yaw: quatToYaw(oriPWCS)
    }
  }

  // 5) 추가 래핑 케이스: { odom: {...} } / { msg: {...} } / { data: {...} }
  const inner = obj?.odom || obj?.msg || obj?.data
  if (inner && inner !== obj) return pickPoseAny(inner)

  return null
}

// ROS stamp(초/나노초) → 초 단위
function stampToSec(stamp) {
  if (!stamp || typeof stamp !== 'object') return null
  const sec = Number(stamp.sec ?? stamp.seconds ?? stamp.Sec ?? stamp.Seconds ?? null)
  const nsec = Number(stamp.nsec ?? stamp.nanosec ?? stamp.nanoseconds ?? stamp.Nsec ?? stamp.Nanosec ?? null)
  if (Number.isFinite(sec) && Number.isFinite(nsec)) return sec + nsec / 1e9
  if (Number.isFinite(sec)) return sec
  return null
}

function formatLocal(tsSec) {
  const d = new Date(tsSec * 1000)
  const pad = (n, w = 2) => String(n).padStart(w, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${String(d.getMilliseconds()).padStart(3, '0')}`
}
function normalizeLevelText(v) {
  const s = String(v ?? '').toUpperCase()
  if (['DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL'].includes(s)) return s
  const n = Number(v ?? 0)
  if (n === 10 || n === 1) return 'DEBUG'
  if (n === 20 || n === 2) return 'INFO'
  if (n === 30 || n === 4) return 'WARN'
  if (n === 40 || n === 8) return 'ERROR'
  if (n === 50 || n === 16) return 'FATAL'
  return 'INFO'
}

/** /rosout -> 문자열 라인 배열 */
export async function loadLogsFromMcapUrl(url, options = {}) {
  const {
    logTopic = '/rosout',
    maxLines = 20000,
    decompressHandlers,
    onBatch, // 실시간 로그 스트리밍 콜백
    batchSize = 50, // 몇 줄마다 UI에 반영할지
    VERBOSE = false
  } = options

  if (VERBOSE) console.log('loadLogsFromMcapUrl start : ', { url, logTopic, maxLines })

  const out = []
  let reader = null
  let hasTopic = false
  let cnt = 0

  try {
    // 1) 캐시된 reader 사용
    ;({ reader } = await getOrOpenIndexedReaderFromUrl(url, { decompressHandlers }))
    if (VERBOSE)
      console.log('reader opened', {
        channels: reader?.channelsById?.size,
        schemas: reader?.schemasById?.size
      })

    // 3) topic 존재 검사
    const channelsById = reader?.channelsById || new Map()
    for (const [, ch] of channelsById) {
      if (ch?.topic === logTopic) {
        hasTopic = true
        break
      }
    }
    if (!hasTopic) {
      console.warn(`log topic("${logTopic}") not found`)
      return out
    }

    // 4) 스키마 리졸버
    const schemasById =
      reader.schemasById && typeof reader.schemasById.get === 'function' ? reader.schemasById : new Map()

    const schemaResolver = (id) => (id != null ? (schemasById.get(id) ?? null) : null)

    // ⭐ batch buffer (실시간 전달용)
    let batchBuffer = []

    // 5) 메시지 순회
    console.log('start readMessages')

    for await (const msg of reader.readMessages({ topics: [logTopic] })) {
      const tsStr = formatLocal(nsToSec(msg.logTime ?? msg.publishTime))
      const ch = (reader.channelsById || new Map()).get(msg.channelId)

      let line = null
      try {
        const pretty = await tryDecodePayload(msg.data, ch, schemaResolver)
        if (pretty) line = pretty
      } catch (e) {
        console.warn('[mcapLoader] tryDecodePayload failed:', e)
      }

      if (!line) {
        const node = ch?.topic ?? logTopic
        const size = msg.data?.byteLength ?? 0
        line = `[INFO] ${tsStr} ${node}: (payload ${size} bytes)`
      }

      // 전체 저장
      out.push(line)

      // ⭐ 배치 버퍼에 저장
      if (onBatch) {
        batchBuffer.push(line)
        if (batchBuffer.length >= batchSize) {
          onBatch(batchBuffer) // UI로 즉시 전달
          batchBuffer = []
        }
      }

      cnt++
      if (cnt >= maxLines) break
    }

    // 남은 배치 플러시
    if (onBatch && batchBuffer.length > 0) {
      onBatch(batchBuffer)
    }

    console.log('finished readMessages', { lines: out.length })
  } catch (e) {
    console.error('loadLogsFromMcapUrl failed', e)
  } finally {
    console.log('finalize loadLogsFromMcapUrl, out.length =', out.length)
  }

  return out
}

// ===== [REPLACE] 기존 export async function loadPosesFromMcapUrl(...) 전체 교체 =====
export async function loadPosesFromMcapUrl(url, options = {}) {
  const {
    poseTopic = '/carto_service/trackedpose',
    decompressHandlers,
    // 빠른 미리보기(프리뷰) 기본값 - 필요시 옵션으로 조정
    previewLimit = 2000, // 프리뷰로 최대 N개까지만 빠르게 확보
    downsample = 5, // 메시지 밀집시 N개 중 1개만 채택
    maxMillis = 1500, // 프리뷰 시간 상한(ms)
    fullScan = false, // true면 끝까지(배치 yield 포함) 전부 읽음
    onBatch, // (arr) => void  - 읽히는 대로 UI에 추가 그리기
    batchSize = 400, // onBatch 묶음 크기
    timeDownsampleMs = null // t 간격 다운샘플(예: 80ms). null이면 비활성
  } = options

  // 캐시된 reader 사용 (여기서부터 2차,3차 호출도 '바로' 시작)
  const { reader } = await getOrOpenIndexedReaderFromUrl(url, { decompressHandlers })

  const candidates = [
    String(poseTopic).toLowerCase(),
    '/odom',
    '/lio_odom',
    '/aslam_pose',
    '/carto_service/trackedpose'
  ]
  const chosen = findTopicByCandidates(reader, candidates)
  if (!chosen) {
    console.warn('[pose]: hasTopic=false. candidates=', candidates)
    return []
  }
  console.log('[pose]: chosen topic =', chosen)

  const channelsById = reader.channelsById || new Map()
  const schemasById = reader.schemasById || new Map()
  const schemaResolver = (id) => (id != null ? (schemasById.get(id) ?? null) : null)

  const out = []
  let lastTs = -Infinity
  let batch = []

  const pickXYYawDeep = pickPoseAny

  let total = 0,
    accepted = 0
  const startMs = performance.now()
  let idx = 0

  try {
    for await (const msg of reader.readMessages({ topics: [chosen] })) {
      total++

      // (1) 다운샘플(개수 기준)
      if (downsample > 1 && idx++ % downsample !== 0) {
        // 프리뷰 시간 상한만 확인
      } else {
        const tSec = nsToSec(msg.logTime ?? msg.publishTime)

        // (2) 시간 간격 다운샘플(옵션)
        if (timeDownsampleMs != null && Number.isFinite(tSec)) {
          if (lastTs > -Infinity && (tSec - lastTs) * 1000 < timeDownsampleMs) {
            // skip
          } else {
            lastTs = tSec
          }
        }

        // (3) 최소 디코딩
        const ch = channelsById.get(msg.channelId)
        const obj = await tryDecodePayload(msg.data, ch, schemaResolver)

        const pose = obj ? pickXYYawDeep(obj) : null
        if (pose && Number.isFinite(tSec)) {
          const rec = { tSec, x: pose.x, y: pose.y, z: Number(pose.z) || 0, yaw: Number(pose.yaw) || 0 }
          out.push(rec)
          batch.push(rec)
          accepted++

          if (onBatch && batch.length >= batchSize) {
            onBatch(batch)
            batch = []
            // 메인 스레드 양보(첫 화면 빠르게)
            await Promise.resolve()
          }
        }
      }

      const elapsed = performance.now() - startMs
      if (!fullScan && (accepted >= previewLimit || elapsed >= maxMillis)) {
        // 프리뷰 조기 종료
        break
      }
    }
  } catch (e) {
    console.error('P1: readMessages() failed on poseTopic', e)
  }

  if (onBatch && batch.length) onBatch(batch)
  console.log(`pose summary: topic="${chosen}", msgs=${total}, accepted=${accepted}, preview=${!fullScan}`)
  return out
}

/// ===== [REPLACE] 기존 export async function loadPathFromMcapUrl(...) 전체 교체 =====
export async function loadPathFromMcapUrl(url, options = {}) {
  const {
    topic = '/master_service/path',
    decompressHandlers,
    onBatch, // (arr) => void  - 읽히는 대로 전달
    batchSize = 500,
    previewLimit = 8000, // 프리뷰로 미리 그릴 최대 점 개수
    maxMillis = 2000, // 프리뷰 시간 상한
    fullScan = false, // true면 끝까지

    // 🔎 디버그 옵션 추가
    debug = false,
    debugMax = 6, // 처음 N개 메시지까지 세부 로그
    downsample = 1, // (선택) 샘플 수가 과하면 stride
    timeDownsampleMs = 0 // (선택) 시간 간격으로 희소화
  } = options

  const { reader } = await getOrOpenIndexedReaderFromUrl(url, { decompressHandlers })

  // ── 토픽 후보: 원본 + 소문자 + 알려진 별칭
  const topicLC = String(topic)

  const candidates = [
    '/plan',
    '/plan_smoothed',
    '/transformed_global_plan',
    topicLC,
    topicLC.toLowerCase(),
    '/master_service/path',
    '/path',
    '/trajectory',
    '/planned_path'
  ]

  const chosen = findTopicByCandidates(reader, candidates)

  if (!chosen) {
    if (debug) {
      const allTopics = Array.from((reader.channelsById || new Map()).values()).map((ch) => ch.topic)
      console.warn('[PATH] topic not found. candidates=', candidates, 'available=', allTopics)
    }
    return []
  }
  if (debug) console.debug('[PATH] chosen topic =', chosen)

  const channelsById = reader.channelsById || new Map()
  const schemasById = reader.schemasById || new Map()
  const schemaResolver = (id) => (id != null ? (schemasById.get(id) ?? null) : null)

  const out = []
  let batch = []
  const startMs = performance.now()

  function extractItemTimeSec(item, fallback, rootObj, msgTimeSec) {
    const t1 = stampToSec(item?.header?.stamp)
    const t2 = stampToSec(item?.pose?.header?.stamp)
    const tRoot = stampToSec(rootObj?.header?.stamp)
    const t = t1 ?? t2 ?? tRoot ?? null
    return Number.isFinite(t) ? t : Number.isFinite(fallback) ? fallback : msgTimeSec
  }

  // 다양한 모양을 대응하는 포인트 추출기(확장)
  function extractPointsFromAny(obj) {
    if (!obj) return []

    const tryLists = [
      obj.poses,
      obj.path,
      obj.points,
      obj.waypoints,
      obj.nodes,
      obj.trajectory,
      Array.isArray(obj) ? obj : null,
      // 중첩 케이스
      obj?.path?.poses,
      obj?.plan?.poses,
      obj?.planned?.poses,
      obj?.trajectory?.points
    ].filter(Boolean)

    for (const list of tryLists) {
      if (!Array.isArray(list)) continue
      const tmp = []
      for (const item of list) {
        const pos = item?.pose?.pose?.position ?? item?.pose?.position ?? item?.position ?? item?.point ?? null

        if (pos && typeof pos.x === 'number' && typeof pos.y === 'number') {
          tmp.push({ item, x: +pos.x || 0, y: +pos.y || 0, z: +pos.z || 0 })
        } else if (typeof item?.x === 'number' && typeof item?.y === 'number') {
          tmp.push({ item, x: +item.x || 0, y: +item.y || 0, z: +item.z || 0 })
        }
      }
      if (tmp.length) return tmp
    }

    // 단일 객체에 좌표가 있는 경우
    const pos = obj?.pose?.pose?.position ?? obj?.pose?.position ?? obj?.position ?? obj?.point ?? null

    if (pos && typeof pos.x === 'number' && typeof pos.y === 'number') {
      return [{ item: obj, x: +pos.x || 0, y: +pos.y || 0, z: +pos.z || 0 }]
    }
    if (typeof obj?.x === 'number' && typeof obj?.y === 'number') {
      return [{ item: obj, x: +obj.x || 0, y: +obj.y || 0, z: +obj.z || 0 }]
    }

    return []
  }

  function safePreview(o) {
    try {
      if (!o || typeof o !== 'object') return String(o)
      const keys = Object.keys(o).slice(0, 20)
      const prev = {}
      for (const k of keys) prev[k] = typeof o[k]
      return { keys, types: prev }
    } catch {
      return typeof o
    }
  }

  // 시간 기반 다운샘플 보조
  let lastKeptTimeSec = -Infinity
  function timePass(t) {
    if (!Number.isFinite(timeDownsampleMs) || timeDownsampleMs <= 0) return true
    const ok = (t - lastKeptTimeSec) * 1000 >= timeDownsampleMs
    if (ok) lastKeptTimeSec = t
    return ok
  }

  let totalMsgs = 0,
    keptCount = 0
  try {
    if (debug) {
      // 토픽 메타 요약
      const anyCh = Array.from(channelsById.values()).find((c) => c.topic === chosen)
      const sch = schemaResolver(anyCh?.schemaId)
      console.debug('[PATH] channel meta =', {
        topic: chosen,
        channelId: anyCh?.id ?? anyCh?.channelId,
        messageEncoding: anyCh?.messageEncoding,
        schemaId: anyCh?.schemaId,
        schemaName: sch?.name,
        schemaEncoding: sch?.encoding
      })
    }

    for await (const msg of reader.readMessages({ topics: [chosen] })) {
      totalMsgs++
      const msgTimeSec = nsToSec(msg.logTime ?? msg.publishTime)
      const ch = channelsById.get(msg.channelId)
      const schema = schemaResolver(ch?.schemaId)

      if (debug && totalMsgs <= debugMax) {
        console.debug('PATH check #msg:', totalMsgs, {
          channelId: msg.channelId,
          topic: ch?.topic,
          messageEncoding: ch?.messageEncoding,
          schemaName: schema?.name,
          schemaEncoding: schema?.encoding,
          dataLen: msg.data?.byteLength ?? msg.data?.length ?? 0
        })
      }

      const obj = await tryDecodePayload(msg.data, ch, schemaResolver)
      if (debug && totalMsgs <= debugMax && !obj) {
        // 기존 debug 동작 유지(내용만 간단화)
        try {
          const s = textDecoder?.decode?.(msg.data)
          console.debug('[PATH] utf8 head:', s?.slice?.(0, 120))
        } catch {}
      }

      if (debug && totalMsgs <= debugMax) {
        console.debug('PATH check obj preview:', safePreview(obj))
      }

      let pts = extractPointsFromAny(obj)
      if (!pts.length) {
        // 흔한 중첩 키들 한번 더 시도
        pts =
          extractPointsFromAny(obj?.path) ||
          extractPointsFromAny(obj?.plan) ||
          extractPointsFromAny(obj?.planned) ||
          extractPointsFromAny(obj?.trajectory) ||
          []
      }

      if (debug && totalMsgs <= debugMax) {
        console.debug('PATH check pts len:', pts.length)
      }

      if (pts.length) {
        // (옵션) stride 다운샘플
        let stride = Math.max(1, Math.floor(downsample || 1))
        let k = 0
        for (const r of pts) {
          // 시간 결정
          const tSec = extractItemTimeSec(r.item, null, obj, msgTimeSec) ?? msgTimeSec ?? 0
          if (!Number.isFinite(tSec)) continue

          // 시간기반 다운샘플
          if (!timePass(tSec)) continue

          // stride
          if (k++ % stride !== 0) continue

          const rec = { tSec, x: r.x, y: r.y, z: r.z }
          out.push(rec)
          batch.push(rec)
          keptCount++

          if (onBatch && batch.length >= batchSize) {
            try {
              onBatch(batch)
            } catch (e) {
              if (debug) console.warn('[PATH] onBatch error:', e)
            }
            batch = []
            await Promise.resolve() // 메인 스레드 양보
          }
        }
      }

      // 프리뷰 상한(시간/개수) 도달 시 조기 종료
      if (!fullScan) {
        const elapsed = performance.now() - startMs
        if (out.length >= previewLimit || elapsed >= maxMillis) break
      }
    }
  } catch (e) {
    console.warn('[PATH] readMessages failed:', e)
  }

  if (onBatch && batch.length) {
    try {
      onBatch(batch)
    } catch (e) {
      if (debug) console.warn('[PATH] final onBatch error:', e)
    }
  }

  if (debug) {
    console.debug(`[PATH] done: msgs=${totalMsgs}, points=${out.length}, kept=${keptCount}`)
  }
  return out
}

export async function loadOccupancyGridFromMcapUrl(
  url,
  {
    topic = '/carto_service/occupancygrid',
    decompressHandlers,
    // 선택 전략: 점수 기반이므로 기본은 'score'로 두되, 'first'도 지원
    select = 'first', // 'first' | 'latest'
    maxMessages = 1200,
    VERBOSE = false
  } = {}
) {
  const { reader } = await getOrOpenIndexedReaderFromUrl(url, { decompressHandlers })

  const chosenTopic = pickOccupancyGridTopic(reader)
  if (!chosenTopic) {
    console.warn('[GRID]: no candidate topic found. available:', listAllChannels(reader))
    return null
  }
  console.log('[GRID]: chosen topic =', chosenTopic)

  const channelsById = reader.channelsById || new Map()
  const schemasById = reader.schemasById || new Map()
  const schemaResolver = (id) => (id != null ? (schemasById.get(id) ?? null) : null)

  // 스키마 디코더 준비
  let gridDecoder = null
  try {
    const ch = [...channelsById.values()].find((c) => c.topic === chosenTopic)
    const sch = ch?.schemaId != null ? schemasById.get(ch.schemaId) : null
    if (sch) {
      gridDecoder = await buildDecoderForSchema(sch)
      if (VERBOSE) console.log('[GRID]: schema-decoder ready:', { schemaName: sch?.name, encoding: sch?.encoding })
    }
  } catch (e) {
    console.warn('[GRID]: buildDecoderForSchema failed -> fallback to generic decode', e)
  }

  // 유틸
  const toYawRad = (y) => {
    let yaw = Number(y) || 0
    if (Math.abs(yaw) > Math.PI * 2) yaw = (yaw * Math.PI) / 180 // deg -> rad
    return yaw
  }

  function normalizeGrid(obj) {
    return obj ? normalizeOccupancyGrid(obj) : null
  }

  // 토픽 성격

  // 후보 누적: 빈/손상 프레임 제외, 나머지는 점수 산정
  let firstValid = null
  let lastValid = null
  let count = 0

  try {
    for await (const msg of reader.readMessages({ topics: [chosenTopic] })) {
      const ch = channelsById.get(msg.channelId)
      const obj = await decodeMsgToObject(msg, ch, schemaResolver, { decoder: gridDecoder, tryUtf8Json: true })

      const grid = normalizeGrid(obj)
      count++

      if (!grid) {
        // 필요 시 VERBOSE에서만 상세 로그
      } else {
        // 타임스탬프(초) & 최근성
        if (!firstValid) firstValid = grid
        lastValid = grid
        if (select === 'first') break
      }

      if (count >= maxMessages) break
    }
  } catch (e) {
    console.warn('[GRID] readMessages failed:', e)
  }

  // 최종 선택: best -> firstValid -> null
  const resultGrid = select === 'latest' ? (lastValid ?? firstValid) : (firstValid ?? lastValid)
  if (!resultGrid) {
    console.warn('[GRID]: no valid OccupancyGrid on topic:', chosenTopic)
  }
  return resultGrid
}

// ===== [ADD] LaserScan → 지도(XY) 렌더 전용 경량 스트리밍 로더 =====
/**
 * LaserScan(또는 유사) 토픽을 읽어 지도에 바로 뿌릴 수 있는 XY 포인트로 정규화한다.
 *
 * 출력 항목(프레임 단위):
 *   { tSec, xy: Float32Array, count: number, frameId: string }
 *     - xy: [x0,y0, x1,y1, ...] (미터 단위 가정)
 *     - count: 포인트 개수 (xy.length / 2)
 *
 * 성능 옵션:
 *   - timeDownsampleMs: 프레임 간 시간 희소화 (기본 80ms)
 *   - pointDownsample : 포인트 stride (기본 2 → 1/2로 다운샘플)
 *   - clampToRange    : [range_min, range_max] 바깥값 스킵
 *
 * 주의:
 *   - angles[]가 있으면 이를 우선 사용(스크린샷 케이스).
 *   - angles[]가 없고 angle_increment==0 이면 XY 계산 불가 → 프레임 스킵.
 */
export async function loadLaserScansForMapFromMcapUrl(url, options = {}) {
  const {
    topic = '/lidar_service/data',
    decompressHandlers,

    // 스트리밍/범위
    onBatch, // (arr: {tSec, xy:Float32Array, count:number, frameId?:string}[]) => void
    batchSize = 1,
    fullScan = true,
    previewLimit = Infinity,
    maxMillis = Infinity,

    // 성능/정확도
    timeDownsampleMs = 80, // 프레임 간격(ms). 0/음수면 비활성
    pointDownsample = 2, // 1=원본, 2=반으로, 3=1/3 ...
    clampToRange = true // true면 range_min~range_max 밖 값 스킵
  } = options

  // 1) 캐시된 IndexedReader 사용
  const { reader } = await getOrOpenIndexedReaderFromUrl(url, { decompressHandlers })

  // 2) 토픽 선택(우선순위)
  const candidates = [String(topic).toLowerCase(), '/lidar_service/data', '/scan', '/laser', '/laser_scan']
  const chosen = findTopicByCandidates(reader, candidates)
  if (!chosen) {
    console.warn('[LIDAR][MAP] topic not found. candidates=', candidates)
    return []
  }
  console.log('[LIDAR][MAP] chosen topic =', chosen)

  const channelsById = reader.channelsById || new Map()
  const schemasById = reader.schemasById || new Map()
  const schemaResolver = (id) => (id != null ? (schemasById.get(id) ?? null) : null)

  // ── 내부 유틸 ────────────────────────────────────────────────────────
  // 다양한 스키마를 폭넓게 수용하는 정규화 (ranges/angles/메타만 추출)
  function normalizeRawScan(obj) {
    if (!obj || typeof obj !== 'object') return null

    // 흔한 키들: 직접 또는 scan 래핑
    const root = obj.scan && typeof obj.scan === 'object' ? obj.scan : obj
    let ranges = root.ranges
    let angles = root.angles

    // ── [FIX] 다양한 입력을 Float32Array로 정규화 ─────────────────────────
    // 1) TypedArray/Array/ArrayBuffer view
    // 2) numeric-key object (예: { "0": 0.1, "1": 0.2, ... })
    const asF32 = (a) => {
      if (a == null) return null
      if (a instanceof Float32Array) return a
      if (Array.isArray(a)) return Float32Array.from(a)
      if (ArrayBuffer.isView(a)) return new Float32Array(a.buffer, a.byteOffset, a.byteLength / 4)
      if (typeof a === 'object') {
        // numeric-key object 지원
        // 키들 중 숫자로 캐스팅 가능한 것만 골라서 오름차순 정렬
        const keys = Object.keys(a)
          .map((k) => {
            const n = Number(k)
            return Number.isFinite(n) ? n : null
          })
          .filter((n) => n != null)
          .sort((x, y) => x - y)
        if (keys.length === 0) return null
        const out = new Float32Array(keys.length)
        for (let i = 0; i < keys.length; i++) {
          const v = a[keys[i]]
          out[i] = Number(v) // NaN이면 0으로 들어가도 무방(필요시 필터 가능)
        }
        return out
      }
      return null
    }

    const fRanges = asF32(ranges)
    const fAngles = asF32(angles)

    // angle 메타
    const angle_min = Number(root.angle_min ?? 0)
    const angle_increment = Number(root.angle_increment ?? 0)

    // range 메타
    const range_min = Number(root.range_min ?? 0)
    const range_max = Number(root.range_max ?? Number.POSITIVE_INFINITY)

    // frame_id
    const frame_id = String(root?.header?.frame_id ?? obj?.header?.frame_id ?? 'laser')

    if (!(fRanges && fRanges.length)) {
      // 디버깅 힌트
      console.warn('[LIDAR][MAP] normalizeRawScan: ranges missing/empty. type=', typeof ranges)
      return null
    }

    return {
      ranges: fRanges,
      angles: fAngles, // 없을 수 있음
      angle_min,
      angle_increment,
      range_min,
      range_max,
      frame_id
    }
  }

  // angle_min + angle_increment 기반으로 각도 배열 생성
  function makeAngles(min, inc, n) {
    const out = new Float32Array(n)
    for (let i = 0, a = min; i < n; i++, a += inc) out[i] = a
    return out
  }

  // cos/sin 프리컴퓨트
  function precomputeCosSin(angles) {
    const n = angles.length
    const cos = new Float32Array(n)
    const sin = new Float32Array(n)
    for (let i = 0; i < n; i++) {
      const a = angles[i]
      cos[i] = Math.cos(a)
      sin[i] = Math.sin(a)
    }
    return { cos, sin }
  }

  // stride/클램프 적용 XY 변환(가능하면 cos/sin 캐시 사용)
  function toXYFast({ ranges, angles, cos, sin, range_min, range_max, stride, clamp }) {
    const n = ranges.length
    const cap = Math.ceil(n / Math.max(1, stride)) * 2
    const xy = new Float32Array(cap)
    let k = 0

    for (let i = 0; i < n; i += stride) {
      const r = ranges[i]
      if (clamp) {
        if (!(r >= range_min && r <= range_max)) continue
      }
      let x, y
      if (cos && sin) {
        x = r * cos[i]
        y = r * sin[i]
      } else {
        const a = angles[i]
        x = r * Math.cos(a)
        y = r * Math.sin(a)
      }
      xy[k++] = x
      xy[k++] = y
    }
    return k === xy.length ? xy : xy.subarray(0, k)
  }

  // ── 변환 캐시(angles 고정 시 1회만 trig) ────────────────────────────
  let cachedAngles = null // Float32Array
  let cachedCos = null
  let cachedSin = null
  let lastAnglesKey = '' // "len:first:last" 대충 서명

  function getAnglesAndMaybePrecompute(raw) {
    // 1) 프레임에 angles[]가 오면 그것 사용 (대개 스크린샷 케이스)
    if (raw.angles && raw.angles.length === raw.ranges.length) {
      const a = raw.angles
      const key = `${a.length}:${a[0]?.toFixed?.(6)}:${a[a.length - 1]?.toFixed?.(6)}`
      if (key !== lastAnglesKey) {
        const { cos, sin } = precomputeCosSin(a)
        cachedAngles = a
        cachedCos = cos
        cachedSin = sin
        lastAnglesKey = key
      }
      return { angles: cachedAngles, cos: cachedCos, sin: cachedSin }
    }

    // 2) angles[]가 없으면 angle_min + angle_increment 사용
    if (raw.angle_increment === 0) {
      // 각도 계산 불가 → 이 프레임은 스킵하는 게 안전
      return { angles: null, cos: null, sin: null }
    }

    // 길이 고정 가정 시 1회 생성 캐시
    if (!cachedAngles || cachedAngles.length !== raw.ranges.length) {
      cachedAngles = makeAngles(raw.angle_min, raw.angle_increment, raw.ranges.length)
      const pcs = precomputeCosSin(cachedAngles)
      cachedCos = pcs.cos
      cachedSin = pcs.sin
      lastAnglesKey = `${cachedAngles.length}:${cachedAngles[0]?.toFixed?.(6)}:${cachedAngles[cachedAngles.length - 1]?.toFixed?.(6)}`
    }
    return { angles: cachedAngles, cos: cachedCos, sin: cachedSin }
  }

  // ── 메인 루프 ──────────────────────────────────────────────────────
  const out = []
  let batch = []
  const startMs = performance.now()
  let lastKeptSec = -Infinity
  let frames = 0

  try {
    for await (const msg of reader.readMessages({ topics: [chosen] })) {
      const tSec = nsToSec(msg.logTime ?? msg.publishTime)

      // 시간 다운샘플
      if (Number.isFinite(timeDownsampleMs) && timeDownsampleMs > 0) {
        if ((tSec - lastKeptSec) * 1000 < timeDownsampleMs) continue
        lastKeptSec = tSec
      }

      // 디코드
      const ch = channelsById.get(msg.channelId)
      const obj = await decodeMsgToObject(msg, ch, schemaResolver, { tryUtf8Json: true })

      const raw = normalizeRawScan(obj)
      if (!raw) continue

      const { angles, cos, sin } = getAnglesAndMaybePrecompute(raw)
      if (!angles) {
        // angles[] 도 없고 angle_increment==0 → 계산 불가
        // (스크린샷의 케이스는 angles[]가 있어서 통과)
        continue
      }

      const stride = Math.max(1, pointDownsample | 0)
      const xy = toXYFast({
        ranges: raw.ranges,
        angles,
        cos,
        sin,
        range_min: raw.range_min,
        range_max: raw.range_max,
        stride,
        clamp: !!clampToRange
      })

      const rec = {
        tSec,
        xy, // Float32Array [x0,y0, x1,y1, ...]
        count: xy.length / 2,
        frameId: raw.frame_id
      }

      out.push(rec)
      batch.push(rec)
      frames++

      if (onBatch && batch.length >= batchSize) {
        try {
          onBatch(batch)
        } catch (e) {
          console.warn('[LIDAR][MAP] onBatch error:', e)
        }
        batch = []
        // 메인 스레드 잠깐 양보 → UI 부드럽게
        await Promise.resolve()
      }

      // 프리뷰 조기 종료
      const elapsed = performance.now() - startMs
      if (!fullScan && (frames >= previewLimit || elapsed >= maxMillis)) break
    }
  } catch (e) {
    console.warn('[LIDAR][MAP] readMessages failed:', e)
  }

  if (onBatch && batch.length) {
    try {
      onBatch(batch)
    } catch {}
  }

  return out
}
// ===== [ADD] Local Costmap (OccupancyGrid) time-series streaming loader =====
/**
 * 로컬 코스트맵(OccupancyGrid)을 시간 순서대로 스트리밍하여 프레임 배열을 전달한다.
 * onBatch: (arr: { tSec:number, grid: {width,height,resolution,origin:{x,y,yaw},data:Uint8Array}, frameId?:string }[]) => void
 */
export async function loadLocalCostmapSeriesFromMcapUrl(url, options = {}) {
  const {
    // 대표 local costmap (ROS 표준)
    topic = '/local_costmap/costmap',
    decompressHandlers,
    onBatch, // (arr) => void
    batchSize = 1, // 프레임 단위
    fullScan = true,
    previewLimit = Infinity,
    maxMillis = Infinity,
    // 시간 희소화(선택)
    timeDownsampleMs = 0,
    // 디버그
    VERBOSE = false,
    // 🔄 시간 기준 선택(기본: logTime) — 필요 시 'header'로 바꿔 재현/검증 가능
    timeSource = 'logTime' // 'logTime' | 'header'
  } = options

  const { reader } = await getOrOpenIndexedReaderFromUrl(url, { decompressHandlers })
  const candidates = [
    String(topic).toLowerCase(),
    '/local_costmap/costmap',
    '/debug/dwa_local_costmap',
    // 기존 느슨한 후보는 유지(호환 목적)
    '/local_costmap',
    '/costmap'
  ]

  const chosen = findTopicByCandidates(reader, candidates)
  if (!chosen) {
    console.warn('[LCM-SERIES] topic not found. candidates=', candidates)
    return []
  }
  if (VERBOSE) console.log('[LCM-SERIES] chosen topic =', chosen)

  const channelsById = reader.channelsById || new Map()
  const schemasById = reader.schemasById || new Map()
  const schemaResolver = (id) => (id != null ? (schemasById.get(id) ?? null) : null)

  // decode helper (schema decoder 있으면 사용)
  let decoder = null
  try {
    const anyCh = Array.from(channelsById.values()).find((c) => c.topic === chosen)
    const sch = anyCh?.schemaId != null ? schemasById.get(anyCh.schemaId) : null
    if (sch) decoder = await buildDecoderForSchema(sch)
  } catch {}

  const out = []
  let batch = []
  let frames = 0
  let lastKeptSec = -Infinity
  const startMs = performance.now()

  try {
    for await (const msg of reader.readMessages({ topics: [chosen] })) {
      const msgSec = nsToSec(msg.logTime ?? msg.publishTime)

      // 시간 희소화
      if (Number.isFinite(timeDownsampleMs) && timeDownsampleMs > 0) {
        if ((msgSec - lastKeptSec) * 1000 < timeDownsampleMs) continue
        lastKeptSec = msgSec
      }

      // schema decoder 우선
      // generic
      const ch = channelsById.get(msg.channelId)
      const obj = await decodeMsgToObject(msg, ch, schemaResolver, { decoder, tryUtf8Json: false })
      // 최후의 수단: utf8 -> JSON
      if (!obj) continue

      const grid = normalizeOccupancyGrid(obj)
      if (!grid) continue

      // tSec 결정: ✅ 기본은 msg.logTime(=재생 시작 기준 상대 시간) 우선
      const tMsg = nsToSec(msg.logTime ?? msg.publishTime)
      const tHeader = stampToSec(obj?.header?.stamp) ?? stampToSec(obj?.info?.header?.stamp)
      let tSec = null
      if (timeSource === 'header') {
        tSec = Number.isFinite(tHeader) ? tHeader : tMsg
      } else {
        tSec = Number.isFinite(tMsg) ? tMsg : tHeader
      }
      if (!Number.isFinite(tSec)) continue

      // (선택) 디버깅: header vs msg 시간차가 큰 로그를 알림
      if (VERBOSE && Number.isFinite(tMsg) && Number.isFinite(tHeader)) {
        const gap = Math.abs(tHeader - tMsg)
        if (gap > 5) {
          console.warn('[LCM-SERIES] time gap(header - logTime)=', gap.toFixed(3), 'sec', {
            topic: chosen,
            tMsg,
            tHeader
          })
        }
      }

      if (!Number.isFinite(tSec)) continue

      const rec = { tSec, grid }
      out.push(rec)
      batch.push(rec)
      frames++

      if (onBatch && batch.length >= batchSize) {
        try {
          onBatch(batch)
        } catch (e) {
          if (VERBOSE) console.warn('[LCM-SERIES] onBatch error', e)
        }
        batch = []
        await Promise.resolve()
      }

      // 프리뷰 조기종료
      const elapsed = performance.now() - startMs
      if (!fullScan && (frames >= previewLimit || elapsed >= maxMillis)) break
    }
  } catch (e) {
    console.warn('[LCM-SERIES] readMessages failed:', e)
  }

  if (onBatch && batch.length) {
    try {
      onBatch(batch)
    } catch {}
  }
  return out
}
// ===== [ADD] DWA Goal (PoseStamped 계열) time-series streaming loader =====
/**
 * /debug/dwa_goal 같은 goal 포즈를 시간 순서대로 스트리밍한다.
 * 출력 항목:
 *   { tSec:number, x:number, y:number, z:number, yaw:number, frame_id?:string }
 *
 * 옵션:
 *   - topic: 기본 '/debug/dwa_goal'
 *   - timeDownsampleMs: 시간 간 희소화(기본 0=비활성)
 *   - timeSource: 'logTime' | 'header' (기본 'logTime')
 *   - onBatch, batchSize: 스트리밍 콜백
 *   - fullScan/previewLimit/maxMillis: 프리뷰 제어
 */
export async function loadDwaGoalSeriesFromMcapUrl(url, options = {}) {
  const {
    // 대표 goal (ROS 표준)
    topic = '/goal_pose',
    decompressHandlers,
    onBatch, // (arr) => void
    batchSize = 1, // goal은 프레임 단위로 1개씩 내려주는게 일반적
    fullScan = true,
    previewLimit = Infinity,
    maxMillis = Infinity,
    timeDownsampleMs = 0,
    timeSource = 'logTime', // 'header'로 바꾸면 header.stamp 우선
    VERBOSE = false
  } = options

  const { reader } = await getOrOpenIndexedReaderFromUrl(url, { decompressHandlers })
  const candidates = [
    String(topic).toLowerCase(),
    '/goal_pose',
    '/debug/dwa_goal',
    '/dwa_goal',
    '/goal',
    '/move_base_simple/goal'
  ]

  const chosen = findTopicByCandidates(reader, candidates)
  if (!chosen) {
    if (VERBOSE) console.warn('[DWA-GOAL] topic not found. candidates=', candidates)
    return []
  }
  if (VERBOSE) console.log('[DWA-GOAL] chosen topic =', chosen)

  const channelsById = reader.channelsById || new Map()
  const schemasById = reader.schemasById || new Map()
  const schemaResolver = (id) => (id != null ? (schemasById.get(id) ?? null) : null)

  // ---- pose 추출 유틸 (loadPosesFromMcapUrl과 동일한 접근을 경량 복사) ----
  const pickXYYawDeep = pickPose2dStamped
  function extractFrameId(obj) {
    return (
      String(obj?.header?.frame_id ?? obj?.pose?.header?.frame_id ?? obj?.goal?.header?.frame_id ?? '') || undefined
    )
  }

  const out = []
  let batch = []
  const startMs = performance.now()
  let lastKeptSec = -Infinity
  let frames = 0

  try {
    for await (const msg of reader.readMessages({ topics: [chosen] })) {
      const tMsg = nsToSec(msg.logTime ?? msg.publishTime)

      // 시간 희소화
      if (Number.isFinite(timeDownsampleMs) && timeDownsampleMs > 0) {
        if ((tMsg - lastKeptSec) * 1000 < timeDownsampleMs) continue
        lastKeptSec = tMsg
      }

      // 디코드
      const ch = channelsById.get(msg.channelId)
      const obj = await decodeMsgToObject(msg, ch, schemaResolver, { tryUtf8Json: false })
      if (!obj) continue

      const pose = pickXYYawDeep(obj)
      if (!pose) continue

      const tHeader =
        stampToSec(obj?.header?.stamp) ??
        stampToSec(obj?.pose?.header?.stamp) ??
        stampToSec(obj?.goal?.header?.stamp) ??
        null
      const tSec =
        timeSource === 'header' ? (Number.isFinite(tHeader) ? tHeader : tMsg) : Number.isFinite(tMsg) ? tMsg : tHeader
      if (!Number.isFinite(tSec)) continue

      const frame_id = extractFrameId(obj)
      const rec = { tSec, x: pose.x, y: pose.y, z: Number(pose.z) || 0, yaw: Number(pose.yaw) || 0, frame_id }
      out.push(rec)
      batch.push(rec)
      frames++

      if (onBatch && batch.length >= batchSize) {
        try {
          onBatch(batch)
        } catch {}
        batch = []
        await Promise.resolve()
      }

      // 프리뷰 종료 조건
      if (!fullScan) {
        const elapsed = performance.now() - startMs
        if (frames >= previewLimit || elapsed >= maxMillis) break
      }
    }
  } catch (e) {
    if (VERBOSE) console.warn('[DWA-GOAL] readMessages failed:', e)
  }

  if (onBatch && batch.length) {
    try {
      onBatch(batch)
    } catch {}
  }
  return out
}
// ===== [ADD] Replay 전용: pose/grid/path/lidar/costmap/goal/rosout를 1-pass로 fan-out =====
export async function scanReplayAllOnceFromMcapUrl(url, options = {}) {
  const {
    decompressHandlers,

    // topic candidates (기본값은 useLogReplayData TOPICS와 호환)
    poseCandidates = ['/carto_service/trackedpose', '/odom', '/lio_odom', '/aslam_pose'],
    pathCandidates = ['/master_service/path', '/plan', '/transformed_global_plan', '/planned_path', '/path'],
    lidarCandidates = ['/lidar_service/data', '/scan', '/laser', '/laser_scan'],
    costmapCandidates = ['/local_costmap/costmap', '/debug/dwa_local_costmap', '/local_costmap', '/costmap'],
    goalCandidates = ['/debug/dwa_goal', '/goal_pose', '/move_base_simple/goal', '/goal'],
    rosoutCandidates = ['/rosout'],
    gridCandidates = null, // null이면 pickOccupancyGridTopic 사용

    // streaming callbacks
    onPoseBatch, // (arr: {tSec,x,y,z,yaw}[]) => void
    onPathBatch, // (arr: {tSec,x,y,z}[]) => void
    onLidarBatch, // (arr: {tSec,xy,count,frameId}[]) => void
    onCostmapBatch, // (arr: {tSec,grid}[]) => void
    onGoalBatch, // (arr: {tSec,x,y,z,yaw,frame_id?}[]) => void
    onLogBatch, // (lines: string[]) => void
    onGridOnce, // (grid) => void

    // perf knobs
    poseTimeDownsampleMs = 80,
    poseDownsample = 3,
    poseBatchSize = 400,

    pathStride = 1,
    pathBatchSize = 1000,

    lidarTimeDownsampleMs = 80,
    lidarPointDownsample = 2,
    lidarClampToRange = true,
    lidarBatchSize = 1,

    costmapTimeDownsampleMs = 80,
    costmapTimeSource = 'logTime', // 'logTime' | 'header'
    costmapBatchSize = 1,

    goalTimeDownsampleMs = 0,
    goalTimeSource = 'logTime', // 'logTime' | 'header'
    goalBatchSize = 1,

    logMaxLines = 20000,
    logBatchSize = 80
  } = options

  const { reader } = await getOrOpenIndexedReaderFromUrl(url, { decompressHandlers })

  // ──────────────────────────────────────────────────────────────
  // 1) 토픽 선택(스캔 시작 전 1회)
  // ──────────────────────────────────────────────────────────────
  const poseChosen = findTopicByCandidates(
    reader,
    poseCandidates.map((s) => String(s).toLowerCase())
  )
  const pathChosen = findTopicByCandidates(
    reader,
    pathCandidates.map((s) => String(s).toLowerCase())
  )
  const lidarChosen = findTopicByCandidates(
    reader,
    lidarCandidates.map((s) => String(s).toLowerCase())
  )
  const costmapChosen = findTopicByCandidates(
    reader,
    costmapCandidates.map((s) => String(s).toLowerCase())
  )
  const goalChosen = findTopicByCandidates(
    reader,
    goalCandidates.map((s) => String(s).toLowerCase())
  )
  const rosoutChosen = findTopicByCandidates(
    reader,
    rosoutCandidates.map((s) => String(s).toLowerCase())
  )

  const gridChosen = gridCandidates
    ? findTopicByCandidates(
        reader,
        gridCandidates.map((s) => String(s).toLowerCase())
      )
    : pickOccupancyGridTopic(reader)

  const topics = [poseChosen, pathChosen, lidarChosen, costmapChosen, goalChosen, rosoutChosen, gridChosen]
    .filter(Boolean)
    .filter((v, i, a) => a.indexOf(v) === i)

  // 스캔할 토픽이 하나도 없으면 종료
  if (!topics.length) {
    console.warn('[scanReplayAllOnceFromMcapUrl] no topics selected')
    return
  }

  const channelsById = reader.channelsById || new Map()
  const schemasById = reader.schemasById || new Map()
  const schemaResolver = (id) => (id != null ? (schemasById.get(id) ?? null) : null)

  // ──────────────────────────────────────────────────────────────
  // 2) schema decoder 캐시 (schemaId -> Promise<decoder|null>)
  // ──────────────────────────────────────────────────────────────
  const decoderPromiseBySchemaId = new Map()
  async function getDecoderForChannel(ch) {
    const sid = ch?.schemaId
    if (sid == null) return null
    if (!decoderPromiseBySchemaId.has(sid)) {
      const sch = schemaResolver(sid)
      decoderPromiseBySchemaId.set(sid, sch ? buildDecoderForSchema(sch).catch(() => null) : Promise.resolve(null))
    }
    return await decoderPromiseBySchemaId.get(sid)
  }

  // ──────────────────────────────────────────────────────────────
  // 3) 유틸(로컬 함수들)
  // ──────────────────────────────────────────────────────────────
  const stampOrMsgToSec = (obj, msgSec) => {
    const tHeader =
      stampToSec(obj?.header?.stamp) ?? stampToSec(obj?.pose?.header?.stamp) ?? stampToSec(obj?.info?.header?.stamp)
    return Number.isFinite(tHeader) ? tHeader : msgSec
  }

  // PATH: 다양한 형태에서 포인트 추출
  function extractPathPointsAny(obj) {
    if (!obj) return []
    const tryLists = [
      obj.poses,
      obj.path,
      obj.points,
      obj.waypoints,
      obj.nodes,
      obj.trajectory,
      Array.isArray(obj) ? obj : null,
      obj?.path?.poses,
      obj?.plan?.poses,
      obj?.planned?.poses,
      obj?.trajectory?.points
    ].filter(Boolean)

    for (const list of tryLists) {
      if (!Array.isArray(list)) continue
      const tmp = []
      for (const item of list) {
        const pos = item?.pose?.pose?.position ?? item?.pose?.position ?? item?.position ?? item?.point ?? null
        if (pos && typeof pos.x === 'number' && typeof pos.y === 'number') {
          tmp.push({ x: +pos.x || 0, y: +pos.y || 0, z: +pos.z || 0 })
        } else if (typeof item?.x === 'number' && typeof item?.y === 'number') {
          tmp.push({ x: +item.x || 0, y: +item.y || 0, z: +item.z || 0 })
        }
      }
      if (tmp.length) return tmp
    }
    return []
  }

  // LIDAR: normalize + trig cache
  function normalizeRawScan(obj) {
    if (!obj || typeof obj !== 'object') return null
    const root = obj.scan && typeof obj.scan === 'object' ? obj.scan : obj

    const asF32 = (a) => {
      if (a == null) return null
      if (a instanceof Float32Array) return a
      if (Array.isArray(a)) return Float32Array.from(a)
      if (ArrayBuffer.isView(a)) return new Float32Array(a.buffer, a.byteOffset, a.byteLength / 4)
      if (typeof a === 'object') {
        const keys = Object.keys(a)
          .map((k) => (Number.isFinite(Number(k)) ? Number(k) : null))
          .filter((n) => n != null)
          .sort((x, y) => x - y)
        if (!keys.length) return null
        const out = new Float32Array(keys.length)
        for (let i = 0; i < keys.length; i++) out[i] = Number(a[keys[i]])
        return out
      }
      return null
    }

    const ranges = asF32(root.ranges)
    if (!ranges || !ranges.length) return null

    const angles = asF32(root.angles)

    return {
      ranges,
      angles,
      angle_min: Number(root.angle_min ?? 0),
      angle_increment: Number(root.angle_increment ?? 0),
      range_min: Number(root.range_min ?? 0),
      range_max: Number(root.range_max ?? Number.POSITIVE_INFINITY),
      frame_id: String(root?.header?.frame_id ?? obj?.header?.frame_id ?? 'laser')
    }
  }

  const makeAngles = (min, inc, n) => {
    const out = new Float32Array(n)
    for (let i = 0, a = min; i < n; i++, a += inc) out[i] = a
    return out
  }
  const precomputeCosSin = (angles) => {
    const n = angles.length
    const cos = new Float32Array(n)
    const sin = new Float32Array(n)
    for (let i = 0; i < n; i++) {
      const a = angles[i]
      cos[i] = Math.cos(a)
      sin[i] = Math.sin(a)
    }
    return { cos, sin }
  }
  const toXYFast = ({ ranges, angles, cos, sin, range_min, range_max, stride, clamp }) => {
    const n = ranges.length
    const cap = Math.ceil(n / Math.max(1, stride)) * 2
    const xy = new Float32Array(cap)
    let k = 0
    for (let i = 0; i < n; i += stride) {
      const r = ranges[i]
      if (clamp && !(r >= range_min && r <= range_max)) continue
      let x, y
      if (cos && sin) {
        x = r * cos[i]
        y = r * sin[i]
      } else {
        const a = angles[i]
        x = r * Math.cos(a)
        y = r * Math.sin(a)
      }
      xy[k++] = x
      xy[k++] = y
    }
    return k === xy.length ? xy : xy.subarray(0, k)
  }

  let cachedAngles = null
  let cachedCos = null
  let cachedSin = null
  let lastAnglesKey = ''
  function getAnglesAndMaybePrecompute(raw) {
    if (raw.angles && raw.angles.length === raw.ranges.length) {
      const a = raw.angles
      const key = `${a.length}:${a[0]?.toFixed?.(6)}:${a[a.length - 1]?.toFixed?.(6)}`
      if (key !== lastAnglesKey) {
        const { cos, sin } = precomputeCosSin(a)
        cachedAngles = a
        cachedCos = cos
        cachedSin = sin
        lastAnglesKey = key
      }
      return { angles: cachedAngles, cos: cachedCos, sin: cachedSin }
    }
    if (raw.angle_increment === 0) return { angles: null, cos: null, sin: null }
    if (!cachedAngles || cachedAngles.length !== raw.ranges.length) {
      cachedAngles = makeAngles(raw.angle_min, raw.angle_increment, raw.ranges.length)
      const pcs = precomputeCosSin(cachedAngles)
      cachedCos = pcs.cos
      cachedSin = pcs.sin
      lastAnglesKey = `${cachedAngles.length}:${cachedAngles[0]?.toFixed?.(6)}:${cachedAngles[cachedAngles.length - 1]?.toFixed?.(6)}`
    }
    return { angles: cachedAngles, cos: cachedCos, sin: cachedSin }
  }

  // ──────────────────────────────────────────────────────────────
  // 4) 스트리밍 상태(배치/다운샘플)
  // ──────────────────────────────────────────────────────────────
  let poseIdx = 0
  let poseLastKept = -Infinity
  let poseBatch = []

  let pathStrideK = 0
  let pathBatch = []

  let lidarLastKept = -Infinity
  let lidarBatch = []

  let costmapLastKept = -Infinity
  let costmapBatch = []

  let goalLastKept = -Infinity
  let goalBatch = []

  let logCnt = 0
  let logBatch = []

  let gridDone = false

  // ──────────────────────────────────────────────────────────────
  // 5) handlers 구성(토픽별 fan-out)
  // ──────────────────────────────────────────────────────────────
  const handlers = {}

  if (poseChosen) {
    handlers[poseChosen] = async ({ msg, ch }) => {
      // stride downsample
      if (poseDownsample > 1 && poseIdx++ % poseDownsample !== 0) return

      const tSec = nsToSec(msg.logTime ?? msg.publishTime)
      if (!Number.isFinite(tSec)) return

      // time downsample
      if (poseTimeDownsampleMs > 0 && poseLastKept > -Infinity) {
        if ((tSec - poseLastKept) * 1000 < poseTimeDownsampleMs) return
      }
      poseLastKept = tSec

      const obj = await decodeMsgToObject(msg, ch, schemaResolver, { tryUtf8Json: true })
      const pose = obj ? pickPoseAny(obj) : null
      if (!pose) return

      poseBatch.push({ tSec, x: pose.x, y: pose.y, z: Number(pose.z) || 0, yaw: Number(pose.yaw) || 0 })

      if (poseBatch.length >= poseBatchSize) {
        onPoseBatch?.(poseBatch)
        poseBatch = []
        await Promise.resolve()
      }
    }
  }

  if (pathChosen) {
    handlers[pathChosen] = async ({ msg, ch }) => {
      const msgSec = nsToSec(msg.logTime ?? msg.publishTime)
      const obj = await decodeMsgToObject(msg, ch, schemaResolver, { tryUtf8Json: true })
      if (!obj) return
      const pts = extractPathPointsAny(obj)
      if (!pts.length) return

      for (const p of pts) {
        if (pathStride > 1 && pathStrideK++ % pathStride !== 0) continue
        pathBatch.push({ tSec: msgSec, x: p.x, y: p.y, z: p.z })
        if (pathBatch.length >= pathBatchSize) {
          onPathBatch?.(pathBatch)
          pathBatch = []
          await Promise.resolve()
        }
      }
    }
  }

  if (lidarChosen) {
    handlers[lidarChosen] = async ({ msg, ch }) => {
      const tSec = nsToSec(msg.logTime ?? msg.publishTime)
      if (!Number.isFinite(tSec)) return

      if (lidarTimeDownsampleMs > 0 && lidarLastKept > -Infinity) {
        if ((tSec - lidarLastKept) * 1000 < lidarTimeDownsampleMs) return
      }
      lidarLastKept = tSec

      const obj = await decodeMsgToObject(msg, ch, schemaResolver, { tryUtf8Json: true })
      const raw = normalizeRawScan(obj)
      if (!raw) return

      const { angles, cos, sin } = getAnglesAndMaybePrecompute(raw)
      if (!angles) return

      const xy = toXYFast({
        ranges: raw.ranges,
        angles,
        cos,
        sin,
        range_min: raw.range_min,
        range_max: raw.range_max,
        stride: Math.max(1, lidarPointDownsample | 0),
        clamp: !!lidarClampToRange
      })

      lidarBatch.push({ tSec, xy, count: xy.length / 2, frameId: raw.frame_id })

      if (lidarBatch.length >= lidarBatchSize) {
        onLidarBatch?.(lidarBatch)
        lidarBatch = []
        await Promise.resolve()
      }
    }
  }

  if (costmapChosen) {
    handlers[costmapChosen] = async ({ msg, ch }) => {
      const msgSec = nsToSec(msg.logTime ?? msg.publishTime)
      if (!Number.isFinite(msgSec)) return

      if (costmapTimeDownsampleMs > 0 && costmapLastKept > -Infinity) {
        if ((msgSec - costmapLastKept) * 1000 < costmapTimeDownsampleMs) return
      }
      costmapLastKept = msgSec

      const dec = await getDecoderForChannel(ch)
      const obj = await decodeMsgToObject(msg, ch, schemaResolver, { decoder: dec, tryUtf8Json: true })
      const grid = obj ? normalizeOccupancyGrid(obj) : null
      if (!grid) return

      const tHeader = stampToSec(obj?.header?.stamp) ?? stampToSec(obj?.info?.header?.stamp)
      const tSec =
        costmapTimeSource === 'header'
          ? Number.isFinite(tHeader)
            ? tHeader
            : msgSec
          : Number.isFinite(msgSec)
            ? msgSec
            : tHeader

      if (!Number.isFinite(tSec)) return

      costmapBatch.push({ tSec, grid })

      if (costmapBatch.length >= costmapBatchSize) {
        onCostmapBatch?.(costmapBatch)
        costmapBatch = []
        await Promise.resolve()
      }
    }
  }

  if (goalChosen) {
    handlers[goalChosen] = async ({ msg, ch }) => {
      const msgSec = nsToSec(msg.logTime ?? msg.publishTime)
      if (!Number.isFinite(msgSec)) return

      if (goalTimeDownsampleMs > 0 && goalLastKept > -Infinity) {
        if ((msgSec - goalLastKept) * 1000 < goalTimeDownsampleMs) return
      }
      goalLastKept = msgSec

      const obj = await decodeMsgToObject(msg, ch, schemaResolver, { tryUtf8Json: true })
      if (!obj) return
      const pose = pickPose2dStamped(obj)
      if (!pose) return

      const tHeader = stampOrMsgToSec(obj, msgSec)
      const tSec =
        goalTimeSource === 'header'
          ? Number.isFinite(tHeader)
            ? tHeader
            : msgSec
          : Number.isFinite(msgSec)
            ? msgSec
            : tHeader

      if (!Number.isFinite(tSec)) return

      const frame_id =
        String(obj?.header?.frame_id ?? obj?.pose?.header?.frame_id ?? obj?.goal?.header?.frame_id ?? '') || undefined

      goalBatch.push({ tSec, x: pose.x, y: pose.y, z: Number(pose.z) || 0, yaw: Number(pose.yaw) || 0, frame_id })

      if (goalBatch.length >= goalBatchSize) {
        onGoalBatch?.(goalBatch)
        goalBatch = []
        await Promise.resolve()
      }
    }
  }

  if (rosoutChosen) {
    handlers[rosoutChosen] = async ({ msg, ch }) => {
      if (logCnt >= logMaxLines) return
      logCnt++

      let line = null
      try {
        const pretty = await tryDecodePayload(msg.data, ch, schemaResolver)
        if (pretty) line = typeof pretty === 'string' ? pretty : JSON.stringify(pretty)
      } catch {}

      if (!line) {
        const tsStr = formatLocal(nsToSec(msg.logTime ?? msg.publishTime))
        const node = ch?.topic ?? rosoutChosen
        const size = msg.data?.byteLength ?? 0
        line = `[INFO] ${tsStr} ${node}: (payload ${size} bytes)`
      }

      logBatch.push(line)
      if (logBatch.length >= logBatchSize) {
        onLogBatch?.(logBatch)
        logBatch = []
        await Promise.resolve()
      }
    }
  }

  if (gridChosen) {
    handlers[gridChosen] = async ({ msg, ch }) => {
      if (gridDone) return
      const dec = await getDecoderForChannel(ch)
      const obj = await decodeMsgToObject(msg, ch, schemaResolver, { decoder: dec, tryUtf8Json: true })
      const grid = obj ? normalizeOccupancyGrid(obj) : null
      if (!grid) return
      gridDone = true
      onGridOnce?.(grid)
    }
  }

  // ──────────────────────────────────────────────────────────────
  // 6) ✅ 단 1회 readMessages로 전체 처리
  // ──────────────────────────────────────────────────────────────
  await scanMcapOnce(url, { topics, decompressHandlers, handlers })

  // flush remain
  if (poseBatch.length) onPoseBatch?.(poseBatch)
  if (pathBatch.length) onPathBatch?.(pathBatch)
  if (lidarBatch.length) onLidarBatch?.(lidarBatch)
  if (costmapBatch.length) onCostmapBatch?.(costmapBatch)
  if (goalBatch.length) onGoalBatch?.(goalBatch)
  if (logBatch.length) onLogBatch?.(logBatch)
}
