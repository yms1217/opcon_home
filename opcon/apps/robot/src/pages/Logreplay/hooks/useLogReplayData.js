// hooks/useLogReplayData.js
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { fileApis } from '@/apis'
import { detectLevel, extractFilenameFromContentDisposition, triggerAnchorDownload } from '../logReplayRender.js'
import useLogSearch from './useLogSearch.js'
import { loadPosesFromMcapUrl, loadRosoutFromMcapUrl, loadPosesSparseFromMcapUrl } from '../mcap/mcapLoader.js'
import { toUtcFromLocalDateTime } from '@/utils/dateUtils'
import { gunzipToUint8Array, parseTarEntries, filterTextEntries, decodeUtf8, splitLines } from '../mcap/archiveUtils.js'
const lichtblickURL = import.meta.env.VITE_LICHTBLICK_BASE_URL

// ── 공통 헬퍼 (module-level) ─────────────────────────────
/** tSec ≤ t 인 마지막 인덱스 (없으면 -1) */
function bsearchLe(arr, t) {
  let lo = 0,
    hi = arr.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if ((arr[mid]?.tSec ?? 0) <= t) lo = mid + 1
    else hi = mid
  }
  return lo - 1
}

/** 가장 가까운 인덱스 */
function bsearchClosest(arr, t) {
  let lo = 0,
    hi = arr.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if ((arr[mid]?.tSec ?? 0) < t) lo = mid + 1
    else hi = mid
  }
  if (lo >= arr.length) return arr.length - 1
  if (lo === 0) return 0
  return Math.abs(t - (arr[lo - 1]?.tSec ?? 0)) <= Math.abs((arr[lo]?.tSec ?? 0) - t) ? lo - 1 : lo
}

const EMPTY_OPTION = { id: '__empty__', label: '파일 없음' }
const INITIAL_HINT = 'mcap 파일 선택 후 조회 버튼을 눌러주세요'

export default function useLogReplayData({
  setPathPoints,
  setGridData,
  setLocalCostmapData,
  setLocalCostmapFrames,
  setPlannedPathPoints,
  setLidarScans,
  setDwaGoals,
  setLoadPhase,
  setT0EpochMs,
  setDurationMs, // ✅ ADD
  updateBuffer,
  renderNow,
  resetView,
  deviceId,
  // ✅ [ADD] 플레이바 현재 재생 위치(초)를 가져오는 콜백 (0 ~ durationSec)
  getPlayTimeSec
}) {
  // 스트리밍 상태 ref
  const expectedDurationSecRef = useRef(0)
  const decodedSpanSecRef = useRef(0)
  const t0RawRef = useRef(null)
  const tLastRawRef = useRef(-Infinity)

  // ✅ [ADD] 현재 로드된 MCAP url / pose-window 요청 핸들러
  const currentMcapUrlRef = useRef('')
  const requestPoseWindowRef = useRef(null)
  const activePoseWindowRef = useRef({ startSec: null, endSec: null })
  const poseWindowSeqRef = useRef(0)
  const lastPollCenterRef = useRef(null) // ✅ 폴링 게이트: 사용자 seek 감지용
  // ✅ [ADD][Option A] pose window 결과 캐시(플레이바 이동 시 네트워크 없이 여기서 선택)
  const poseWindowCacheRef = useRef([]) // [{x,y,yaw,tSec}]  (tSec: playback-relative sec)
  const lastPoseApplyIdxRef = useRef(-1)

  // ✅ [ADD] odom(=pose) 기반 센서 차트 데이터 (uPlot용: {t[], x[], y[], z[]})
  const [odomChart1, setOdomChart1] = useState(null) // vx/vy/speed
  const [odomChart2, setOdomChart2] = useState(null) // x/y/yaw
  const [chartLoading, setChartLoading] = useState(false)

  // ✅ [ADD] pose window -> chart data 변환 유틸
  const buildOdomChartsFromPoses = useCallback((poses) => {
    if (!Array.isArray(poses) || poses.length < 2) return { c1: null, c2: null }

    // chart2: x/y/yaw (그대로)
    const t2 = []
    const x2 = []
    const y2 = []
    const z2 = [] // yaw

    for (const p of poses) {
      const t = Number(p?.tSec)
      const x = Number(p?.x)
      const y = Number(p?.y)
      const yaw = Number(p?.yaw) || 0
      if (!Number.isFinite(t) || !Number.isFinite(x) || !Number.isFinite(y)) continue
      t2.push(t)
      x2.push(x)
      y2.push(y)
      z2.push(yaw)
    }

    // chart1: vx/vy/speed (차분으로 계산)
    const t1 = []
    const x1 = [] // vx
    const y1 = [] // vy
    const z1 = [] // speed
    for (let i = 1; i < poses.length; i++) {
      const p0 = poses[i - 1]
      const p1 = poses[i]
      const t0 = Number(p0?.tSec)
      const t = Number(p1?.tSec)
      const dt = t - t0
      if (!(Number.isFinite(dt) && dt > 0)) continue
      const x0 = Number(p0?.x),
        y0 = Number(p0?.y)
      const x = Number(p1?.x),
        y = Number(p1?.y)
      if (!Number.isFinite(x0) || !Number.isFinite(y0) || !Number.isFinite(x) || !Number.isFinite(y)) continue
      const vx = (x - x0) / dt
      const vy = (y - y0) / dt
      t1.push(t)
      x1.push(vx)
      y1.push(vy)
      z1.push(Math.hypot(vx, vy))
    }

    const c1 = t1.length ? { t: t1, x: x1, y: y1, z: z1 } : null
    const c2 = t2.length ? { t: t2, x: x2, y: y2, z: z2 } : null
    return { c1, c2 }
  }, [])

  // ✅ [ADD] rosout(window) 동기화용 refs (pose와 동일 패턴)
  const requestLogWindowRef = useRef(null)
  const activeLogWindowRef = useRef({ startSec: null, endSec: null })
  const logWindowSeqRef = useRef(0)
  const logWindowCacheRef = useRef([]) // [{tSec, epochMs, level, text}] sorted
  const lastLogApplyIdxRef = useRef(-1)
  const appliedKeywordRef = useRef('')

  // ✅ [ADD] 누적/seek 모드 구분
  const logAccModeRef = useRef('seek') // 'seek' | 'accumulate'
  const accStartSecRef = useRef(0) // 누적 시작 시점(seek 시점)
  const accEndCoveredRef = useRef(0) // 누적 캐시가 커버하는 최대 tSec

  // ✅ [ADD] TDZ 회피: polling/useEffect에서 applyLogsByPlayhead를 deps로 직접 참조하지 않기 위한 ref
  const applyLogsByPlayheadRef = useRef(null)
  // ── 공통 overlay window refs (costmap / path / goalPose) ──
  const overlayRef = useRef({
    costmap: { seq: 0, cache: [], active: { s: null, e: null }, lastIdx: -1 },
    path: { seq: 0, cache: [], active: { s: null, e: null }, lastIdx: -1 },
    goalPose: { seq: 0, cache: [], active: { s: null, e: null }, lastIdx: -1 }
  })
  const requestOverlayWindowRef = useRef(null)
  const requestChartOverviewRef = useRef(null)

  const timebaseReadyRef = useRef(false)
  const poseWindowLoadingRef = useRef(false)

  const gridDoneRef = useRef({ v: false })
  const posesDoneRef = useRef({ v: false })
  const EPS_TRAW = 1e-6
  const tarPrefetchPromiseRef = useRef(null)
  const tarPrefetchKeyRef = useRef('')
  const t0EpochMsRef = useRef(null) //ADD: playback 기준점(ms)

  // ✅ ADD: replay session clear (날짜/로그 변경 시)
  const clearReplaySession = useCallback(() => {
    currentMcapUrlRef.current = ''

    requestPoseWindowRef.current = null
    requestLogWindowRef.current = null
    requestOverlayWindowRef.current = null

    activePoseWindowRef.current = { startSec: null, endSec: null }
    activeLogWindowRef.current = { startSec: null, endSec: null }

    poseWindowCacheRef.current = []
    logWindowCacheRef.current = []

    lastPollCenterRef.current = null
    lastPoseApplyIdxRef.current = -1
    lastLogApplyIdxRef.current = -1

    // ✅ ADD: log UI state 초기화
    setLogLines([])
    setFilteredLines([])
    setLogError(null)
    setIsLoadingLogs(false)
    setOdomChart1(null)
    setOdomChart2(null)
  }, [])

  // 서버 옵션/상태
  const todayStr = new Date().toISOString().slice(0, 10)
  const [logOptions, setLogOptions] = useState([EMPTY_OPTION])
  const [selectedDate, setSelectedDate] = useState(todayStr)
  const [selectedLogId, setSelectedLogId] = useState(EMPTY_OPTION.id)

  // 캘린더 가용 날짜 (yyyy-MM-dd 배열)
  const [allowedDateKeys, setAllowedDateKeys] = useState(null)

  // 텍스트 로그/검색
  const [logLines, setLogLines] = useState([])
  const [isLoadingLogs, setIsLoadingLogs] = useState(false)

  const [logError, setLogError] = useState(null)
  const [filteredLines, setFilteredLines] = useState([])

  const MAX_FILTER_VIEW = 12000 // UI 표시 한정, 전부 메모리에 복제하지 않음
  const [hasAnyTarLogs, setHasAnyTarLogs] = useState(false)
  const [levelFilter, setLevelFilter] = useState({ INFO: true, WARN: true, ERROR: true, DEBUG: true, FATAL: true })

  const [odomSeries, setOdomSeries] = useState([])

  const activeLevels = useMemo(
    () =>
      Object.entries(levelFilter)
        .filter(([, v]) => v)
        .map(([k]) => k),
    [levelFilter]
  )
  const activeLevelsRef = useRef(activeLevels)
  useEffect(() => {
    activeLevelsRef.current = activeLevels
  }, [activeLevels])

  const [pendingKeyword, setPendingKeyword] = useState('')
  const [appliedKeyword, setAppliedKeyword] = useState('')

  const { ready: searchReady, add: searchAdd, clear: searchClear, query: searchQuery } = useLogSearch()
  const logSeqRef = useRef(0)
  const searchDebounceRef = useRef(0)

  // ✅ tick의 정상 재생 step(초) EMA
  const stepEmaRef = useRef(0)
  // ✅ tick wall-clock 간격 추정(옵션: 디버깅/안정화)
  const lastTickWallMsRef = useRef(0)

  // ──────────────────────────────────────────────────────────────
  // [Step1] tar.gz 다운로드 상태/버퍼
  const tarGzBytesRef = useRef(null) // Uint8Array (압축 그대로 저장)
  const tarGzMetaRef = useRef(null) // { id, label, createdAt, size, url }
  const [isLoadingTar, setIsLoadingTar] = useState(false)
  const [tarError, setTarError] = useState(null)
  // ────────────────────────────────────────────────────────────
  const MAX_LOG_LINES_IN_MEMORY = 30000
  const SEARCH_LIMIT = 20000

  const isLoadingLogsRef = useRef(false)
  useEffect(() => {
    isLoadingLogsRef.current = isLoadingLogs
  }, [isLoadingLogs])
  // 오버레이/게이팅
  const [loadPhase, _setLoadPhase] = useState('init')
  useEffect(() => {
    setLoadPhase?.(loadPhase)
  }, [loadPhase, setLoadPhase])
  const rightOverlayVisible = useMemo(() => loadPhase === 'init' || loadPhase === 'error', [loadPhase])
  const rightOverlayText = useMemo(
    () => (loadPhase === 'init' ? INITIAL_HINT : loadPhase === 'error' ? '로딩 실패' : ''),
    [loadPhase]
  )
  const DEBUG_REPLAY = false
  const dbg = (...args) => {
    if (!DEBUG_REPLAY) return
    console.log('[ReplayDbg]', ...args)
  }

  // presigned URL
  const presignedCacheRef = useRef(new Map())
  const getPresignedUrl = useCallback(async (fileId) => {
    if (!fileId || fileId === EMPTY_OPTION.id) return ''
    const cached = presignedCacheRef.current.get(fileId)
    const now = Date.now()
    if (cached && cached.expiresAt && cached.expiresAt - now > 10_000) return cached.url
    const resp = await fileApis.getFilesDownloardurl(fileId)
    const url = resp?.presignedUrl || ''
    if (!url) return ''
    try {
      const u = new URL(url)
      const expiresSec = Number(u.searchParams.get('X-Amz-Expires') || '0')
      const expiresAt = now + Math.max(0, expiresSec - 30) * 1000
      presignedCacheRef.current.set(fileId, { url, expiresAt })
    } catch (e) {
      dbg('presigned URL parse failed', e?.message || String(e))
    }
    return url
  }, [])

  // mcap 선택 항목으로부터 정확히 매칭되는 tar.gz option 찾기
  // 규칙:
  //   'dwa_mcap_<SUFFIX>.mcap' → 'driving_log_<SUFFIX>.tar.gz'
  const findPairedTarGzOption = useCallback((selected, options) => {
    if (!selected || !selected.label || !Array.isArray(options) || options.length === 0) {
      return null
    }

    // 1) mcap 파일명 정규화
    let base = String(selected.label)
      .trim()
      .replace(/\.mcap$/i, '')

    // 2) prefix 제거
    const suffix = base.replace(/^dwa_mcap_/i, '')
    if (!suffix) return null

    // 3) 기대 tar.gz 파일명 생성
    const expectedLabel = `driving_log_${suffix}.tar.gz`
    const expectedLower = expectedLabel.toLowerCase()

    // 4) 정확히 일치하는 option 검색 (case-insensitive)
    return options.find((o) => (o?.label || '').toLowerCase() === expectedLower) || null
  }, [])
  const applyOverlayByPlayhead = useCallback(
    (playSec) => {
      const t = Number(playSec)
      if (!Number.isFinite(t)) return
      const ov = overlayRef.current

      // ── costmap: 가장 가까운 프레임의 grid ──
      const cm = ov.costmap
      if (cm.cache.length > 0) {
        const idx = bsearchClosest(cm.cache, t)
        if (idx !== cm.lastIdx) {
          cm.lastIdx = idx
          const frame = cm.cache[idx]
          if (frame?.grid) {
            setLocalCostmapData?.(frame.grid)
            setLocalCostmapFrames?.(cm.cache)
          }
          renderNow?.()
        }
      }

      // ── path: playhead 시점의 최신 plan의 points ──
      const pt = ov.path
      if (pt.cache.length > 0) {
        const idx = bsearchLe(pt.cache, t)
        if (idx >= 0 && idx !== pt.lastIdx) {
          pt.lastIdx = idx
          setPlannedPathPoints?.(pt.cache[idx]?.points ?? [])
          renderNow?.()
        }
      }

      // ── goalPose: playhead 시점의 최신 goal ──
      const gp = ov.goalPose
      if (gp.cache.length > 0) {
        const idx = bsearchLe(gp.cache, t)
        if (idx >= 0 && idx !== gp.lastIdx) {
          gp.lastIdx = idx
          setDwaGoals?.([gp.cache[idx]])
          renderNow?.()
        }
      }
    },
    [setLocalCostmapData, setLocalCostmapFrames, setPlannedPathPoints, setDwaGoals, renderNow]
  )
  useEffect(() => {
    if (typeof getPlayTimeSec !== 'function') return

    let lastLogApplySec = Number.NaN // 로그 apply 게이트(기존 유지)

    const tick = () => {
      if (!currentMcapUrlRef.current) return

      const exp = Number(expectedDurationSecRef.current) || 0
      if (!(exp > 0)) return

      let center = Number.NaN
      try {
        center = Number(getPlayTimeSec())
      } catch {}
      if (!Number.isFinite(center)) return

      // clamp
      if (center < 0) center = 0
      if (center > exp) center = exp

      // 이전 center
      const last = lastPollCenterRef.current

      // ✅ 재생 중 소폭 backward jitter 방지: playhead 단조 증가로 clamp
      let centerAdj = center
      const backJitterThresh = Math.max(0.8, (stepEmaRef.current || 0.25) * 4) // ★ 포인트
      if (Number.isFinite(last) && centerAdj < last && last - centerAdj < backJitterThresh) {
        centerAdj = last
      }
      const diffSec = Number.isFinite(last) ? centerAdj - last : 0
      lastPollCenterRef.current = centerAdj

      // ✅ 1) "정지/idle" 게이트: center가 거의 안 움직이면 아무 것도 하지 않음
      // - paused 상태에서 requestLogWindow가 계속 돌며 누적이 꼬이는 현상 방지
      // - 콘솔 로그 무한 출력도 방지
      if (Number.isFinite(last) && Math.abs(diffSec) < 0.02) {
        return
      }

      // ✅ 2) tick wall-clock (옵션) — 브라우저 타이머 지연 상황을 EMA에 자연 반영
      const nowMs = performance.now()
      const lastMs = lastTickWallMsRef.current || nowMs
      const dtWallSec = Math.max(0.001, (nowMs - lastMs) / 1000)
      lastTickWallMsRef.current = nowMs

      // ✅ 3) 정상 재생 step(초) EMA 업데이트 (forward 이동일 때만)
      // - 고배속에서는 diffSec 자체가 커지므로 typicalStep도 같이 커짐
      if (Number.isFinite(diffSec) && diffSec > 0.01 && diffSec < 60) {
        const prev = stepEmaRef.current || diffSec
        // tick이 밀린 경우도 포함해 현실적인 step을 따라가게 (완만하게)
        const next = prev * 0.8 + diffSec * 0.2
        stepEmaRef.current = next
      }
      const typicalStep = stepEmaRef.current || Math.max(0.25, dtWallSec) // fallback

      // ✅ 4) wrapped(끝→0) 예외 (loop 모드일 경우 seek 오탐 방지)
      const wrapped =
        Number.isFinite(last) &&
        exp > 0 &&
        last > exp - Math.max(0.5, typicalStep * 0.5) &&
        centerAdj < Math.max(0.5, typicalStep * 0.5)

      // ✅ 5) seek 판정(핵심):
      // - backward 점프는 강한 seek 신호
      // - forward 점프는 "평소 step" 대비 과도할 때만 seek
      //   (고배속에서 diffSec가 커지는 정상 재생을 seek으로 오인하지 않도록)
      const forwardSeekThreshold = Math.max(3.0, typicalStep * 8) // ★ 핵심 파라미터
      // ✅ backward seek 임계도 typicalStep 기반으로 상향(작은 jitter는 seek 아님)
      const backwardSeekThreshold = Math.max(1.5, typicalStep * 6)

      const isSeek =
        !wrapped && Number.isFinite(last) && (diffSec < -backwardSeekThreshold || diffSec > forwardSeekThreshold)

      console.log('[SEEK DEBUG]', {
        centerAdj,
        last,
        diffSec,
        forwardSeekThreshold,
        backwardSeekThreshold,
        isSeek
      })

      // pose window는 재생 중에도 계속 호출(커버되면 loader가 skip)
      requestPoseWindowRef.current?.(center, isSeek ? 'seek' : 'playhead')
      // ── overlay topics (공통 window) ──
      requestOverlayWindowRef.current?.('costmap', center, isSeek ? 'seek' : 'playhead')
      requestOverlayWindowRef.current?.('path', center, isSeek ? 'seek' : 'playhead')
      requestOverlayWindowRef.current?.('goalPose', center, isSeek ? 'seek' : 'playhead')
      // ✅ 6) log window 모드 전환
      if (isSeek) {
        console.log('[MODE] SEEK → reset & window')
        // seek → 누적 리셋, 해당 시점 윈도우만 표시
        logAccModeRef.current = 'seek'
        logWindowCacheRef.current = []
        lastLogApplyIdxRef.current = -1
        accStartSecRef.current = center
        accEndCoveredRef.current = 0
        requestLogWindowRef.current?.(center, 'seek')
      } else {
        console.log('[MODE] ACCUMULATE')
        // 연속 재생 → 누적 모드
        logAccModeRef.current = 'accumulate'
        requestLogWindowRef.current?.(center, 'playhead')
      }

      // ✅ buffer = 로그 존재 영역 표시
      const dur = Number(expectedDurationSecRef.current) || 1
      if (dur > 0) {
        console.log('[BUFFER INPUT]', {
          isSeek,
          centerAdj,
          accEnd: accEndCoveredRef.current,
          duration: dur
        })

        if (isSeek) {
          // ✅ seek는 "점 표시" → 음수로 전달
          const r = Math.max(0, Math.min(1, centerAdj / dur))
          updateBuffer?.(-r)
        } else {
          // ✅ 재생 중 → on-demand HTTP Range이므로 buffer는 항상 100%
          updateBuffer?.(1)
        }
      }

      // ✅ 7) applyLogs 게이트 (기존 0.05초 + 추가로 "실제 변화" 기반)
      if (!Number.isFinite(lastLogApplySec) || Math.abs(center - lastLogApplySec) > 0.05) {
        lastLogApplySec = center
        applyLogsByPlayheadRef.current?.(center)
        applyOverlayByPlayhead(center)
      }
    }

    const id = setInterval(tick, 250)
    return () => clearInterval(id)
  }, [getPlayTimeSec, applyOverlayByPlayhead])

  // Step 1: disable tar.gz prefetc
  // tar.gz 사전 로드 (압축 해제는 아직 X)
  // const prefetchTarGzForSelected = useCallback(
  //   async (selected, options, reason = 'unknown') => {
  //     const cand = findPairedTarGzOption(selected, options)
  //     const key = cand?.id || ''
  //     if (!cand) {
  //       console.warn('[tar.gz] candidate not found for selected MCAP.')
  //       return null
  //     }
  //     if (tarGzMetaRef.current?.id === cand.id && tarGzBytesRef.current?.length) {
  //       return tarGzMetaRef.current
  //     }
  //     if (tarPrefetchPromiseRef.current && tarPrefetchKeyRef.current === key) {
  //       return tarPrefetchPromiseRef.current
  //     }
  //     tarPrefetchKeyRef.current = key
  //     tarPrefetchPromiseRef.current = (async () => {
  //       setIsLoadingTar(true)
  //       setTarError(null)
  //       try {
  //         console.log('[tar.gz] candidate:', cand.label, cand.createdAt, 'reason=', reason)
  //         const url = await getPresignedUrl(cand.id)
  //         if (!url) throw new Error('presigned URL for tar.gz is empty')
  //         const resp = await fetch(url, { mode: 'cors' })
  //         if (!resp.ok) throw new Error(`tar.gz download failed: HTTP ${resp.status}`)
  //         const buf = await resp.arrayBuffer()
  //         tarGzBytesRef.current = new Uint8Array(buf)
  //         tarGzMetaRef.current = { ...cand, url }
  //         console.log(`[tar.gz] loaded: ${cand.label}, bytes=${tarGzBytesRef.current.length}, reason=${reason}`)
  //         return tarGzMetaRef.current
  //       } catch (e) {
  //         console.warn('[tar.gz] prefetch failed:', e)
  //         setTarError(e?.message || String(e))
  //         return null
  //       } finally {
  //         setIsLoadingTar(false)
  //         tarPrefetchPromiseRef.current = null
  //         tarPrefetchKeyRef.current = ''
  //       }
  //     })()
  //     return tarPrefetchPromiseRef.current
  //   },
  //   [findPairedTarGzOption, getPresignedUrl]
  // )

  const queryWindow = useCallback(
    async ({ levels, keyword = '', fromMs, toMs, limit = 5000 } = {}) => {
      if (!searchReady) return []
      const timeRange =
        Number.isFinite(fromMs) && Number.isFinite(toMs) ? { from: Math.round(fromMs), to: Math.round(toMs) } : null
      const res = await searchQuery({
        levels,
        keyword,
        sortBy: timeRange ? 'pbAsc' : 'tsAsc',
        limit,
        timeRange
      })
      const items = Array.isArray(res?.items) ? res.items : []
      return items.map((it) => it?.text).filter(Boolean)
    },
    [searchReady, searchQuery]
  )
  //캘린더에 해당하는는 파일 목록 조회
  const handleVisibleRangeChange = useCallback(
    async ({ startDate, endDate }) => {
      const toDateKey = (v) => {
        if (!v) return ''
        const d = typeof v === 'string' ? new Date(v) : v
        return isNaN(d) ? '' : d.toISOString().slice(0, 10)
      }

      const startKey = toDateKey(startDate)
      const endKey = toDateKey(endDate)
      if (!startKey || !endKey) return

      const start = toUtcFromLocalDateTime(startKey, '00:00:00')
      const end = toUtcFromLocalDateTime(endKey, '23:59:59')

      try {
        const size = 500
        const params = deviceId ? { start, end, deviceId, size } : { start, end }
        const items = (await fileApis.getFiles(params))?.content ?? []

        const dates = Array.from(
          new Set(
            items
              .map((it) => it?.createdAt && new Date(it.createdAt))
              .filter((d) => d && !isNaN(d))
              .map((d) => d.toISOString().slice(0, 10))
          )
        ).sort()

        setAllowedDateKeys(dates)
      } catch (e) {
        console.error('[get available dates] failed:', e)
        setAllowedDateKeys([])
      }
    },
    [deviceId]
  )

  // 현재 달(캘린더 6주 그리드)의 가시 범위를 계산
  const computeVisibleRangeForMonth = useCallback((yyyyMMdd) => {
    const base = (() => {
      const [y, m] = (yyyyMMdd || '').split('-').map(Number)
      return Number.isFinite(y) && Number.isFinite(m)
        ? new Date(y, m - 1, 1)
        : new Date(new Date().getFullYear(), new Date().getMonth(), 1)
    })()

    const start = new Date(base)
    start.setDate(1 - start.getDay()) // 달력 첫 셀

    const end = new Date(start)
    end.setDate(start.getDate() + 41) // 6주

    return { startDate: start, endDate: end }
  }, [])

  // [핵심] 첫 진입 시, Calendar가 자동 호출해주지 않으니 우리가 직접 1회 호출
  useEffect(() => {
    const { startDate, endDate } = computeVisibleRangeForMonth(selectedDate)
    handleVisibleRangeChange({ startDate, endDate })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 파일 목록 조회
  const handleFetchListClick = useCallback(async () => {
    try {
      const start = toUtcFromLocalDateTime(selectedDate, '00:00:00')
      const end = toUtcFromLocalDateTime(selectedDate, '23:59:59')

      // deviceId가 존재하면 옵션에 포함 (없으면 제외)
      const size = 500 //temp code
      const params = deviceId ? { start, end, deviceId, size } : { start, end }
      const response = await fileApis.getFiles(params)
      const items = Array.isArray(response?.content) ? response.content : []
      const nextOptionsRaw = items.map((it) => ({
        id: it.fileId,
        label: it.fileOriginalName || it.fileId,
        createdAt: it.createdAt,
        size: it.fileSize
      }))
      const nextOptions = nextOptionsRaw.length > 0 ? nextOptionsRaw : [EMPTY_OPTION]
      setLogOptions(nextOptions)
      if (!nextOptions.some((o) => o.id === selectedLogId)) {
        setSelectedLogId(nextOptions[0].id)
      }
    } catch (e) {
      dbg('handleFetchListClick failed', e?.message || String(e))
      setLogOptions([EMPTY_OPTION])
      setSelectedLogId(EMPTY_OPTION.id)
    }
  }, [selectedDate, selectedLogId, deviceId])

  // 선택 변경 (초기화는 상위 훅에서)
  const onDateChange = useCallback((date) => {
    setSelectedDate(date)
  }, [])
  const onLogChange = useCallback((value) => {
    setSelectedLogId(value)
  }, [])

  // 키워드 검색 버튼
  const searchReadyRef = useRef(false)
  useEffect(() => {
    searchReadyRef.current = !!searchReady
  }, [searchReady])
  const pendingKeywordRef = useRef('')
  useEffect(() => {
    pendingKeywordRef.current = pendingKeyword
  }, [pendingKeyword])

  const logLinesRef = useRef(logLines)
  useEffect(() => {
    logLinesRef.current = logLines
  }, [logLines])
  // ✅ [Option A] playhead(tSec)에 맞는 pose를 캐시에서 골라 pathPoints를 "현재까지"로 갱신
  // ✅ [REPLACE] applyPoseByPlayhead
  const applyPoseByPlayhead = useCallback(
    (playSec) => {
      const poses = poseWindowCacheRef.current
      if (!Array.isArray(poses) || poses.length === 0) return

      const t = Number(playSec)
      if (!Number.isFinite(t)) return

      const minT = Number(poses[0]?.tSec)
      const maxT = Number(poses[poses.length - 1]?.tSec)
      if (Number.isFinite(minT) && Number.isFinite(maxT) && (t < minT || t > maxT)) {
        // cache가 현재 시간을 커버 못함 → 이전 위치를 보여주지 않도록 즉시 window 요청
        requestPoseWindowRef.current?.(t, 'seek')
        return
      }

      let lo = 0
      let hi = poses.length
      while (lo < hi) {
        const mid = (lo + hi) >> 1
        const mt = Number(poses[mid]?.tSec)
        if (Number.isFinite(mt) && mt < t) lo = mid + 1
        else hi = mid
      }

      let idx
      if (lo <= 0) idx = 0
      else if (lo >= poses.length) idx = poses.length - 1
      else {
        const p0 = poses[lo - 1]
        const p1 = poses[lo]
        const t0 = Number(p0?.tSec)
        const t1 = Number(p1?.tSec)
        const d0 = Math.abs(t - t0)
        const d1 = Math.abs(t1 - t)
        idx = d0 <= d1 ? lo - 1 : lo
      }

      if (!poses[idx]) {
        console.warn('[POSE][IDX_INVALID]', {
          idx,
          len: poses.length
        })
        return
      }

      if (idx === lastPoseApplyIdxRef.current) return
      lastPoseApplyIdxRef.current = idx

      if (poses.length === 1) {
        const p = poses[0]
        setPathPoints?.([p, { ...p, tSec: Number(p.tSec) + 1e-6 }])
        renderNow?.()
        return
      }

      const end = Math.min(poses.length, Math.max(2, idx + 1))
      setPathPoints?.(poses.slice(0, end))
      renderNow?.()
    },
    [setPathPoints, renderNow]
  )

  // ✅ [ADD] playhead 기준 로그 표시 (window cache에서 선택)
  const applyLogsByPlayhead = useCallback(
    (playSec) => {
      const entries = logWindowCacheRef.current

      console.log('[LOG CACHE STATE]', {
        size: entries.length,
        first: entries[0]?.tSec,
        last: entries[entries.length - 1]?.tSec
      })

      if (!Array.isArray(entries) || entries.length === 0) return

      const t = Number(playSec)
      if (!Number.isFinite(t)) return

      // binary search: tSec <= t 인 마지막 인덱스(+1)
      let lo = 0
      let hi = entries.length
      while (lo < hi) {
        const mid = (lo + hi) >> 1
        const mt = Number(entries[mid]?.tSec)
        if (Number.isFinite(mt) && mt <= t) lo = mid + 1
        else hi = mid
      }
      const endIdx = lo

      console.log('[LOG APPLY]', {
        playSec,
        endIdx,
        cacheSize: entries.length,
        visibleLen: endIdx
      })

      if (endIdx === lastLogApplyIdxRef.current) return
      lastLogApplyIdxRef.current = endIdx

      const visible = endIdx <= 1 ? entries : entries.slice(0, endIdx)

      // 레벨/키워드 필터(현재 상태 기준)
      const levels = activeLevelsRef.current || []
      const keyword = (appliedKeywordRef.current || '').toLowerCase()

      let filtered = visible
      if (levels.length && levels.length < 5) {
        filtered = filtered.filter((e) => levels.includes(e.level))
      }
      if (keyword) {
        filtered = filtered.filter((e) =>
          String(e.text || '')
            .toLowerCase()
            .includes(keyword)
        )
      }

      // ✅ 실제 표시 범위 계산
      const baseSlice = visible.length > MAX_FILTER_VIEW ? visible.slice(-MAX_FILTER_VIEW) : visible
      const filtSlice = filtered.length > MAX_FILTER_VIEW ? filtered.slice(-MAX_FILTER_VIEW) : filtered

      // ✅ 이전과 길이가 같으면 setState 스킵 (새 배열 참조로 인한 불필요 리렌더 방지)
      setLogLines((prev) => {
        if (prev.length === baseSlice.length) return prev
        return baseSlice.map((e) => e.text)
      })
      setFilteredLines((prev) => {
        if (prev.length === filtSlice.length) return prev
        return filtSlice.map((e) => e.text)
      })
    },
    [setLogLines, setFilteredLines]
  )

  // ✅ [ADD] polling에서 호출할 수 있도록 ref에 연결 (TDZ 회피)
  useEffect(() => {
    applyLogsByPlayheadRef.current = applyLogsByPlayhead
  }, [applyLogsByPlayhead])
  // ── overlay playhead 적용 (costmap/path/goal 일괄) ──

  const handleKeywordSearchClick = useCallback(async () => {
    const keyword = (pendingKeywordRef.current || '').trim()

    // ✅ [FIX] playhead 동기화(logWindowCache 기반)에서는 searchQuery로 덮어쓰지 말고 ref 필터로 처리
    appliedKeywordRef.current = keyword
    setAppliedKeyword(keyword)

    // 현재 시점 즉시 반영 (다음 250ms tick 기다리지 않도록)
    try {
      const t = typeof getPlayTimeSec === 'function' ? Number(getPlayTimeSec()) : Number.NaN
      if (Number.isFinite(t)) applyLogsByPlayheadRef.current?.(t)
    } catch {}
  }, [getPlayTimeSec])

  useEffect(() => {
    if (typeof getPlayTimeSec !== 'function') return
    let raf = 0
    const tick = () => {
      try {
        const t = Number(getPlayTimeSec())
        if (Number.isFinite(t)) {
          applyPoseByPlayhead(t)
          applyOverlayByPlayhead(t) // ✅ ADD
        }
      } catch {}
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [getPlayTimeSec, applyPoseByPlayhead, applyOverlayByPlayhead])

  // 다운로드
  const [isPreparingDownload, setIsPreparingDownload] = useState(false)
  const handleDownloadLog = useCallback(async () => {
    if (!selectedLogId || selectedLogId === EMPTY_OPTION.id) return
    const selected = logOptions.find((l) => l.id === selectedLogId)
    if (!selected) return

    setIsPreparingDownload(true)
    const downloadUrl = await getPresignedUrl(selectedLogId)
    if (!downloadUrl) {
      setIsPreparingDownload(false)
      alert('다운로드 URL이 설정되지 않았습니다.')
      return
    }

    const fallbackFileName = selected?.label?.replace(/\s+/g, '_') || `${selected?.id || 'log'}.mcap`

    try {
      const resp = await fetch(downloadUrl, { mode: 'cors' })
      if (!resp.ok) throw new Error(`다운로드 실패: HTTP ${resp.status}`)

      const blob = await resp.blob()
      const cd = resp.headers.get('Content-Disposition') || resp.headers.get('content-disposition')
      const serverFileName = cd ? extractFilenameFromContentDisposition(cd) : null
      const finalFileName = serverFileName || fallbackFileName

      if (window.showSaveFilePicker) {
        try {
          setIsPreparingDownload(false)
          const pickerHandle = await window.showSaveFilePicker({
            suggestedName: finalFileName,
            types: [
              {
                description: 'MCAP 로그 파일',
                accept: { 'application/octet-stream': ['.mcap'], 'application/x-mcap': ['.mcap'] }
              }
            ]
          })
          const writable = await pickerHandle.createWritable()
          await writable.write(blob)
          await writable.close()
          return
        } catch (pickerErr) {
          if (pickerErr && (pickerErr.name === 'AbortError' || pickerErr.name === 'NotAllowedError')) return
          console.warn('[download] showSaveFilePicker 실패/취소 → <a download> 폴백', pickerErr)
        }
      }

      const blobUrl = URL.createObjectURL(blob)
      setIsPreparingDownload(false)
      try {
        triggerAnchorDownload(blobUrl, finalFileName)
      } finally {
        setTimeout(() => URL.revokeObjectURL(blobUrl), 10_000)
      }
    } catch (err) {
      console.warn('[download] fetch 실패 → 원본 URL <a download>로 폴백', err)
      setIsPreparingDownload(false)
      triggerAnchorDownload(downloadUrl, fallbackFileName, true)
    }
  }, [selectedLogId, logOptions, getPresignedUrl])

  // Lichtblick
  const handleOpenLichtblick = useCallback(async () => {
    if (!selectedLogId || selectedLogId === EMPTY_OPTION.id) return

    const selected = logOptions.find((l) => l.id === selectedLogId)
    if (!selected) return

    const downloadUrl = await getPresignedUrl(selectedLogId)
    if (!downloadUrl) {
      alert('Logfile URL not found')
      return
    }
    const ds = 'remote-file'
    const u = new URL(lichtblickURL)
    u.search = ''
    u.searchParams.set('ds', ds)
    u.searchParams.set('ds.url', downloadUrl)
    u.searchParams.set('embed', 'true')
    u.searchParams.set('ui', 'minimal')
    const href = u.toString()
    const popup = window.open(href, '_blank', 'noopener,noreferrer')
    if (popup) popup.opener = null
  }, [selectedLogId, logOptions, getPresignedUrl])

  const TOPICS = {
    grid: '/carto_service/occupancygrid',
    trackedpose: '/carto_service/trackedpose',
    path: '/master_service/path',
    lidar: '/lidar_service/data',
    localCostmap: '/debug/dwa_local_costmap'
  }
  // ──────────────────────────────────────────────────────────────
  // 조회(스트리밍)
  // ──────────────────────────────────────────────────────────────
  const handleViewLog = useCallback(async () => {
    if (!selectedLogId || selectedLogId === EMPTY_OPTION.id) return
    const selected = logOptions.find((l) => l.id === selectedLogId)
    if (!selected) return

    const filename = (selected.label ?? '').toLowerCase()
    if (!filename.includes('mcap')) {
      alert('선택한 항목은 분석 가능한 파일이 아닙니다.')
      return
    }

    const downloadUrl = await getPresignedUrl(selectedLogId)
    if (!downloadUrl) {
      alert('다운로드 URL이 설정되지 않았습니다.')
      return
    }

    // ──────────────────────────────────────────────────────────────
    // 초기화
    // ──────────────────────────────────────────────────────────────

    const resetStreamRefs = () => {
      expectedDurationSecRef.current = 0
      decodedSpanSecRef.current = 0
      t0RawRef.current = null
      tLastRawRef.current = -Infinity
      gridDoneRef.current.v = false
      posesDoneRef.current.v = false
    }

    const resetUiState = () => {
      _setLoadPhase('loading')
      updateBuffer?.(0.06)
      setPathPoints?.([])
      setGridData?.(null)
      setLocalCostmapData?.(null)
      setLocalCostmapFrames?.([])
      setPlannedPathPoints?.([])
      setLidarScans?.([])
      setDwaGoals?.([])
      setLogLines([])
      setFilteredLines([])
      // ✅ [ADD] 센서차트 초기화
      setOdomChart1(null)
      setOdomChart2(null)
      searchClear?.()
      logSeqRef.current = 0
      setIsLoadingLogs(true)
      setLogError(null)
      setT0EpochMs?.(null)
      setDurationMs?.(0) // ✅ ADD
      t0EpochMsRef.current = null
      t0RawRef.current = null
      resetView?.()
      renderNow?.()
    }

    resetStreamRefs()
    resetUiState()

    // ✅ [ADD] 현재 로드 중인 파일 URL 저장(슬라이딩 window에서 사용)
    currentMcapUrlRef.current = downloadUrl
    activePoseWindowRef.current = { startSec: null, endSec: null }
    poseWindowSeqRef.current = 0
    poseWindowCacheRef.current = []
    lastPoseApplyIdxRef.current = -1
    lastPollCenterRef.current = null

    // ✅ [ADD] log window reset
    activeLogWindowRef.current = { startSec: null, endSec: null }
    logWindowSeqRef.current = 0
    logWindowCacheRef.current = []
    lastLogApplyIdxRef.current = -1

    // ✅ [ADD] 누적 모드 리셋
    logAccModeRef.current = 'seek'
    accStartSecRef.current = 0
    accEndCoveredRef.current = 0
    // ── overlay window reset ──
    const ov = overlayRef.current
    for (const key of Object.keys(ov)) {
      ov[key].seq = 0
      ov[key].cache = []
      ov[key].active = { s: null, e: null }
      ov[key].lastIdx = -1
    }
    // [Step1] tar.gz 사전 로드 (병렬 시작: await 하지 않음)
    // tar.gz 프리패치(비동기)
    //void prefetchTarGzForSelected(selected, logOptions, 'view-start')

    const maybeSetReady = () => {
      if (gridDoneRef.current.v) {
        _setLoadPhase('ready')
        updateBuffer?.(1.0)
      }
    }

    // ✅ [REPLACE] playhead 중심으로 pose window 다시 읽기 (Foxglove 방식)
    // - mcapLoader.loadPosesFromMcapUrl()가 이미 playback-relative tSec(0~)를 반환하므로
    //   pushBatchNormalized(절대 epoch 가정)를 타면 timebase가 2번 보정되어 tSec가 깨진다.
    // - 따라서 window pose는 "그대로" 정규화(sort/dedupe)해서 cache & path에 반영한다.

    const requestPoseWindow = async (centerSec, reason = 'unknown') => {
      const url = currentMcapUrlRef.current
      if (!url) return

      const exp = Number(expectedDurationSecRef.current) || 0
      if (!Number.isFinite(centerSec)) return

      // ✅ 초기 로딩은 작은 윈도우(±3s)로 빠르게 표시, 이후 ±12s
      const HALF = reason === 'grid-ready' ? 3 : reason === 'seek' ? 2 : 12
      const isAcc = logAccModeRef.current === 'accumulate'
      const startSec = Math.max(0, centerSec - HALF)
      const endSec = exp > 0 ? Math.min(exp, centerSec + HALF) : centerSec + HALF

      // timebase 준비 전 스킵(기존 로직 유지)
      const baseMs = t0EpochMsRef.current
      if (!(Number.isFinite(baseMs) && baseMs > 0)) {
        console.log('[POSE][WINDOW] skip (timebase not ready)', { reason, centerSec, startSec, endSec })
        return
      }

      // ✅ 공통: 진행 중/완료된 윈도우가 커버하면 skip (중복 요청 방지)
      const cur = activePoseWindowRef.current || {}
      if (
        Number.isFinite(cur.startSec) &&
        Number.isFinite(cur.endSec) &&
        centerSec >= cur.startSec &&
        centerSec <= cur.endSec
      ) {
        return
      }

      // ✅ 누적 모드 추가: 이미 캐시로 커버된 구간이면 skip
      if (isAcc && accEndCoveredRef.current > 0 && centerSec <= accEndCoveredRef.current - 2) {
        return
      }

      activePoseWindowRef.current = { startSec, endSec }

      const seq = ++poseWindowSeqRef.current
      console.log('[POSE][WINDOW REQ]', { seq, reason, centerSec, startSec, endSec })

      try {
        const raw = await loadPosesFromMcapUrl(url, {
          startSec,
          endSec,
          fullScan: true,
          previewLimit: Infinity,
          maxMillis: Infinity,
          downsample: 1,
          timeDownsampleMs: 50
        })

        if (!currentMcapUrlRef.current) return

        // ✅ raw는 이미 playback-relative tSec이므로 그대로 정규화
        let norm = []
        if (Array.isArray(raw)) {
          for (const r of raw) {
            const t = Number(r?.tSec)
            const x = Number(r?.x)
            const y = Number(r?.y)
            const yaw = Number(r?.yaw) || 0
            if (!Number.isFinite(t) || !Number.isFinite(x) || !Number.isFinite(y)) continue
            norm.push({ tSec: t, x, y, yaw })
          }
        }

        // 정렬 + 동일 tSec dedupe(마지막 우선)
        norm.sort((a, b) => a.tSec - b.tSec)
        for (let i = norm.length - 2; i >= 0; i--) {
          if (norm[i].tSec === norm[i + 1].tSec) norm.splice(i, 1)
        }

        // 최소 2점 보장(Player2D 가드 대응)
        if (norm.length === 1) {
          const p = norm[0]
          norm = [p, { ...p, tSec: p.tSec + 1e-6 }]
        }

        // 최신 요청만 반영
        if (seq !== poseWindowSeqRef.current) return

        // ✅ cache + 화면 반영

        if (logAccModeRef.current === 'accumulate') {
          const merged = poseWindowCacheRef.current.concat(norm)
          merged.sort((a, b) => a.tSec - b.tSec)

          // dedupe
          for (let i = merged.length - 2; i >= 0; i--) {
            if (merged[i].tSec === merged[i + 1].tSec) merged.splice(i, 1)
          }

          poseWindowCacheRef.current = merged
        } else {
          // seek 모드
          poseWindowCacheRef.current = norm
        }

        lastPoseApplyIdxRef.current = -1

        // ✅ ADD: odom chart 데이터 생성
        if (typeof setOdomSeries === 'function') {
          const series = norm.map((p) => ({
            tSec: p.tSec,
            // 거리 기준 (원점부터)
            dist: Math.hypot(p.x, p.y),
            x: p.x,
            y: p.y,
            yaw: p.yaw
          }))
          setOdomSeries(series)
        }

        // window 궤적을 전체 replace로 보여줌
        setPathPoints?.(norm)
        renderNow?.()

        // 현재 playhead에 즉시 적용(로봇 위치 갱신)
        let nowT = centerSec
        try {
          if (typeof getPlayTimeSec === 'function') {
            const v = Number(getPlayTimeSec())
            if (Number.isFinite(v)) nowT = v
          }
        } catch {}
        applyPoseByPlayhead(nowT)
      } catch (e) {
        console.warn('[POSE][WINDOW REQ] failed:', e)
      }
    }

    // 외부(useEffect)에서 호출할 수 있도록 ref로 연결
    requestPoseWindowRef.current = requestPoseWindow
    // ✅ [ADD] rosout window 로딩 (pose와 동일 패턴)
    const requestLogWindow = async (centerSec, reason = 'unknown') => {
      const url = currentMcapUrlRef.current
      if (!url) return

      const exp = Number(expectedDurationSecRef.current) || 0
      if (!Number.isFinite(centerSec)) return

      const HALF = reason === 'grid-ready' ? 3 : reason === 'seek' ? 2 : 12
      const isAcc = logAccModeRef.current === 'accumulate'

      const startSec = isAcc && accEndCoveredRef.current > 0 ? accEndCoveredRef.current : Math.max(0, centerSec - HALF)

      const endSec = exp > 0 ? Math.min(exp, centerSec + HALF) : centerSec + HALF

      // ✅ 누적이 꼬여서 startSec가 endSec 이상이 되면 무의미한 요청이므로 스킵
      if (Number.isFinite(startSec) && Number.isFinite(endSec) && startSec >= endSec - 1e-6) {
        return
      }

      // timebase 준비 전 스킵
      const baseMs = t0EpochMsRef.current
      if (!(Number.isFinite(baseMs) && baseMs > 0)) {
        console.log('[LOG][WINDOW] skip (timebase not ready)', { reason, centerSec, startSec, endSec })
        return
      }

      // 이미 커버 중이면 skip

      const cache = logWindowCacheRef.current
      if (Array.isArray(cache) && cache.length > 0) {
        const first = Number(cache[0]?.tSec)
        const last = Number(cache[cache.length - 1]?.tSec)

        if (Number.isFinite(first) && Number.isFinite(last) && centerSec >= first && centerSec <= last) {
          return
        }
      }

      activeLogWindowRef.current = { startSec, endSec }
      const seq = ++logWindowSeqRef.current
      console.log('[LOG][WINDOW REQ]', { seq, reason, centerSec, startSec, endSec })

      setIsLoadingLogs(true)
      try {
        const res = await loadRosoutFromMcapUrl(url, {
          startSec,
          endSec,
          maxLines: 50000,
          batchSize: 500,
          timeDownsampleMs: 0,
          onBatch: (batch) => {
            // ✅ 검색 인덱싱이 필요하면 유지(원치 않으면 이 블록 제거 가능)
            try {
              searchAdd?.(
                batch.map((e) => ({
                  ts: logSeqRef.current++,
                  level: e.level,
                  text: e.text,
                  pbMs: Math.round(e.tSec * 1000)
                }))
              )
            } catch {}
          }
        })

        if (!currentMcapUrlRef.current) return // ✅ reset 이후 응답 무시

        // 최신 요청만 반영
        if (seq !== logWindowSeqRef.current) return

        if (!res?.found) {
          if (isAcc) {
            accEndCoveredRef.current = endSec // 빈 구간도 커버 마킹
          } else {
            logWindowCacheRef.current = []
            setLogLines([])
            setFilteredLines(['표시할 로그가 없습니다.'])
          }

          return
        }

        const norm = Array.isArray(res.entries) ? res.entries : []

        console.log('[LOG][WINDOW DONE]', {
          total: norm.length,
          first: norm[0]?.tSec,
          last: norm[norm.length - 1]?.tSec
        })

        console.log('[LOG WINDOW AFTER MERGE]', {
          mode: logAccModeRef.current,
          cacheSize: logWindowCacheRef.current.length,
          accEnd: accEndCoveredRef.current
        })

        norm.sort((a, b) => a.tSec - b.tSec)
        for (let i = norm.length - 2; i >= 0; i--) {
          if (norm[i].tSec === norm[i + 1].tSec) norm.splice(i, 1)
        }

        if (isAcc) {
          // 누적: 기존 캐시에 append → sort → dedupe
          const merged = logWindowCacheRef.current.concat(norm)
          merged.sort((a, b) => a.tSec - b.tSec)
          for (let i = merged.length - 2; i >= 0; i--) {
            if (merged[i].tSec === merged[i + 1].tSec) merged.splice(i, 1)
          }
          logWindowCacheRef.current = merged
          accEndCoveredRef.current = endSec
        } else {
          // seek: 기존 로직 (REPLACE)
          logWindowCacheRef.current = norm
        }
        lastLogApplyIdxRef.current = -1

        // 즉시 현재 시점까지 반영

        requestAnimationFrame(() => {
          applyLogsByPlayhead(centerSec)
        })
      } catch (e) {
        console.warn('[LOG][WINDOW REQ] failed:', e)
        logWindowCacheRef.current = []
        setLogLines([])
        setFilteredLines(['표시할 로그가 없습니다.'])
      } finally {
        setIsLoadingLogs(false)
      }
    }
    // 외부(polling)에서 호출할 수 있게 ref 연결
    requestLogWindowRef.current = requestLogWindow
    // ── 공통 overlay window loader (costmap / path / goalPose) ──
    const OVERLAY_LOADERS = {
      costmap: {
        load: 'loadCostmapWindowFromMcapUrl',
        opts: { timeDownsampleMs: 250, maxFrames: 2000 },
        extract: (res) => res?.frames ?? []
      },
      path: {
        load: 'loadPathWindowFromMcapUrl',
        opts: { timeDownsampleMs: 200, maxMsgs: 800 },
        extract: (res) => res?.plans ?? []
      },
      goalPose: {
        load: 'loadGoalPoseWindowFromMcapUrl',
        opts: { maxGoals: 800 },
        extract: (res) => res?.goals ?? []
      }
    }

    const requestOverlayWindow = async (key, centerSec, reason) => {
      const url = currentMcapUrlRef.current
      if (!url) return

      const cfg = OVERLAY_LOADERS[key]
      if (!cfg) return

      const state = overlayRef.current[key]
      if (!state) return

      const exp = Number(expectedDurationSecRef.current) || 0
      if (!Number.isFinite(centerSec)) return

      const baseMs = t0EpochMsRef.current
      if (!(Number.isFinite(baseMs) && baseMs > 0)) return

      const HALF = reason === 'grid-ready' ? 3 : reason === 'seek' ? 2 : 12
      const startSec = Math.max(0, centerSec - HALF)
      const endSec = exp > 0 ? Math.min(exp, centerSec + HALF) : centerSec + HALF

      // skip if covered
      const { s, e } = state.active
      if (s != null && e != null && centerSec >= s && centerSec <= e) return

      state.active = { s: startSec, e: endSec }
      const seq = ++state.seq

      try {
        const mod = await import('../mcap/mcapLoader.js')
        const loaderFn = mod[cfg.load]
        if (typeof loaderFn !== 'function') {
          console.warn(`[OVERLAY][${key}] loader not found: ${cfg.load}`)
          return
        }

        const raw = await loaderFn(url, { ...cfg.opts, startSec, endSec })

        if (seq !== state.seq) return // stale

        const arr = cfg.extract(raw)
        arr.sort((a, b) => (a.tSec ?? 0) - (b.tSec ?? 0))

        state.cache = arr
        state.lastIdx = -1

        console.log(`[OVERLAY][${key}] loaded`, {
          count: arr.length,
          startSec,
          endSec,
          reason
        })
      } catch (err) {
        console.warn(`[OVERLAY][${key}] window failed:`, err)
      }
    }

    requestOverlayWindowRef.current = requestOverlayWindow

    // ✅ Overview 차트 (전체 범위, 1회)
    const requestChartOverview = async () => {
      const url = currentMcapUrlRef.current
      if (!url) return
      setChartLoading(true)
      try {
        const poses = await loadPosesSparseFromMcapUrl(url, {
          numSamples: 30,
          batchSize: 10,
          onBatch: (posesSoFar) => {
            if (!currentMcapUrlRef.current) return
            const { c1, c2 } = buildOdomChartsFromPoses(posesSoFar)
            setOdomChart1(c1)
            setOdomChart2(c2)
            if (chartLoading) setChartLoading(false)
          }
        })
        console.log('[CHART][OVERVIEW] done', { points: poses.length })
      } catch (e) {
        console.warn('[CHART][OVERVIEW] failed:', e)
      } finally {
        setChartLoading(false)
      }
    }
    requestChartOverviewRef.current = requestChartOverview

    try {
      // ✅ pose는 사용자가 playbar를 조작할 때만 on-demand 로딩
      posesDoneRef.current.v = true

      const clipTail = (arr, max) => (arr.length > max ? arr.slice(arr.length - max) : arr)
      const appendLines = (batch) => {
        if (!Array.isArray(batch) || batch.length === 0) return

        setLogLines((prev) => {
          const merged = prev.concat(batch)
          return clipTail(merged, MAX_LOG_LINES_IN_MEMORY)
        })

        // ✅ 로딩 중에도 인덱싱(add)은 수행해야 검색이 된다
        try {
          let lastAbsMs = Number.NaN
          let lastPbMs = Number.NaN
          const normalized = batch.map((raw) => {
            const text = String(raw ?? '')
            const level = detectLevelExt(text)
            const absMs = extractEpochMsFromLine(text)
            if (Number.isFinite(absMs)) {
              lastAbsMs = absMs
              const base = t0EpochMsRef.current
              const pb = base ? absMs - base : Number.NaN
              if (Number.isFinite(pb)) lastPbMs = pb
            }
            const pbMs = Number.isFinite(lastPbMs) ? lastPbMs : null
            const ts = logSeqRef.current++
            return { ts, level, text, pbMs }
          })
          searchAdd?.(normalized)
        } catch (e) {
          console.warn('[searchAdd] failed:', e)
        }
      }
      const appendSysLine = (text) => appendLines([`----- ${text} -----`])

      // [TIMEZONE/KST] 고정: glog 타임스탬프를 KST(UTC+9) 기준 절대시간으로 환산
      const toEpochMsKST = (Y, M, D, hh, mm, ss, ms) =>
        Date.UTC(Number(Y), Number(M) - 1, Number(D), Number(hh) - 9, Number(mm), Number(ss), Number(ms || 0))

      // KST 타임스탬프 표시용 포맷터
      const formatKst = (tMs) => {
        if (!Number.isFinite(tMs)) return ''
        const k = new Date(tMs + 9 * 60 * 60 * 1000)
        const yyyy = k.getUTCFullYear()
        const mm = String(k.getUTCMonth() + 1).padStart(2, '0')
        const dd = String(k.getUTCDate()).padStart(2, '0')
        const HH = String(k.getUTCHours()).padStart(2, '0')
        const MM = String(k.getUTCMinutes()).padStart(2, '0')
        const SS = String(k.getUTCSeconds()).padStart(2, '0')
        const mmm = String(k.getUTCMilliseconds()).padStart(3, '0')
        return `${yyyy}-${mm}-${dd} ${HH}:${MM}:${SS}.${mmm} KST`
      }

      const SHOW_KST_PREFIX = true

      // glog/ROS 혼합 로그 레벨 감지
      const detectLevelExt = (text) => {
        const base = detectLevel(text)
        if (base) return base
        const s = String(text || '')
        if (/^\s*WARNING:/.test(s)) return 'WARN'
        if (/^\s*ERROR:/.test(s)) return 'ERROR'
        if (/^\s*DEBUG:/.test(s)) return 'DEBUG'
        const m = s.match(/^\s*([IWEFD])\d{8}\s+\d{2}:\d{2}:\d{2}(?:\.\d+)?/)
        if (m) {
          const c = m[1]
          if (c === 'I') return 'INFO'
          if (c === 'W') return 'WARN'
          if (c === 'E') return 'ERROR'
          if (c === 'F') return 'FATAL'
          if (c === 'D') return 'DEBUG'
        }
        return 'INFO'
      }

      // 라인에서 epoch(ms) 추출
      const extractEpochMsFromLine = (text) => {
        const s = String(text || '')
        // (A) [1651167756.118140838]
        const all = s.match(/\[(\d{9,10}(?:\.\d{1,9})?)\]/g)
        if (all && all.length) {
          const last = all[all.length - 1].replace(/[\[\]]/g, '')
          const sec = parseFloat(last)
          if (Number.isFinite(sec)) return Math.round(sec * 1000)
        }
        // (B) glog: ^[IWEFD]YYYYMMDD HH:MM:SS(.us)
        const g = s.match(/^\s*[IWEFD](\d{4})(\d{2})(\d{2})\s+(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?/)
        if (g) {
          const [, Y, Mo, D, hh, mm, ss, fracRaw] = g
          const ms = Math.floor((fracRaw || '').padEnd(3, '0').slice(0, 3))
          return toEpochMsKST(Y, Mo, D, hh, mm, ss, ms)
        }
        return Number.NaN
      }

      // 정규화된 라인(레벨/타임스탬프 포함) append + 검색 인덱스 업데이트
      // items: [{ text, level, tMs }]
      const appendNormalizedBatch = (items) => {
        if (!Array.isArray(items) || items.length === 0) return

        const normalized = items.map((it) => {
          const textRaw = String(it?.text ?? '')
          const level = it?.level || 'INFO'
          const tMs = Number(it?.tMs)
          const prefix = SHOW_KST_PREFIX ? `[${formatKst(tMs)}] ` : ''
          const text = prefix + textRaw
          const ts = logSeqRef.current++
          const base = t0EpochMsRef.current
          const pbMs = base && Number.isFinite(tMs) ? tMs - base : null
          return { ts, level, text, pbMs }
        })

        const nextTexts = normalized.map((n) => n.text)
        setLogLines((prev) => {
          const merged = prev.concat(nextTexts)
          return clipTail(merged, MAX_LOG_LINES_IN_MEMORY)
        })

        // ✅ 로딩 중에도 인덱싱(add)은 수행
        try {
          searchAdd?.(normalized)
        } catch (e) {
          console.warn('[searchAdd] failed:', e)
        }
      }

      // ──────────────────────────────────────────────────────────────
      // const tryIngestTarLogsIfAvailable = async () => {
      //   // 필요 시 사전 로드 마저 수행
      //   dbg('TAR INGEST START')
      //   if (!tarGzBytesRef.current) {
      //     try {
      //       await prefetchTarGzForSelected(selected, logOptions, 'tar-fallback')
      //     } catch (e) {
      //       console.warn('[STEP2] prefetchTarGzForSelected failed:', e)
      //     }
      //   }
      //   const gz = tarGzBytesRef.current
      //   const meta = tarGzMetaRef.current
      //   if (!gz || !gz.length) {
      //     console.log('[STEP2] tar.gz not available')
      //     return false
      //   }

      //   try {
      //     // 1) gunzip → tar bytes
      //     const tarBytes = await gunzipToUint8Array(gz)
      //     if (!tarBytes || !tarBytes.length) {
      //       console.warn('[STEP2] gunzip result empty')
      //       return false
      //     }
      //     // 2) tar entries
      //     const entries = parseTarEntries(tarBytes)
      //     if (!entries.length) {
      //       console.warn('[STEP2] no tar entries')
      //       return false
      //     }

      //     // 진단 출력(시스템 라인) — 오너 선점 없이도 안전
      //     const asChar = (tf) => (tf ? String.fromCharCode(tf) : '0')
      //     console.log(
      //       '[STEP2] tar entries:',
      //       entries.map((e) => ({ name: e.name, size: e.size, typeflag: e.typeflag, tf: asChar(e.typeflag) }))
      //     )
      //     appendSysLine(`[TAR] ${meta?.label || 'tar.gz'} entries = ${entries.length}`)
      //     const LIST_LIMIT = 100
      //     const listPreview = entries.slice(0, LIST_LIMIT).map((e, i) => `${i + 1}. ${e.name} (${e.size} bytes)`)
      //     appendLines(listPreview)
      //     if (entries.length > LIST_LIMIT) appendSysLine(`[TAR] ...and ${entries.length - LIST_LIMIT} more`)

      //     // 3) 텍스트 로그 후보만 선택
      //     const textEntries = filterTextEntries(entries)
      //     if (!textEntries.length) {
      //       console.warn('[STEP2] no text-like entries → fallback to rosout')
      //       appendSysLine('[TAR] no text-like entries (check extensions or binary heuristic)')
      //       return false
      //     }

      //     console.log(`[STEP2] ingest text logs from tar: ${textEntries.length} files`)
      //     appendSysLine(`[TAR] ingest text entries = ${textEntries.length}`)

      //     // 4) 파일 단위/청크 단위로 "즉시/점진" append (전역 정렬 대기 제거)
      //     const EMIT_EVERY_LINES = 500 // 한 번에 내보낼 최소 라인 수 임계치
      //     const EMIT_EVERY_MS = 16 // 또는 마지막 방출 후 경과 시간(ms)
      //     const MINI_SORT_IN_CHUNK = true // 방출 직전 청크 내부 경량 정렬
      //     let lastTs = Number.NaN
      //     let emitBuf = []
      //     let lastEmitAt = Date.now()

      //     for (const ent of textEntries) {
      //       const text = decodeUtf8(ent.bytes)
      //       const lines = splitLines(text)
      //       let withTs = 0
      //       for (const line of lines) {
      //         const level = detectLevelExt(line)
      //         let tMs = extractEpochMsFromLine(line)
      //         if (Number.isFinite(tMs)) {
      //           withTs++
      //           lastTs = tMs
      //         } else if (Number.isFinite(lastTs)) {
      //           // 타임스탬프 없는 라인은 직전 시각
      //           tMs = lastTs
      //         }

      //         emitBuf.push({ text: line, level, tMs })

      //         // 일정 분량/시간마다 즉시 방출
      //         const now = Date.now()
      //         const sortByTms = (arr) => {
      //           arr.sort((a, b) => {
      //             const ta = Number.isFinite(a.tMs) ? a.tMs : Number.POSITIVE_INFINITY
      //             const tb = Number.isFinite(b.tMs) ? b.tMs : Number.POSITIVE_INFINITY
      //             return ta - tb
      //           })
      //         }

      //         if (emitBuf.length >= EMIT_EVERY_LINES || now - lastEmitAt >= EMIT_EVERY_MS) {
      //           // 첫 append 직전 오너 선점 (First-Writer-Wins)
      //           if (MINI_SORT_IN_CHUNK) {
      //             sortByTms(emitBuf)
      //           }
      //           appendNormalizedBatch(emitBuf)
      //           emitBuf = []
      //           lastEmitAt = now
      //           // 대용량 대응: 이벤트 루프 양보
      //           // eslint-disable-next-line no-await-in-loop
      //         }
      //       }
      //       appendSysLine(`[TAR] read ${ent.name} (lines=${lines.length}, withTs=${withTs})`)
      //       // 대용량 대응: 이벤트 루프 양보
      //       // eslint-disable-next-line no-await-in-loop
      //       await new Promise((r) => setTimeout(r, 0))
      //     }
      //     // 남은 버퍼 최종 방출(있다면)
      //     if (emitBuf.length) {
      //       if (MINI_SORT_IN_CHUNK) {
      //         emitBuf.sort((a, b) => {
      //           const ta = Number.isFinite(a.tMs) ? a.tMs : Number.POSITIVE_INFINITY
      //           const tb = Number.isFinite(b.tMs) ? b.tMs : Number.POSITIVE_INFINITY
      //           return ta - tb
      //         })
      //       }
      //       appendNormalizedBatch(emitBuf)
      //     }
      //     setHasAnyTarLogs(true) //tar 로그가 실제로 존재함
      //     dbg('TAR INGEST END', { ok: true })
      //     return true
      //   } catch (e) {
      //     console.warn('[STEP2] tar ingestion failed → fallback to rosout', e)
      //     appendSysLine(`[TAR] ingestion failed → fallback to rosout: ${e?.message || e}`)
      //     dbg('TAR INGEST END', { ok: false })
      //     return false
      //   }
      // }
      // ──────────────────────────────────────────────────────────────

      // ──────────────────────────────────────────────────────────────

      const gridPromise = (async () => {
        const { loadOccupancyGridFromMcapUrl } = await import('../mcap/mcapLoader.js')
        console.log('[GRID][STEP1] enter loadOccupancyGridFromMcapUrl', { downloadUrl })
        return await loadOccupancyGridFromMcapUrl(downloadUrl, {
          topic: TOPICS.grid,

          onTimeBounds: ({ startSec, durationSec }) => {
            // ✅ 플레이바 절대 기준
            if (t0EpochMsRef.current == null && Number.isFinite(startSec)) {
              const baseMs = Math.round(startSec * 1000)
              console.log('[TIMEBASE]', { baseMs, durationSec })
              t0EpochMsRef.current = baseMs
              setT0EpochMs?.(baseMs)

              // ✅ 디버깅용
              console.log('[PlayerDebug] t0EpochMs set, expect Player to show time')

              // ✅ grid 로더 내부에서 reader.readMessages()와 경쟁하지 않도록
              //    최초 pose window 요청은 gridPromise.then()에서 수행
              timebaseReadyRef.current = true
            }

            // ✅ 전체 길이
            if (Number.isFinite(durationSec) && durationSec > 0) {
              expectedDurationSecRef.current = durationSec
              setDurationMs?.(Math.round(durationSec * 1000))
            }
          }
        })
      })()
        .then((grid) => {
          console.log('[GRID][HOOK] grid result', grid)
          if (grid) setGridData?.(grid)

          renderNow?.()
          gridDoneRef.current.v = true

          // ✅ grid가 끝난 뒤(=readMessages 종료 후) 최초 0초 pose window 요청

          if (timebaseReadyRef.current) {
            timebaseReadyRef.current = false

            setChartLoading(true)
            setTimeout(async () => {
              await requestPoseWindowRef.current?.(0, 'grid-ready')
              requestLogWindowRef.current?.(0, 'grid-ready')
              // ── overlay topics ──
              requestOverlayWindowRef.current?.('costmap', 0, 'grid-ready')
              requestOverlayWindowRef.current?.('path', 0, 'grid-ready')
              requestOverlayWindowRef.current?.('goalPose', 0, 'grid-ready')
              requestChartOverviewRef.current?.()
            }, 0)
          }

          maybeSetReady()
          return grid
        })
        .catch((e) => {
          console.warn('[grid] failed:', e)
          dbg('GRID FAIL', e?.message || String(e))
          gridDoneRef.current.v = true
          // ✅ Step1(맵만 확인)에서는 grid가 들어오면 로딩 종료로 간주
          posesDoneRef.current.v = true
          setIsLoadingLogs(false)
          _setLoadPhase('ready')
          updateBuffer?.(1.0)

          maybeSetReady()
          return null
        })

      // void (async () => {
      //   let rosoutFound = false
      //   try {
      //     const rosoutAll = await loadLogsFromMcapUrl(downloadUrl, {
      //       logTopic: '/rosout',
      //       maxLines: SEARCH_LIMIT,
      //       onBatch: (arr) => {
      //         if (!Array.isArray(arr) || arr.length === 0) return
      //         rosoutFound = true
      //         appendLines(arr)
      //       },
      //       batchSize: 80,
      //       timeFlushMs: 120
      //     })
      //     if (Array.isArray(rosoutAll) && rosoutAll.length > 0) {
      //       rosoutFound = true
      //       setHasAnyTarLogs(true) //로그 소스 존재
      //       setLogLines((prev) => {
      //         if (prev.length >= rosoutAll.length) return prev

      //         const start = prev.length
      //         const tail = rosoutAll.slice(start) // ✅ 추가된 부분만
      //         // UI 갱신
      //         const merged = rosoutAll
      //         const clipped =
      //           merged.length > MAX_LOG_LINES_IN_MEMORY ? merged.slice(merged.length - MAX_LOG_LINES_IN_MEMORY) : merged

      //         // ✅ 추가분만 인덱싱
      //         try {
      //           const normalized = tail.map((raw) => {
      //             const text = String(raw ?? '')
      //             const level =
      //               (typeof detectLevelExt === 'function' ? detectLevelExt(text) : detectLevel(text)) || 'INFO'
      //             const ts = logSeqRef.current++
      //             return { ts, level, text }
      //           })
      //           searchAdd?.(normalized)
      //         } catch (e) {
      //           console.warn('[searchAdd rosout tail] failed:', e)
      //         }

      //         return clipped
      //       })
      //     }
      //   } catch (e) {
      //     console.warn('[rosout] load failed:', e)
      //   }
      //   if (!rosoutFound) {
      //     appendSysLine('[ROSOUT] not found → fallback to tar.gz')
      //     await tryIngestTarLogsIfAvailable()
      //   }
      //   setIsLoadingLogs(false)
      // })()

      Promise.allSettled([gridPromise]).then(() => {})
    } catch (err) {
      console.error('[handleViewLog] failed:', err)
      setLogError(err?.message || String(err))
      _setLoadPhase('error')
    } finally {
    }
  }, [
    selectedLogId,
    logOptions,
    getPresignedUrl,
    setPathPoints,
    setGridData,
    setLocalCostmapData,
    setLocalCostmapFrames,
    setPlannedPathPoints,
    setLidarScans,
    setDwaGoals,
    setT0EpochMs,
    resetView,
    renderNow,
    updateBuffer,
    buildOdomChartsFromPoses
  ])

  const formatDate = useCallback(function (yyyyMMdd) {
    if (!yyyyMMdd) return ''
    const [y, m, d] = yyyyMMdd.split('-')
    return `${y}.${m}.${d}`
  }, [])

  return {
    // 서버/옵션
    logOptions,
    selectedDate,
    selectedLogId,
    onDateChange,
    onLogChange,
    handleFetchListClick,
    handleVisibleRangeChange,
    allowedDateKeys,

    // 검색/로그
    logLines,
    filteredLines,
    isLoadingLogs,
    hasAnyTarLogs,
    isLoadingTar,
    tarError,
    logError,
    levelFilter,
    setLevelFilter,
    pendingKeyword,
    setPendingKeyword,
    appliedKeyword,
    handleKeywordSearchClick,

    // 다운로드/외부 오픈
    isPreparingDownload,
    handleDownloadLog,
    handleOpenLichtblick,

    // 오버레이
    loadPhase,
    rightOverlayVisible,
    rightOverlayText,

    // 유틸
    formatDate,

    // 조회
    handleViewLog,
    queryWindow,

    odomChart1,
    odomChart2,
    chartLoading,

    clearReplaySession
  }
}
