// Logreplay/components/MapPanels.jsx
import React, { memo, useMemo, useRef, useEffect, useState } from 'react'
import { S } from '../styles'
import CoveragePanel from './CoveragePanel'
import SensorChart from './SensorChart'
import { Button } from '@repo/ui'
import DrivingMap3D from './DrivingMap3D'

// ✅ 이동면적(coverage) 데이터 확보 전까지 비활성
const ENABLE_COVERAGE_PANEL = false

// [REPLACE] Legend 전체 함수 교체 (패널만 렌더)
const Legend = memo(function Legend({ open = true }) {
  if (!open) return null
  return (
    <div style={S.legendBox} aria-label="지도 범례">
      <div style={S.legendRow}>
        <span style={S.robotTriIcon()} aria-hidden />
        <span>로봇(방향)</span>
      </div>
      <div style={S.legendRow}>
        <span style={S.circleSwatch('#10B981')} aria-hidden />
        <span>지나온 경로</span>
      </div>
      <div style={S.legendRow}>
        <span style={S.circleSwatch('#9CA3AF')} aria-hidden />
        <span>남은 경로</span>
      </div>
      <div style={S.legendRow}>
        <span style={S.circleSwatch('#FFA500')} aria-hidden />
        <span>LiDAR 포인트</span>
      </div>
      <div style={S.legendRow}>
        <div style={S.gradientBarMini} aria-hidden />
        <span style={{ whiteSpace: 'nowrap' }}>로컬 코스트맵</span>
      </div>
      <div style={S.legendRow}>
        <span style={S.dashedBoxSample} aria-hidden />
        <span>로컬 코스트맵 범위(점선)</span>
      </div>
      <div style={S.legendRow}>
        <span style={S.goalCrossSample} aria-hidden />
        <span>목표 지점</span>
      </div>
    </div>
  )
})

const LeftMapCard = memo(function LeftMapCard({
  canvasRef,
  onCanvasMouseDown,
  loadPhase,
  leftPlayable,
  leftInteractiveReady,
  leftOverlayText,

  gridData,
  pathPoints,
  lidarScans,
  localCostmapFrames,
  dwaGoals,
  currentTimestampMs,
  t0EpochMs
}) {
  const [legendOpen, setLegendOpen] = useState(true)
  const [is3D, setIs3D] = useState(false)

  // 좌측 오버레이 정책: init/error는 명시적으로 오버레이,
  // 그 외엔 leftInteractiveReady가 될 때까지 오버레이 유지
  const showLeftOverlay = loadPhase === 'error' || loadPhase === 'init' || !leftInteractiveReady

  return (
    <div style={S.mapCard}>
      <div style={S.mapHeader}>
        <span>이동현황</span>
        <div style={S.mapHeaderRight}>
          {/* ✅ 3D 모드에서도 범례 표시(2D와 동일 UX) */}
          <>
            <button
              type="button"
              onClick={() => setLegendOpen((v) => !v)}
              title={legendOpen ? '범례 접기' : '범례 펼치기'}
              aria-expanded={legendOpen}
              style={S.legendHeaderToggleBtn}
            >
              {`범례 ${legendOpen ? '⌃' : '⌄'}`}
            </button>
            <Legend open={legendOpen} />
          </>
          <Button
            size="sm"
            theme="default"
            onClick={() => setIs3D((v) => !v)}
            title={is3D ? '2D 지도로 전환' : '3D 지도로 전환'}
            style={S.toggleMapBtn}
          >
            {is3D ? '2D 지도' : '3D 지도'}
          </Button>
        </div>
      </div>

      <div style={S.mapBody}>
        {/* ✅ 2D/3D를 언마운트하지 말고 둘 다 항상 마운트 */}
        <div style={{ position: 'relative', width: '100%', height: '100%' }}>
          {/* 2D Layer */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              visibility: is3D ? 'hidden' : 'visible',
              pointerEvents: is3D ? 'none' : 'auto'
            }}
          >
            <canvas
              ref={canvasRef}
              style={{
                ...S.mapImage,
                visibility: leftInteractiveReady ? 'visible' : 'hidden'
              }}
              onMouseDown={onCanvasMouseDown}
            />

            {showLeftOverlay && (
              <div
                role="status"
                aria-live="polite"
                style={{
                  ...S.loadingOverlay,
                  pointerEvents: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8
                }}
              >
                {loadPhase !== 'init' && leftOverlayText && leftOverlayText !== '로딩 실패' ? (
                  <>
                    <span
                      aria-hidden
                      style={{
                        width: 14,
                        height: 14,
                        borderRadius: '50%',
                        border: '2px solid rgba(0,0,0,0.15)',
                        borderTopColor: '#666',
                        animation: 'map-left-spin 0.9s linear infinite'
                      }}
                    />
                    <span>{leftOverlayText}</span>
                    <style>{`@keyframes map-left-spin {from{transform:rotate(0)} to{transform:rotate(360deg)}}`}</style>
                  </>
                ) : (
                  <span>{leftOverlayText}</span>
                )}
              </div>
            )}
          </div>

          {/* 3D Layer */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              visibility: is3D ? 'visible' : 'hidden',
              pointerEvents: is3D ? 'auto' : 'none'
            }}
          >
            <DrivingMap3D
              isActive={is3D}
              gridData={gridData}
              pathPoints={pathPoints}
              lidarScans={lidarScans}
              localCostmapFrames={localCostmapFrames}
              dwaGoals={dwaGoals}
              currentTimestampMs={currentTimestampMs}
              t0EpochMs={t0EpochMs}
            />
          </div>
        </div>
      </div>
    </div>
  )
})

// ✅ 우측 헤더: 센서 정보로 고정 + 토글 제거(이동면적 disable 정책)
const RightHeader = memo(function RightHeader({ isLoadingLogs, timeLabelRef }) {
  return (
    <div style={S.mapHeader}>
      <span>센서 정보</span>
      <div style={S.mapHeaderRight}>
        <span style={S.mapSubLabel} ref={timeLabelRef} />
        {/* 토글/버튼은 추후 필요 시 추가 */}
      </div>
    </div>
  )
})

function MapPanels({
  canvasRef,
  threeMountRef,
  isLoadingLogs,
  canPlay,
  loadPhase,
  onCanvasMouseDown,
  msToClock,
  leftPlayable,
  coverageGrid,
  coveragePathPoints = [],
  showSensor,
  setShowSensor,
  currentTimestampMs,
  durationMs,
  formattedCurrentTime,
  formattedDuration,
  // ▼ 3D용 데이터
  gridData,
  pathPoints,
  lidarScans,
  localCostmapFrames,
  dwaGoals,
  t0EpochMs
}) {
  // ===============================
  // 좌측 게이팅(기존 그대로)
  // ===============================
  const LEFT_MIN_SAMPLES = 150
  const LEFT_MIN_SECONDS = 3.0

  const leftHasPts = Array.isArray(coveragePathPoints) && coveragePathPoints.length >= 2
  const leftDurSec = useMemo(() => {
    if (!leftHasPts) return 0
    const t0 = Number(coveragePathPoints[0]?.tSec) || 0
    const t1 = Number(coveragePathPoints[coveragePathPoints.length - 1]?.tSec) || 0
    return Math.max(0, t1 - t0)
  }, [leftHasPts, coveragePathPoints])

  const leftReadyByData = useMemo(() => {
    if (!leftHasPts) return false
    const sampleOK = coveragePathPoints.length >= LEFT_MIN_SAMPLES
    const timeOK = leftDurSec >= LEFT_MIN_SECONDS
    return sampleOK || timeOK
  }, [leftHasPts, coveragePathPoints.length, leftDurSec])

  const leftInteractiveReady = loadPhase === 'ready' && !isLoadingLogs && leftReadyByData

  const leftOverlayText = useMemo(() => {
    if (loadPhase === 'error') return '로딩 실패'
    if (loadPhase === 'init') return 'mcap 파일 선택 후 조회 버튼을 눌러주세요'
    if (!leftHasPts) return '경로 수집 대기…'
    if (isLoadingLogs || loadPhase !== 'ready') return 'MCAP 로딩 중…'
    if (!leftReadyByData) return '데이터 안정화 대기…'
    return ''
  }, [loadPhase, isLoadingLogs, leftHasPts, leftReadyByData])

  // ✅ (유지) 디폴트는 센서 정보로
  useEffect(() => {
    setShowSensor?.(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ===============================
  // 우측 센서 차트 게이팅(좌측과 동일한 로딩 Sync)
  // ===============================
  const rightInteractiveReady = loadPhase === 'ready' && !isLoadingLogs

  const rightOverlayText = useMemo(() => {
    if (loadPhase === 'error') return '로딩 실패'
    if (loadPhase === 'init') return 'mcap 파일 선택 후 조회 버튼을 눌러주세요'
    if (isLoadingLogs || loadPhase !== 'ready') return 'MCAP 로딩 중…'
    return ''
  }, [loadPhase, isLoadingLogs])

  const showRightOverlay = loadPhase === 'error' || loadPhase === 'init' || !rightInteractiveReady

  // 시간 라벨(우측 헤더 DOM 반영)
  const timeLabelCurrent = useMemo(() => {
    return (
      (typeof formattedCurrentTime === 'string' && formattedCurrentTime) ||
      (typeof currentTimestampMs === 'number' ? msToClock(currentTimestampMs) : `00:00.000`)
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formattedCurrentTime, currentTimestampMs])

  const timeLabelDuration = useMemo(() => {
    if (typeof durationMs === 'number' && durationMs > 0) {
      const durText = (typeof formattedDuration === 'string' && formattedDuration) || msToClock(durationMs)
      return ` / ${durText}`
    }
    return ''
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formattedDuration, durationMs])

  const rightTimeRef = useRef(null)
  useEffect(() => {
    const el = rightTimeRef.current
    if (!el) return
    el.textContent = `${timeLabelCurrent}${timeLabelDuration}`
  }, [timeLabelCurrent, timeLabelDuration])

  // ✅ 우측은 센서 정보 고정(이동면적 disable 정책)
  const effectiveShowSensor = true

  return (
    <div style={S.mapsArea}>
      {/* 좌측: 이동현황 */}
      <LeftMapCard
        canvasRef={canvasRef}
        onCanvasMouseDown={onCanvasMouseDown}
        loadPhase={loadPhase}
        leftPlayable={leftPlayable}
        leftInteractiveReady={leftInteractiveReady}
        leftOverlayText={leftOverlayText}
        // ▼ 3D용
        gridData={gridData}
        pathPoints={pathPoints}
        lidarScans={lidarScans}
        localCostmapFrames={localCostmapFrames}
        dwaGoals={dwaGoals}
        currentTimestampMs={currentTimestampMs}
        t0EpochMs={t0EpochMs}
      />

      {/* 우측: 센서 정보 (조회/로딩 Sync 적용) */}
      <div style={S.mapCard}>
        <RightHeader isLoadingLogs={isLoadingLogs} timeLabelRef={rightTimeRef} />

        <div
          style={{
            ...S.mapBody,
            position: 'relative',
            overflowY: 'auto',
            alignItems: 'stretch',
            justifyContent: 'flex-start'
          }}
        >
          {/* ✅ ready일 때만 차트 렌더 (uPlot이 0px에서 그려지는 문제 방지) */}
          {effectiveShowSensor ? (
            rightInteractiveReady ? (
              <div
                style={{
                  display: 'grid',
                  gridTemplateRows: '220px 220px',
                  gap: 12,
                  width: '100%'
                }}
              >
                <SensorChart sampleMode={true} />
                <SensorChart sampleMode={true} />
              </div>
            ) : (
              // overlay가 덮을 거지만, 레이아웃 흔들림 방지용 빈 자리(선택)
              <div style={{ width: '100%', height: 220 * 2 + 12 }} />
            )
          ) : ENABLE_COVERAGE_PANEL ? (
            <CoveragePanel
              grid={coverageGrid}
              pathPoints={coveragePathPoints}
              overlayTextInit={'mcap 파일 선택 후 조회 버튼을 눌러주세요'}
              background="#0D1117"
              fillColor="rgba(156,163,175,0.32)"
              edgeDark="rgba(0,0,0,0.65)"
              edgeLight="rgba(255,255,255,0.28)"
              edgeOuterPx={1.0}
              edgeInnerPx={0.7}
              centerLineColor="#9FE3FC"
              brushWidthM={0.44}
              useClosing={true}
              closeBlurPx={2.0}
              closeThreshold={95}
              arrowEveryMeters={2.1}
              arrowSizePx={4}
              arrowFill="#0B0F14"
              arrowStroke="#A5F3FC"
              arrowStrokeWidth={0.8}
              currentTimestampMs={currentTimestampMs}
              durationMs={durationMs}
              msToClock={msToClock}
              followPlay={true}
              fitMode="grid"
              autoFitOnData={true}
              padPx={24}
              loadPhase={loadPhase}
              isLoadingLogs={isLoadingLogs}
              minSamples={150}
              minSeconds={3.0}
              showDebugLabel={false}
            />
          ) : (
            <div style={{ opacity: 0.65, padding: 12, fontSize: 12 }}>
              이동면적(coverage) 데이터 확보 전이라 비활성화되어 있습니다.
            </div>
          )}

          {/* ✅ 우측 Overlay: 좌측과 동일한 로딩 Sync */}
          {showRightOverlay && (
            <div
              role="status"
              aria-live="polite"
              style={{
                ...S.loadingOverlay,
                position: 'absolute',
                inset: 0,
                pointerEvents: 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8
              }}
            >
              {loadPhase !== 'init' && rightOverlayText && rightOverlayText !== '로딩 실패' ? (
                <>
                  <span
                    aria-hidden
                    style={{
                      width: 14,
                      height: 14,
                      borderRadius: '50%',
                      border: '2px solid rgba(0,0,0,0.15)',
                      borderTopColor: '#666',
                      animation: 'map-right-spin 0.9s linear infinite'
                    }}
                  />
                  <span>{rightOverlayText}</span>
                  <style>{`@keyframes map-right-spin {from{transform:rotate(0)} to{transform:rotate(360deg)}}`}</style>
                </>
              ) : (
                <span>{rightOverlayText}</span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default memo(MapPanels)
