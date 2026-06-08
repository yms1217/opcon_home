// /components/LogEntriesUX.jsx
import React, { useMemo, useState } from 'react'
import { UX, theme } from '../styles'

function pad2(n) {
  return String(n).padStart(2, '0')
}

function secToClock(sec) {
  if (!Number.isFinite(sec)) return '--:--'
  const s = Math.max(0, Math.floor(sec))
  const mm = Math.floor(s / 60)
  const ss = s % 60
  return `${pad2(mm)}:${pad2(ss)}`
}

function levelToText(level) {
  // DiagnosticStatus.level: 0=OK, 1=WARN, 2=ERROR, 3=STALE
  if (level === 2) return 'ERROR'
  if (level === 1) return 'WARN'
  if (level === 0) return 'OK'
  if (level === 3) return 'STALE'
  return 'INFO'
}

function levelColor(lv) {
  const x = lv
  return x === 'ERROR'
    ? theme.colors.statusError
    : x === 'WARN'
      ? theme.colors.statusWarn
      : x === 'OK'
        ? theme.colors.statusOk || '#10B981'
        : theme.colors.primary
}

// Text fallback (UX-only)
const fallbackTextMock = [
  ['00:10', 'INFO', 'Replay started'],
  ['00:42', 'WARN', 'Temp rising: LA_J3'],
  ['03:10', 'INFO', 'Recovered'],
  ['06:50', 'WARN', 'Slip detected']
]

// --- local styles (Tabs 우회) ---
const tabBarStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: 16,
  padding: '10px 12px 0 12px',
  borderBottom: `1px solid ${theme.colors.border}`,
  background: theme.colors.surface,
  flexShrink: 0
}

const tabBtnStyle = (active) => ({
  appearance: 'none',
  border: 'none',
  background: 'transparent',
  padding: '10px 2px',
  fontSize: 14,
  fontWeight: active ? 800 : 700,
  color: active ? theme.colors.text : theme.colors.textMuted,
  cursor: 'pointer',
  borderBottom: active ? `2px solid ${theme.colors.primary}` : '2px solid transparent'
})

// 4컬럼(없으면 fallback)
const head4Fallback = {
  ...(UX.logTableHead || {}),
  display: 'grid',
  gridTemplateColumns: '90px 80px 120px 1fr',
  gap: 10,
  padding: '8px 12px',
  borderBottom: `1px solid ${theme.colors.border}`,
  color: theme.colors.textMuted,
  fontWeight: 800,
  fontSize: 12,
  flexShrink: 0
}

const row4Fallback = {
  ...(UX.logRow || {}),
  display: 'grid',
  gridTemplateColumns: '90px 80px 120px 1fr',
  gap: 10,
  alignItems: 'start',
  padding: '8px 10px',
  borderRadius: 8,
  border: `1px solid ${theme.colors.border}`,
  background: theme.colors.surface
}

export default function LogEntriesUX({ diagnosticEvents, textEntries, isParsingMcap, mcapParseError }) {
  const [activeTab, setActiveTab] = useState('system') // 'system' | 'text'

  const systemRows = useMemo(() => {
    const arr = diagnosticEvents || []
    return arr.map((e) => ({
      timeText: secToClock(e.tSec),
      levelText: levelToText(e.level),
      sourceText: e.source,
      messageText: e.message
    }))
  }, [diagnosticEvents])

  const textRows = useMemo(() => {
    const arr = Array.isArray(textEntries) && textEntries.length ? textEntries : fallbackTextMock
    return arr.map((x) => {
      const [t, lv, msg] = x
      return { timeText: t, levelText: lv, messageText: msg }
    })
  }, [textEntries])

  // ✅ 핵심: 스크롤 영역 높이 강제
  const bodyScrollStyle = {
    ...(UX.logBody || {}),
    flex: '1 1 0',
    minHeight: 0,
    overflow: 'auto'
  }

  // 메시지 잘림 방지(스타일.js가 ellipsis여도 여기서 override)
  const msgStyle = {
    ...(UX.logMsg || {}),
    whiteSpace: 'normal',
    overflowWrap: 'anywhere',
    wordBreak: 'break-word',
    lineHeight: 1.35
  }

  const head3 = {
    ...(UX.logTableHead || {}),
    flexShrink: 0
  }

  return (
    <div
      style={{
        ...UX.logPanel,
        height: '100%',
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column'
      }}
    >
      <div style={UX.logTopBar}>
        <div style={{ fontWeight: 800 }}>Log</div>
        <div style={{ marginLeft: 'auto', color: theme.colors.textMuted, fontSize: 12 }}>
          {mcapParseError ? 'ERROR' : isParsingMcap ? 'LOADING...' : systemRows.length ? 'live' : 'UX-only'}
        </div>
      </div>

      {/* ✅ Tabs 컴포넌트 우회: 로컬 탭 바 */}
      <div style={tabBarStyle}>
        <button style={tabBtnStyle(activeTab === 'system')} onClick={() => setActiveTab('system')}>
          System / Event
        </button>
        <button style={tabBtnStyle(activeTab === 'text')} onClick={() => setActiveTab('text')}>
          Text
        </button>
      </div>

      {/* ✅ 컨텐츠 영역: 반드시 flex:1/minHeight:0 */}
      <div style={{ flex: '1 1 0', minHeight: 0, display: 'flex', flexDirection: 'column', padding: '0 8px 8px' }}>
        {activeTab === 'system' ? (
          <>
            <div style={UX.logTableHead4 || head4Fallback}>
              <div>Time</div>
              <div>Level</div>
              <div>Source</div>
              <div>Message</div>
            </div>

            <div style={bodyScrollStyle}>
              {(systemRows || []).map((r, idx) => (
                <div key={`${r.timeText}-${idx}`} style={UX.logRow4 || row4Fallback}>
                  <div style={{ color: theme.colors.textSecondary, fontFamily: 'Consolas, monospace' }}>
                    {r.timeText}
                  </div>
                  <div style={{ fontWeight: 800, color: levelColor(r.levelText) }}>{r.levelText}</div>
                  <div style={{ fontWeight: 650, color: theme.colors.textPrimary }}>{r.sourceText}</div>
                  <div style={msgStyle} title={r.messageText}>
                    {r.messageText}
                  </div>
                </div>
              ))}

              {!systemRows.length && (
                <div style={{ padding: 10, color: theme.colors.textMuted, fontSize: 12 }}>
                  {mcapParseError
                    ? `MCAP 파싱 오류: ${mcapParseError?.message || String(mcapParseError)}`
                    : isParsingMcap
                      ? 'MCAP 로딩 중...'
                      : '표시할 System/Event 로그가 없습니다.'}
                </div>
              )}
            </div>
          </>
        ) : (
          <>
            <div style={head3}>
              <div>Time</div>
              <div>Level</div>
              <div>Message</div>
            </div>

            <div style={bodyScrollStyle}>
              {textRows.map((r, idx) => (
                <div key={idx} style={UX.logRow}>
                  <div style={{ color: theme.colors.textSecondary, fontFamily: 'Consolas, monospace' }}>
                    {r.timeText}
                  </div>
                  <div
                    style={{
                      fontWeight: 800,
                      color:
                        r.levelText === 'ERROR'
                          ? theme.colors.statusError
                          : r.levelText === 'WARN'
                            ? theme.colors.statusWarn
                            : theme.colors.primary
                    }}
                  >
                    {r.levelText}
                  </div>
                  <div style={msgStyle} title={r.messageText}>
                    {r.messageText}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
