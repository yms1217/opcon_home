// components/ReplayResultView.jsx
import React from 'react'
import ReplayControls from './ReplayControls'
import { theme } from '../styles'
import { Tabs, Tab } from '@repo/ui'

import RobotVisualization from './RobotVisualization'

// ✅ 탭 컴포넌트들
import OverviewTab from './tabs/OverviewTab'
import ArmAnalysisTab from './tabs/ArmAnalysisTab'
import EndEffectorTab from './tabs/EndEffectorTab'
import SystemStatusTab from './tabs/SystemStatusTab'
import PerformanceTab from './tabs/PerformanceTab'

export default function ReplayResultView({
  // ✅ 상위(페이지)에서 내려주는 모드: 'landing' | 'result'
  viewMode = 'result',

  // result data
  resultData,

  // player
  currentTime,
  totalDuration,
  isPlaying,
  playbackRate,
  onSeek,
  onTogglePlay,
  onStop,
  onChangeRate,

  // issues/summary
  issues,
  mcapSummary,

  // mcap parsing flags
  isParsingMcap,
  mcapParseError,
  isMcapLoading
}) {
  // ✅ landing 상태에서는 이 뷰 자체를 렌더하지 않음
  // (landing에서 Player/탭/캔버스 잔상 남는 문제를 원천적으로 차단)
  if (viewMode !== 'result') return null

  // result인데 데이터가 없으면 렌더 스킵(상위 흐름 문제/로딩 타이밍)
  if (!resultData) return null

  return (
    <div style={S.root}>
      {/* ✅ 화면 정중앙 로딩 스피너 (분석 로딩 중에만) */}
      {isMcapLoading && (
        <>
          <style>{`
            @keyframes spin { to { transform: rotate(360deg); } }
          `}</style>
          <div style={S.loadingFixed}>
            <div style={S.loadingBox}>
              <div style={S.spinner} />
              <span>분석 데이터 로딩 중...</span>
            </div>
          </div>
        </>
      )}

      {/* ── Left: Viewer + PlayerBar ── */}
      <div style={S.left}>
        <div style={S.viewer}>
          {/* ✅ landing→result 재진입 시 캔버스/내부 캐시 상태 초기화를 위해 key 부여 */}
          <RobotVisualization key={viewMode} currentTime={currentTime} mcapSummary={mcapSummary} />
        </div>

        <ReplayControls
          currentTime={currentTime}
          totalDuration={totalDuration}
          isPlaying={isPlaying}
          playbackRate={playbackRate}
          issues={issues}
          onSeek={onSeek}
          onTogglePlay={onTogglePlay}
          onStop={onStop}
          onChangeRate={onChangeRate}
          viewMode={viewMode} // ✅ landing으로 바뀌면 ReplayControls가 스스로 reset 하도록(이전 diff 반영 전제)
        />
      </div>

      {/* ── Right: Analysis Tabs ── */}
      <div style={{ ...S.right, position: 'relative' }}>
        <div style={S.panel}>
          <div style={S.tabsWrap}>
            {/* ✅ landing→result 재진입 시 탭 active 상태/스크롤 잔상 초기화를 위해 key 부여 */}
            <Tabs key={viewMode} defaultActiveId="overview">
              <Tab id="overview" label="Overview">
                <div style={S.content}>
                  <OverviewTab
                    data={resultData}
                    mcapSummary={mcapSummary}
                    isParsingMcap={isParsingMcap}
                    mcapParseError={mcapParseError}
                  />
                </div>
              </Tab>

              <Tab id="leftArm" label="Left Arm">
                <div style={S.content}>
                  <ArmAnalysisTab
                    data={resultData}
                    side="left"
                    mcapSummary={mcapSummary}
                    isParsingMcap={isParsingMcap}
                    mcapParseError={mcapParseError}
                    currentTime={currentTime}
                  />
                </div>
              </Tab>

              <Tab id="rightArm" label="Right Arm">
                <div style={S.content}>
                  <ArmAnalysisTab
                    data={resultData}
                    side="right"
                    mcapSummary={mcapSummary}
                    isParsingMcap={isParsingMcap}
                    mcapParseError={mcapParseError}
                    currentTime={currentTime}
                  />
                </div>
              </Tab>

              <Tab id="endEffector" label="End‑Effector">
                <div style={S.content}>
                  <EndEffectorTab
                    mcapSummary={mcapSummary}
                    isParsingMcap={isParsingMcap}
                    mcapParseError={mcapParseError}
                    currentTime={currentTime}
                  />
                </div>
              </Tab>

              <Tab id="system" label="System">
                <div style={S.content}>
                  <SystemStatusTab
                    data={resultData}
                    mcapSummary={mcapSummary}
                    currentTime={currentTime}
                    totalDuration={totalDuration}
                    isParsingMcap={isParsingMcap}
                    mcapParseError={mcapParseError}
                  />
                </div>
              </Tab>

              <Tab id="performance" label="Performance">
                <div style={S.content}>
                  <PerformanceTab
                    data={resultData}
                    mcapSummary={mcapSummary}
                    currentTime={currentTime}
                    totalDuration={totalDuration}
                    isParsingMcap={isParsingMcap}
                    mcapParseError={mcapParseError}
                  />
                </div>
              </Tab>
            </Tabs>
          </div>
        </div>
      </div>
    </div>
  )
}

const S = {
  root: {
    display: 'flex',
    gap: 8,
    padding: 8,
    flex: '1 1 0',
    minHeight: 0,
    overflow: 'hidden', // ✅ 내부에서만 스크롤 나게
    alignItems: 'stretch'
  },
  left: {
    width: '50%',
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    minHeight: 0 // ✅ 중요
  },
  right: {
    width: '50%',
    minWidth: 0,
    display: 'flex',
    minHeight: 0 // ✅ 중요
  },
  viewer: {
    flex: '1 1 0',
    minHeight: 0,
    borderRadius: 10,
    background: '#F9FAFB',
    border: `1px solid ${theme.colors.border}`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: theme.colors.textMuted,
    overflow: 'hidden', // ✅ 캔버스/내부가 튀어나와 아래를 덮는 것 방지
    position: 'relative' // ✅ RobotVisualization이 absolute를 쓰더라도 이 안에 가둠
  },

  panel: {
    flex: '1 1 0',
    minHeight: 0,
    borderRadius: 10,
    border: `1px solid ${theme.colors.border}`,
    background: '#fff',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'auto'
  },

  // ✅ Tabs 컨테이너가 panel 높이를 꽉 쓰도록
  tabsWrap: {
    flex: '1 1 0',
    minHeight: 0,
    overflow: 'visible',
    display: 'flex',
    flexDirection: 'column',
    paddingLeft: 10,
    paddingRight: 10
  },

  content: {
    overflow: 'visible', // 스크롤은 tabsWrap이 담당
    padding: 10
  },

  // ✅ 화면(뷰포트) 정중앙 고정 로딩
  // - 컨테이너 높이/탭 내부 레이아웃/스크롤 영향을 0으로 만듦
  loadingFixed: {
    position: 'fixed',
    left: '50%',
    top: '50%',
    transform: 'translate(-50%, -50%)',
    zIndex: 9999,
    pointerEvents: 'none' // ✅ 필요하면 'auto'로 바꿔서 클릭 막는 모달처럼도 가능
  },

  loadingBox: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '12px 16px',
    borderRadius: 10,
    background: '#fff',
    border: `1px solid ${theme.colors.border}`,
    boxShadow: '0 6px 18px rgba(0,0,0,0.12)',
    fontSize: 13,
    fontWeight: 600,
    color: theme.colors.textSecondary
  },

  spinner: {
    width: 26,
    height: 26,
    borderRadius: '50%',
    border: `3px solid ${theme.colors.border}`,
    borderTopColor: theme.colors.primary,
    animation: 'spin 0.9s linear infinite'
  }
}
