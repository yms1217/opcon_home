// hooks/useLogReplayPlayer2D.js
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { computeFit, applyZoomAtPointer, pixelsToWorldDelta, SmoothViewController } from '../view2d.js'
import { createCanvasRenderer } from '../mcap/render2d.js'
import { useThreeRobot } from '../logReplayRender.js'

/**
 * 2D 플레이어 + 뷰/렌더/캔버스 제어 + 3D 싱크
 * - 입력: pathPoints, plannedPathPoints, gridData, loadPhase, t0EpochMs
 * - 출력: 재생/스크럽/뷰 핸들러, 시간/버퍼/진행, 캔버스/프로그레스바 ref, 3D refs 등
 */
export default function useLogReplayPlayer2D({
  pathPoints,
  plannedPathPoints,
  gridData,
  localCostmapData,
  localCostmapFrames,
  lidarScans,
  dwaGoals,
  renderOptions, //    { showPath, showVelocityVector, showObstacles, showSensorPoints }
  loadPhase,
  t0EpochMs
}) {
  // 캔버스
  const canvasRef = useRef(null)

  // refs 동기화 (렌더러는 ref를 본다)
  const pathPointsRef = useRef([])
  const plannedPathPointsRef = useRef([])
  const gridDataRef = useRef(null)
  const localCostmapDataRef = useRef(null)
  const lidarScansRef = useRef([])
  const dwaGoalsRef = useRef([])
  const playTimeSecRef = useRef(0)
  const [playTimeSec, setPlayTimeSec] = useState(0)
  const isStreamingRef = useRef(false)

  // ✅ render2d가 직접 읽는 옵션 ref
  const renderOptionsRef = useRef({
    showTrajectory: true,
    showPlannedPath: false,
    showCostmap: false,
    showGoalAndHeading: false
  })

  // Header 옵션 변경 → ref 동기화
  useEffect(() => {
    if (renderOptions && typeof renderOptions === 'object') {
      renderOptionsRef.current = {
        ...renderOptionsRef.current,
        ...renderOptions
      }
    }
  }, [renderOptions])

  // ⚠️ 렌더러는 playTimeSecRef.current를 참조한다.
  // 상태만 0으로 리셋하면 첫 렌더 프레임에서 ref가 예전 값으로 남아
  // "이미 재생된 상태(연두색)"로 보일 수 있으므로 동기화해 준다.
  useEffect(() => {
    playTimeSecRef.current = Number(playTimeSec) || 0
  }, [playTimeSec])

  useEffect(() => {
    pathPointsRef.current = Array.isArray(pathPoints) ? pathPoints : []
  }, [pathPoints])
  useEffect(() => {
    plannedPathPointsRef.current = Array.isArray(plannedPathPoints) ? plannedPathPoints : []
  }, [plannedPathPoints])
  useEffect(() => {
    gridDataRef.current = gridData || null
  }, [gridData])
  useEffect(() => {
    localCostmapDataRef.current = localCostmapData || null
  }, [localCostmapData])
  // ★ [ADD] 코스트맵 프레임 시리즈 Ref
  const localCostmapFramesRef = useRef([])
  useEffect(() => {
    localCostmapFramesRef.current = Array.isArray(localCostmapFrames) ? localCostmapFrames : []
  }, [localCostmapFrames])
  useEffect(() => {
    lidarScansRef.current = Array.isArray(lidarScans) ? lidarScans : []
  }, [lidarScans])
  useEffect(() => {
    dwaGoalsRef.current = Array.isArray(dwaGoals) ? dwaGoals : []
  }, [dwaGoals])
  // 뷰/줌·팬
  const [view, setView] = useState({ zoom: 1, panX: 0, panY: 0 })
  const viewRef = useRef(view)
  useEffect(() => {
    viewRef.current = view
  }, [view])
  const smoothRef = useRef(new SmoothViewController(view))

  // 상호작용 상태(스무딩 억제/렌더 충돌 방지)
  const interactingRef = useRef(null) // null | 'drag' | 'wheel'
  const wheelIdleTimerRef = useRef(0)

  const resetView = useCallback(() => {
    if (isStreamingRef.current) return
    const base = { zoom: 1, panX: 0, panY: 0 }
    smoothRef.current = new SmoothViewController(base)
    viewRef.current = base
    setView(base)
  }, [])

  // 재생/시간
  const [isPlaying, setIsPlaying] = useState(false)
  const isPlayingRef = useRef(false)
  useEffect(() => {
    isPlayingRef.current = isPlaying
  }, [isPlaying])

  const [isScrubbing, setIsScrubbing] = useState(false)
  const wasPlayingRef = useRef(false)

  const [playIndex, setPlayIndex] = useState(0)
  const playIndexRef = useRef(0)
  useEffect(() => {
    playIndexRef.current = playIndex
  }, [playIndex])

  // 배속
  const [playbackRate, _setPlaybackRate] = useState(1)
  const playbackRateRef = useRef(1)
  const setPlaybackRate = useCallback((r) => {
    const v = Math.max(0.01, Math.min(10, Number(r) || 1))
    playbackRateRef.current = v
    _setPlaybackRate(v)
  }, [])

  // 버퍼바(애니메이션: target -> ratio)
  const [bufferRatio, setBufferRatio] = useState(0)
  const bufferRatioRef = useRef(0)
  const bufferTargetRef = useRef(0)

  useEffect(() => {
    bufferRatioRef.current = bufferRatio
  }, [bufferRatio])
  useEffect(() => {
    let raf = 0
    const tick = () => {
      const cur = bufferRatioRef.current
      const dst = bufferTargetRef.current
      // 목표가 1에 충분히 근접하면 부동소수/반올림 오차 없이 1로 고정
      const target = dst > 0.9995 ? 1 : dst
      const next = cur + (target - cur) * 0.18
      const snapped = Math.abs(target - next) < 0.002 ? target : next
      if (snapped !== cur) {
        bufferRatioRef.current = snapped
        setBufferRatio(snapped)
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  const updateBuffer = useCallback((v) => {
    const clamped = Math.max(0, Math.min(1, Number(v) || 0))
    bufferTargetRef.current = clamped
  }, [])

  // ✅ 로드 완료되면 버퍼를 즉시 1로 스냅 (easing 대기 없이 시각적 완충)
  useEffect(() => {
    if (loadPhase === 'ready') {
      bufferTargetRef.current = 1
      bufferRatioRef.current = 1
      setBufferRatio(1)
    }
  }, [loadPhase])

  // 렌더러
  const renderFnRef = useRef(null)
  const renderScheduledRef = useRef(false)
  const renderNow = useCallback(() => {
    if (renderScheduledRef.current || !renderFnRef.current) return
    renderScheduledRef.current = true
    requestAnimationFrame(() => {
      renderScheduledRef.current = false
      renderFnRef.current()
    })
  }, [])

  const t0EpochMsRef = useRef(null)
  useEffect(() => {
    t0EpochMsRef.current = t0EpochMs
  }, [t0EpochMs]) // ★ 상태와 ref 동기화
  const renderMap2D = useMemo(() => {
    const fn = createCanvasRenderer({
      canvasRef,
      pathPointsRef,
      plannedPathPointsRef,
      gridDataRef,
      localCostmapDataRef,
      localCostmapFramesRef,
      t0EpochMsRef,
      lidarScansRef,
      dwaGoalsRef,
      playTimeSecRef,
      playIndexRef,
      viewRef,
      smoothRef,
      renderOptionsRef
    })
    renderFnRef.current = fn
    return fn
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 뷰 변경 시 렌더 (state 커밋이 있을 때만)
  useEffect(() => {
    renderNow()
  }, [view, renderNow])

  //표시 옵션 변경 시 즉시 반영(뷰 변경 없이도 redraw)
  useEffect(() => {
    renderNow()
  }, [renderOptions, renderNow])

  // 부드러운 뷰 보간 루프(상호작용 중엔 step 억제)
  useEffect(() => {
    let raf = 0
    const tick = () => {
      smoothRef.current.setTarget(viewRef.current)
      if (!interactingRef.current) {
        const changed = smoothRef.current.step(0.18)
        if (changed) renderNow()
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [renderNow])

  // 캔버스 이벤트(휠/드래그)
  const pauseOnMapInteraction = useCallback(() => {
    if (isPlayingRef.current) setIsPlaying(false)
  }, [])

  const roundView = (v) => ({
    zoom: Math.round((v.zoom ?? 1) * 1e4) / 1e4,
    panX: Math.round((v.panX ?? 0) * 1e4) / 1e4,
    panY: Math.round((v.panY ?? 0) * 1e4) / 1e4
  })

  const onCanvasWheel = useCallback(
    (e) => {
      e.preventDefault()
      if (loadPhase !== 'ready') return
      const cvs = canvasRef.current
      const grid = gridDataRef.current
      const pts = pathPointsRef.current || []
      if (!cvs || !Array.isArray(pts) || pts.length < 2) return
      pauseOnMapInteraction()
      interactingRef.current = 'wheel'

      const rect = cvs.getBoundingClientRect()
      const px = e.clientX - rect.left
      const py = e.clientY - rect.top
      const cssW = cvs.clientWidth | 0
      const cssH = cvs.clientHeight | 0
      const fit = computeFit(grid?.info || grid, pts, cssW, cssH, 24)

      const next = applyZoomAtPointer(viewRef.current, fit, e.deltaY, px, py, {
        minZoom: 0.2,
        maxZoom: 8, // 초고배율 성능 폭주 방지 (원하면 10 유지)
        sensitivity: 0.0015
      })
      viewRef.current = roundView(next)
      smoothRef.current.setTarget(viewRef.current)
      renderNow()

      // 휠 종료 후 120ms 지나면 커밋 + 스무딩 재개
      if (wheelIdleTimerRef.current) clearTimeout(wheelIdleTimerRef.current)
      wheelIdleTimerRef.current = setTimeout(() => {
        interactingRef.current = null
        if (!isStreamingRef.current) {
          setView(viewRef.current)
        }
      }, 120)
    },
    [pauseOnMapInteraction, loadPhase, renderNow]
  )

  const canvasDragRef = useRef({ dragging: false, lastX: 0, lastY: 0, fit: null })
  const onCanvasMouseDown = useCallback(
    (e) => {
      if (e.button !== 0) return
      if (loadPhase !== 'ready') return
      const cvs = canvasRef.current
      if (!cvs) return
      e.preventDefault()
      pauseOnMapInteraction()

      const grid = gridDataRef.current
      const pts = pathPointsRef.current || []
      const cssW = cvs.clientWidth | 0
      const cssH = cvs.clientHeight | 0
      const fit = computeFit(grid?.info || grid, pts, cssW, cssH, 24)
      canvasDragRef.current = { dragging: true, lastX: e.clientX, lastY: e.clientY, fit }
      interactingRef.current = 'drag'

      const onMove = (ev) => {
        if (!canvasDragRef.current.dragging) return
        const dx = ev.clientX - canvasDragRef.current.lastX
        const dy = ev.clientY - canvasDragRef.current.lastY
        canvasDragRef.current.lastX = ev.clientX
        canvasDragRef.current.lastY = ev.clientY
        const { dPanX, dPanY } = pixelsToWorldDelta(viewRef.current, canvasDragRef.current.fit, dx, dy)
        viewRef.current = roundView({
          ...viewRef.current,
          panX: viewRef.current.panX + dPanX,
          panY: viewRef.current.panY + dPanY
        })
        smoothRef.current.setTarget(viewRef.current)
        renderNow()
      }
      const onUp = () => {
        canvasDragRef.current.dragging = false
        interactingRef.current = null

        if (!isStreamingRef.current) {
          setView(viewRef.current)
        }

        window.removeEventListener('mousemove', onMove)
        window.removeEventListener('mouseup', onUp)
      }
      window.addEventListener('mousemove', onMove)
      window.addEventListener('mouseup', onUp)
    },
    [pauseOnMapInteraction, loadPhase, renderNow]
  )

  useEffect(() => {
    const cvs = canvasRef.current
    if (!cvs) return
    const wheelHandler = (ev) => {
      ev.preventDefault()
      onCanvasWheel(ev)
    }
    const touchMoveBlocker = (ev) => {
      ev.preventDefault()
    }
    const pointerMoveBlocker = (ev) => {
      if (canvasDragRef.current?.dragging) ev.preventDefault()
    }
    cvs.addEventListener('wheel', wheelHandler, { passive: false })
    cvs.addEventListener('touchmove', touchMoveBlocker, { passive: false })
    cvs.addEventListener('pointermove', pointerMoveBlocker, { passive: false })
    return () => {
      cvs.removeEventListener('wheel', wheelHandler)
      cvs.removeEventListener('touchmove', touchMoveBlocker)
      cvs.removeEventListener('pointermove', pointerMoveBlocker)
    }
  }, [onCanvasWheel])

  // canPlay
  const canPlay = useMemo(
    () => loadPhase === 'ready' && Array.isArray(pathPoints) && pathPoints.length >= 2,
    [loadPhase, pathPoints]
  )
  const leftPlayable = useMemo(() => Array.isArray(pathPoints) && pathPoints.length >= 2, [pathPoints])
  const controlsDisabled = !canPlay

  // 진행 비율
  const playRatio = useMemo(() => {
    const pts = Array.isArray(pathPoints) ? pathPoints : []
    if (pts.length < 2) return 0
    const dur = Math.max(0, (pts[pts.length - 1].tSec ?? 0) - (pts[0].tSec ?? 0))
    return dur > 0 ? Math.max(0, Math.min(1, playTimeSec / dur)) : 0
  }, [pathPoints, playTimeSec])

  // RAF 재생 루프
  const rafRef = useRef(0)

  // 외부에서 재생 관련 ref/state를 즉시 0으로 초기화하기 위한 헬퍼
  const resetPlaybackRefs = useCallback(() => {
    try {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = 0
    } catch {}
    // 재생 중지
    isPlayingRef.current = false
    setIsPlaying(false)
    // 플레이헤드/인덱스 0으로 (ref + state 모두)
    playTimeSecRef.current = 0
    setPlayTimeSec(0)
    playIndexRef.current = 0
    setPlayIndex(0)
  }, [])
  useEffect(() => {
    cancelAnimationFrame(rafRef.current)
    if (!isPlaying) return
    let last = performance.now()
    const loop = (now) => {
      if (isScrubbing) {
        last = now
        rafRef.current = requestAnimationFrame(loop)
        return
      }
      const dtSec = Math.max(0, (now - last) / 1000) * (playbackRateRef.current || 1)
      last = now

      const pts = pathPointsRef.current
      const ok = Array.isArray(pts) && pts.length >= 2
      const durationSec = ok ? Math.max(0, pts[pts.length - 1].tSec - pts[0].tSec) : 0
      if (!ok || durationSec <= 0) {
        setIsPlaying(false)
        return
      }

      let nextTime = playTimeSecRef.current + dtSec
      if (nextTime >= durationSec) {
        nextTime = durationSec
        playTimeSecRef.current = nextTime
        setPlayTimeSec(nextTime)
        playIndexRef.current = 499
        setPlayIndex(499)
        setIsPlaying(false)
        renderNow()
        return
      }

      playTimeSecRef.current = nextTime
      setPlayTimeSec(nextTime)

      const ratio = durationSec > 0 ? nextTime / durationSec : 0
      const idx = Math.max(0, Math.min(499, Math.round(ratio * 499)))
      playIndexRef.current = idx
      setPlayIndex(idx)

      renderNow()
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(rafRef.current)
  }, [isPlaying, isScrubbing, renderNow])

  // 스크럽(플레이바 드래그) — 실시간 렌더 보장
  const progressBarRef = useRef(null)
  const setPlayHeadByRatio = useCallback(
    (r, { emitIndex = true } = {}) => {
      const pts = pathPointsRef.current
      if (!pts || pts.length < 2) return
      const t0 = pts[0].tSec ?? 0
      const t1 = pts[pts.length - 1].tSec ?? 0
      const dur = Math.max(0, t1 - t0)
      const nextTime = Math.max(0, Math.min(dur, r * dur))
      playTimeSecRef.current = nextTime
      setPlayTimeSec(nextTime)
      if (emitIndex) {
        const idx = Math.max(0, Math.min(499, Math.round((dur > 0 ? nextTime / dur : 0) * 499)))
        playIndexRef.current = idx
        setPlayIndex(idx)
      }
      renderNow() // ← 실시간 반영
    },
    [renderNow]
  )

  const handleProgressPointerDown = useCallback(
    (e) => {
      const pts = pathPointsRef.current || []
      if (!Array.isArray(pts) || pts.length < 2) return
      const bar = progressBarRef.current
      if (!bar) return

      e.preventDefault()
      wasPlayingRef.current = isPlayingRef.current
      setIsPlaying(false)
      setIsScrubbing(true)

      const getRatio = (clientX) => {
        const rect = bar.getBoundingClientRect()
        const r = (clientX - rect.left) / Math.max(1, rect.width)
        return Math.max(0, Math.min(1, r))
      }

      setPlayHeadByRatio(getRatio(e.clientX))

      const onMove = (ev) => setPlayHeadByRatio(getRatio(ev.clientX))
      const onUp = () => {
        window.removeEventListener('mousemove', onMove)
        window.removeEventListener('mouseup', onUp)
        setIsScrubbing(false)
        if (wasPlayingRef.current) setIsPlaying(true)
      }

      window.addEventListener('mousemove', onMove)
      window.addEventListener('mouseup', onUp)
    },
    [setPlayHeadByRatio]
  )

  // RAF 재생 루프 위쪽/아래쪽 아무 데나 보조 함수 영역에 추가
  // ▶ base step(초) at 1x — 필요시 0.5 같은 값으로 미세조정 가능합니다.
  const stepSecondsRef = useRef(1) // 1×에서 1초 이동

  // ▶ 배속을 반영해 "초 단위"로 스텝 이동
  const _stepBySeconds = useCallback(
    (dir = +1) => {
      const pts = pathPointsRef.current || []
      if (!Array.isArray(pts) || pts.length < 2) return

      const t0 = Number(pts[0]?.tSec) || 0
      const t1 = Number(pts[pts.length - 1]?.tSec) || 0
      const dur = Math.max(0, t1 - t0)
      if (dur <= 0) return

      const rate = Math.max(0.01, Math.min(10, Number(playbackRateRef.current) || 1))
      const baseStepSec = Number(stepSecondsRef.current) || 1
      const delta = baseStepSec * rate * (dir >= 0 ? 1 : -1)

      let nextTimeSec = (Number(playTimeSecRef.current) || 0) + delta
      nextTimeSec = Math.max(0, Math.min(dur, nextTimeSec)) // 경계 클램프

      // 시간 반영
      playTimeSecRef.current = nextTimeSec
      setPlayTimeSec(nextTimeSec)

      // 인덱스(0..499) 환산 — 기존 파이프라인과 호환 유지
      const ratio = dur > 0 ? nextTimeSec / dur : 0
      const idx = Math.max(0, Math.min(499, Math.round(ratio * 499)))
      playIndexRef.current = idx
      setPlayIndex(idx)

      renderNow()
    },
    [renderNow]
  )

  // ▼ REPLACE: 이전 프레임(배속 반영)
  const handlePrevFrame = useCallback(() => {
    const pts = pathPointsRef.current || []
    if (!Array.isArray(pts) || pts.length < 2) return
    setIsPlaying(false)
    _stepBySeconds(-1) // ← 배속 × 1초 기준으로 한 스텝 뒤로
  }, [_stepBySeconds])

  // ▼ REPLACE: 다음 프레임(배속 반영)
  const handleNextFrame = useCallback(() => {
    const pts = pathPointsRef.current || []
    if (!Array.isArray(pts) || pts.length < 2) return
    setIsPlaying(false)
    _stepBySeconds(+1) // ← 배속 × 1초 기준으로 한 스텝 앞으로
  }, [_stepBySeconds])

  const handleTogglePlay = useCallback(() => {
    const pts = pathPointsRef.current || []
    const can = loadPhase === 'ready' && Array.isArray(pts) && pts.length >= 2
    if (!can) return
    setIsPlaying((p) => {
      if (!p) {
        const atEnd = typeof playIndexRef.current === 'number' && playIndexRef.current >= 499 - 0.001
        if (atEnd) {
          playTimeSecRef.current = 0
          setPlayTimeSec(0)
          playIndexRef.current = 0
          setPlayIndex(0)
          renderNow()
        }
      }
      return !p
    })
  }, [renderNow, loadPhase])

  // 시간 라벨
  const formatKST = useCallback((ms) => {
    try {
      const dt = new Date(ms)
      const parts = new Intl.DateTimeFormat('ko-KR', {
        timeZone: 'Asia/Seoul',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour12: true,
        hour: 'numeric',
        minute: '2-digit',
        second: '2-digit'
      }).formatToParts(dt)
      const get = (type) => parts.find((p) => p.type === type)?.value ?? ''
      const y = get('year'),
        m = get('month'),
        d = get('day')
      const hour = get('hour'),
        minute = get('minute'),
        second = get('second')
      const dayPeriod = get('dayPeriod')?.toUpperCase() || (dt.getHours() < 12 ? 'AM' : 'PM')
      const SSS = String(dt.getMilliseconds()).padStart(3, '0')
      return `${y}-${m}-${d} ${hour}:${minute}:${second}.${SSS} ${dayPeriod} KST`
    } catch {
      return '0000-00-00 0:00:00.000 AM KST'
    }
  }, [])

  const { durationMs, currentTimestampMs, formattedCurrentTime, formattedDuration } = useMemo(() => {
    const pts = Array.isArray(pathPoints) ? pathPoints : []
    if (pts.length < 2) {
      return {
        durationMs: 0,
        currentTimestampMs: 0,
        formattedCurrentTime: '0000-00-00 0:00:00.000 AM KST',
        formattedDuration: '0000-00-00 0:00:00.000 AM KST'
      }
    }
    const durationSec = Math.max(0, pts[pts.length - 1].tSec - pts[0].tSec || 0)
    const durationMs = Math.round(durationSec * 1000)
    const clampedTimeSec = Math.max(0, Math.min(durationSec, playTimeSec))
    const currentTimestampMs = Math.round(clampedTimeSec * 1000)

    const baseMs = Number(t0EpochMs) || 0
    const absCurrentMs = baseMs + currentTimestampMs
    const absEndMs = baseMs + durationMs

    return {
      durationMs,
      currentTimestampMs,
      formattedCurrentTime: baseMs ? formatKST(absCurrentMs) : '0000-00-00 0:00:00.000 AM KST',
      formattedDuration: baseMs ? formatKST(absEndMs) : '0000-00-00 0:00:00.000 AM KST'
    }
  }, [pathPoints, playTimeSec, t0EpochMs, formatKST])

  // =========================
  // 진행바 Hover 시간(툴팁) 로직
  // =========================
  const [hoverVisible, setHoverVisible] = useState(false)
  const [hoverRatio, setHoverRatio] = useState(0)
  const [hoverMs, setHoverMs] = useState(0)
  const [hoverAbsLabel, setHoverAbsLabel] = useState('') // ★ 절대시간(KST)

  const getRatioFromEvent = useCallback((ev) => {
    const bar = progressBarRef.current
    if (!bar) return 0
    const rect = bar.getBoundingClientRect()
    const x = Math.max(rect.left, Math.min(ev.clientX, rect.right))
    const ratio = (x - rect.left) / Math.max(1, rect.width)
    return Math.max(0, Math.min(1, ratio))
  }, [])

  const onProgressMouseEnter = useCallback(
    (ev) => {
      if (!Number.isFinite(durationMs) || durationMs <= 0) return
      const r = getRatioFromEvent(ev)
      const ms = Math.round((Number(durationMs) || 0) * r)
      setHoverRatio(r)
      setHoverMs(ms)
      // ★ 절대 시간(KST) 포맷: t0EpochMs가 있으면 절대값으로 표기
      const baseMs = Number(t0EpochMs) || 0
      if (baseMs) {
        setHoverAbsLabel(formatKST(baseMs + ms))
      } else {
        setHoverAbsLabel('') // base가 없으면 PlayerBar에서 상대 ms로 표시
      }
      setHoverVisible(true)
    },
    [durationMs, getRatioFromEvent, t0EpochMs, formatKST]
  )

  const onProgressMouseMove = useCallback(
    (ev) => {
      if (!Number.isFinite(durationMs) || durationMs <= 0) {
        if (hoverVisible) setHoverVisible(false)
        return
      }
      const r = getRatioFromEvent(ev)
      const ms = Math.round((Number(durationMs) || 0) * r)
      setHoverRatio(r)
      setHoverMs(ms)
      const baseMs = Number(t0EpochMs) || 0
      if (baseMs) {
        setHoverAbsLabel(formatKST(baseMs + ms))
      } else {
        setHoverAbsLabel('')
      }
      if (!hoverVisible) setHoverVisible(true)
    },
    [durationMs, getRatioFromEvent, hoverVisible, t0EpochMs, formatKST]
  )

  const onProgressMouseLeave = useCallback(() => {
    setHoverVisible(false)
    setHoverAbsLabel('')
  }, [])

  // 3D 싱크
  const { threeMountRef, poses3d, setPoses3d, durationSec, currentTimeSec } = useThreeRobot(playIndex)

  // ready 전환 시 한 번 센터
  const readyOnceRef = useRef(false)
  useEffect(() => {
    if (loadPhase === 'loading') {
      isStreamingRef.current = true
      readyOnceRef.current = false
      return
    }

    if (loadPhase === 'ready' && !readyOnceRef.current) {
      isStreamingRef.current = false
      readyOnceRef.current = true
      resetView() // ✅ 딱 1회
      renderNow()
    }
  }, [loadPhase, resetView, renderNow])

  return {
    // 렌더/버퍼
    canvasRef,
    renderNow,
    updateBuffer,

    // 재생/시간/프로그레스
    isPlaying,
    setIsPlaying,
    playIndex,
    setPlayIndex,
    playTimeSec,
    setPlayTimeSec,
    playbackRate,
    setPlaybackRate,
    playRatio,
    bufferRatio,

    // 뷰
    view,
    setView,
    resetView,

    // 캔버스 인터랙션
    onCanvasWheel,
    onCanvasMouseDown,

    // 진행바/스크럽
    progressBarRef,
    handleProgressPointerDown,
    onProgressMouseEnter,
    onProgressMouseMove,
    onProgressMouseLeave,
    handlePrevFrame,
    handleTogglePlay,
    handleNextFrame,

    // 게이팅
    canPlay,
    leftPlayable,
    controlsDisabled,

    // 시간 라벨
    durationMs,
    currentTimestampMs,
    formattedCurrentTime,
    formattedDuration,
    // Hover 툴팁
    hoverVisible,
    hoverMs,
    hoverRatio,
    hoverAbsLabel,

    // 3D
    threeMountRef,
    poses3d,
    setPoses3d,
    durationSec,
    currentTimeSec,
    resetPlaybackRefs
  }
}
