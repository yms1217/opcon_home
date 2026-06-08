// index.jsx
import React, { useMemo, useCallback, useRef, useState, useEffect } from 'react'
import Header from './components/Header'
import ReplayLandingView from './components/ReplayLandingView'
import ReplayResultView from './components/ReplayResultView'
import LogEntriesUX from './components/LogEntriesUX'
import useReplayViewMode from './hooks/useReplayViewMode'
import { UX, theme } from './styles'
import { useSearchParams } from 'react-router-dom'
import { deviceApis } from '@/apis'
import useReplayControlsLogic from './hooks/useReplayControlsLogic'

export default function ReplayControlsUXOnlyPage() {
  const { viewMode, resultData, onQuery, goLanding } = useReplayViewMode('landing')

  // ✅ replay state (controlled)
  const [currentTime, setCurrentTime] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [playbackRate, setPlaybackRate] = useState(1.0)

  const [searchParams] = useSearchParams()
  const deviceId = searchParams.get('deviceId')
  const [deviceName, setDeviceName] = useState('')
  const today = new Date().toISOString().slice(0, 10)
  // issues (항상 배열 보장)

  const getDeviceName = async () => {
    try {
      const data = await deviceApis.getDeviceInfo(deviceId)
      if (!data?.deviceName) return
      setDeviceName((prev) => (prev === data.deviceName ? prev : data.deviceName))
    } catch (err) {
      console.error('Error loadGetDevices:', err)
    }
  }

  useEffect(() => {
    let canceled = false
    ;(async () => {
      try {
        const data = await deviceApis.getDeviceInfo(deviceId)
        if (!canceled && data?.deviceName) {
          setDeviceName((prev) => (prev === data.deviceName ? prev : data.deviceName))
        }
      } catch (e) {
        console.error('Error loadGetDevices:', e)
      }
    })()
    return () => {
      canceled = true
    }
  }, [deviceId])

  const {
    selectedDate,
    logOptions,
    selectedLogId,
    isLoadingList,
    isReadingFile,
    isPreparingDownload,
    mcapTopics,
    mcapTopicStats,
    mcapTopicSamples,
    mcapTimeRange,
    isParsingMcap,
    mcapParseError,
    allowedDateKeys,
    diagnosticEvents, // ✅ 추가 (훅에서 return하도록 이미 2번까지 적용하셨다고 했으니 여기서 받기만)
    onDateChange,
    onLogChange,
    handleFetchListClick,
    handleViewSelectedFile,
    handleDownloadLog,
    handleOpenLichtblick,
    handleVisibleRangeChange
  } = useReplayControlsLogic({ deviceId })

  const isMcapLoading = isReadingFile || isParsingMcap
  // Overview/탭에서 쓰기 좋은 형태로 묶어서 전달
  const mcapSummary = useMemo(
    () => ({
      topics: mcapTopics || [],
      stats: mcapTopicStats || null,
      samples: mcapTopicSamples || null,
      timeRange: mcapTimeRange || null
    }),
    [mcapTopics, mcapTopicStats, mcapTopicSamples, mcapTimeRange]
  )

  // 로더가 반환하는 timeRange를 함께 state로 들고 가는게 제일 깔끔함:
  // useReplayControlsLogic에 timeRange state 추가하거나, mcapSummary에 포함시키세요.
  // (아래 "3) useReplayControlsLogic" 보완안 참고)

  // ✅ totalDuration: timeRange가 있으면 로그 구간 기반으로 설정
  const totalDuration = useMemo(() => {
    const tr = mcapSummary?.timeRange
    return tr && Number.isFinite(tr.startSec) && Number.isFinite(tr.endSec)
      ? Math.max(0, tr.endSec - tr.startSec)
      : 10 * 60
  }, [mcapSummary])
  // issues (샘플) — duration 기반으로 생성 (항상 범위 내)
  const issues = useMemo(() => {
    const d = Number(totalDuration || 0)
    if (!Number.isFinite(d) || d <= 0) return []

    const mk = (ratio, level, component, message) => ({
      t: Math.max(0, Math.min(d, ratio * d)),
      level,
      component,
      message
    })

    return [
      mk(0.2, 'WARN', 'arm', 'Torque high'),
      mk(0.55, 'ERROR', 'ctrl', 'Timeout'),
      mk(0.85, 'WARN', 'base', 'Slip detected')
    ]
  }, [totalDuration])
  // ✅ handlers: ReplayControls -> 부모 state 업데이트

  const onSeek = useCallback((t) => {
    setCurrentTime((prev) => {
      //console.log('[Replay][onSeek]', { prev, next: t })
      return t
    })
  }, [])

  const onTogglePlay = useCallback(() => {
    setIsPlaying((p) => !p)
  }, [])

  const onStop = useCallback(() => {
    setIsPlaying(false)
  }, [])

  const onChangeRate = useCallback((r) => {
    const v = Number(r)
    setPlaybackRate(Number.isFinite(v) ? v : 1.0)
  }, [])

  // ✅ "처음" 버튼: 화면 + 플레이 상태까지 완전 초기화
  const handleGoLanding = useCallback(() => {
    // 1) 재생 정지
    setIsPlaying(false)
    // 2) 커서 0으로
    setCurrentTime(0)
    // 3) (선택) 속도도 기본값으로
    setPlaybackRate(1.0)
    // 4) 화면 전환
    goLanding?.()
  }, [goLanding])

  // Resizable log panel (UX only)
  const [logHeight, setLogHeight] = useState(null)
  const dragRef = useRef({ active: false, startY: 0, startH: 0 })
  const logWrapRef = useRef(null)

  // ✅ 초기 진입 시 로그 영역이 너무 작지 않도록 기본 높이 확보
  useEffect(() => {
    if (logHeight != null) return
    const h = Math.round(window.innerHeight * 0.28) // 기본 28vh 느낌
    setLogHeight(Math.max(220, Math.min(h, window.innerHeight * 0.6)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleResizeMouseDown = useCallback((e) => {
    e.preventDefault()

    // ✅ nextSibling 의존 제거: 실제 로그 wrapper 높이를 ref로 측정
    const currentH = logWrapRef.current?.getBoundingClientRect().height ?? 240
    dragRef.current = { active: true, startY: e.clientY, startH: currentH }

    function onMove(ev) {
      if (!dragRef.current.active) return
      const delta = dragRef.current.startY - ev.clientY
      const newH = Math.min(Math.max(dragRef.current.startH + delta, 80), window.innerHeight * 0.6)
      setLogHeight(Math.round(newH))
    }
    function onUp() {
      dragRef.current.active = false
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [])

  const handleQuery = async ({ source }) => {
    if (source === 'date') {
      // ✅ 날짜 조회: 로그 리스트만 갱신
      await handleFetchListClick()
      return
    }

    if (source === 'log') {
      // ✅ 로그 조회: result 화면을 먼저 띄워서(=스피너 노출 가능) 로딩 진행
      onQuery?.({ source })
      try {
        await handleViewSelectedFile() // (3) 읽기 + parsing 트리거
      } catch (e) {
        console.error('[Replay][handleViewSelectedFile] failed', e)
        // 필요하면 landing으로 되돌리는 정책도 가능:
        // goLanding?.()
      }
    }
  }

  return (
    <div style={UX.page}>
      {/* ✅ Header: 조회가 onQuery를 호출하도록 */}
      <Header
        robotName={deviceName}
        deviceId={deviceId}
        selectedDate={selectedDate}
        onDateChange={(date) => {
          handleGoLanding() // ✅ 플레이 + 화면 초기화
          onDateChange(date) // ✅ 날짜 상태 변경
        }}
        logOptions={logOptions}
        selectedLogId={selectedLogId}
        onLogChange={(logId) => {
          handleGoLanding() // ✅ 플레이 + 화면 초기화
          onLogChange(logId) // ✅ 날짜 상태 변경
        }}
        onDownload={handleDownloadLog} // (4)
        handleOpenLichtblick={handleOpenLichtblick}
        handleVisibleRangeChange={handleVisibleRangeChange}
        allowedDateKeys={allowedDateKeys}
        isPreparingDownload={isPreparingDownload || isLoadingList || isReadingFile}
        mode={viewMode}
        onQuery={handleQuery}
        onBack={handleGoLanding}
      />

      <div style={UX.layout}>
        <div style={UX.mainShell}>
          {/* ✅ Main: viewMode로만 분기 (resultData 존재여부로 landing으로 되돌아가지 않게) */}
          {viewMode === 'landing' ? (
            <ReplayLandingView
              currentTime={currentTime}
              totalDuration={totalDuration}
              isPlaying={isPlaying}
              playbackRate={playbackRate}
              issues={issues}
            />
          ) : (
            <ReplayResultView
              resultData={resultData}
              currentTime={currentTime}
              totalDuration={totalDuration}
              isPlaying={isPlaying}
              playbackRate={playbackRate}
              onSeek={onSeek}
              onTogglePlay={onTogglePlay}
              onStop={onStop}
              onChangeRate={onChangeRate}
              issues={issues}
              mcapSummary={mcapSummary}
              isParsingMcap={isParsingMcap}
              mcapParseError={mcapParseError}
              isMcapLoading={isMcapLoading}
              viewMode={viewMode}
            />
          )}
        </div>

        <div style={UX.resizeHandle} onMouseDown={handleResizeMouseDown}>
          <div style={UX.resizeGrip} />
        </div>

        <div
          ref={logWrapRef}
          style={{
            ...UX.logWrap,
            height: logHeight ? `${logHeight}px` : '28vh',
            minHeight: 220, // ✅ 너무 얇아지는 것 방지
            maxHeight: '60vh',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden'
          }}
        >
          {/* ✅ 내부가 부모 높이를 꽉 쓰도록 */}
          <div style={{ flex: '1 1 0', minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            <LogEntriesUX
              diagnosticEvents={diagnosticEvents}
              isParsingMcap={isParsingMcap}
              mcapParseError={mcapParseError}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
