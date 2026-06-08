import React, { useMemo, useRef, useEffect, useCallback } from 'react'
import { theme, formatTime } from '../styles'

export default function ReplayControls({
  totalDuration = 600,
  issues = [],

  // ✅ controlled props
  currentTime = 0,
  isPlaying = false,
  playbackRate = 1.0,
  viewMode, // ✅ 'landing' | 'result
  // ✅ callbacks (부모가 상태를 갖고 업데이트)
  onSeek, // (t:number)=>void
  onTogglePlay, // ()=>void
  onStop, // ()=>void
  onChangeRate // (r:number)=>void
}) {
  const timerRef = useRef(null)
  const trackRef = useRef(null)
  const draggingRef = useRef(false)

  /* ───────────────── viewMode 기반 리셋 ───────────────── */
  useEffect(() => {
    if (viewMode !== 'landing') return

    // 완전 초기 상태로
    onStop?.()
    onSeek?.(0)
    draggingRef.current = false
  }, [viewMode, onStop, onSeek])

  /* ───────────────── 재생 로직 (부모 시간 갱신) ───────────────── */
  useEffect(() => {
    if (!isPlaying) return

    timerRef.current = setInterval(() => {
      const next = Number(currentTime || 0) + 0.1 * Number(playbackRate || 1.0)
      const clamped = next >= totalDuration ? totalDuration : next
      onSeek?.(clamped)
    }, 100)

    return () => clearInterval(timerRef.current)
  }, [isPlaying, playbackRate, totalDuration, currentTime, onSeek])

  const pct = totalDuration > 0 ? (Number(currentTime || 0) / totalDuration) * 100 : 0

  /* ───────────────── 이슈 카운트 ───────────────── */
  const { err, warn } = useMemo(() => {
    let e = 0
    let w = 0
    for (const it of issues) {
      if (it.level === 'ERROR') e++
      else if (it.level === 'WARN') w++
    }
    return { err: e, warn: w }
  }, [issues])

  /* ───────────────── 타임라인 드래그 ───────────────── */
  const calcTime = useCallback(
    (clientX) => {
      const rect = trackRef.current?.getBoundingClientRect?.()
      if (!rect || rect.width <= 0) return 0
      const x = Math.min(Math.max(clientX - rect.left, 0), rect.width)
      return (x / rect.width) * totalDuration
    },
    [totalDuration]
  )

  const onMouseMove = useCallback(
    (e) => {
      if (!draggingRef.current) return
      onSeek?.(calcTime(e.clientX))
    },
    [calcTime, onSeek]
  )

  const onMouseUp = useCallback(() => {
    draggingRef.current = false
    window.removeEventListener('mousemove', onMouseMove)
    window.removeEventListener('mouseup', onMouseUp)
  }, [onMouseMove])

  const onMouseDown = (e) => {
    draggingRef.current = true
    onSeek?.(calcTime(e.clientX))
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }

  /* ───────────────── 이슈 네비게이션 ───────────────── */
  const goPrevIssue = () => {
    const prev = [...issues].reverse().find((i) => i.t < currentTime)
    if (prev) {
      onStop?.()
      onSeek?.(prev.t)
    }
  }

  const goNextIssue = () => {
    const next = issues.find((i) => i.t > currentTime)
    if (next) {
      onStop?.()
      onSeek?.(next.t)
    }
  }

  return (
    <div style={P.wrap}>
      {/* Row 1 */}
      <div style={P.row1}>
        <div style={P.ctrlGroup}>
          <button style={P.iconBtn} onClick={() => onSeek?.(0)}>
            ⏮
          </button>

          <button style={{ ...P.iconBtn, ...P.playBtn }} onClick={() => onTogglePlay?.()}>
            {isPlaying ? '⏸' : '▶'}
          </button>

          <button style={P.iconBtn} onClick={() => onStop?.()}>
            ⏹
          </button>
        </div>

        <div style={P.speedGroup}>
          <span style={P.speedLabel}>속도:</span>
          <input
            type="range"
            min={0.1}
            max={10}
            step={0.1}
            value={playbackRate}
            onChange={(e) => onChangeRate?.(Number(e.target.value))}
            style={P.speedSlider}
          />
        </div>

        <div style={P.speedValue}>{Number(playbackRate || 1).toFixed(1)}x</div>
      </div>

      {/* Row 2 */}
      <div style={P.row2}>
        <div style={P.timelineOuter}>
          <div style={P.startDot} />
          <div ref={trackRef} style={P.timelineTrack} onMouseDown={onMouseDown}>
            <div style={{ ...P.timelineProgress, width: `${pct}%` }} />

            {/* ERROR / WARN 포인트 */}
            {issues.map((issue, i) => (
              <div
                key={i}
                style={{
                  ...P.issueDot,
                  left: `${(issue.t / totalDuration) * 100}%`,
                  background: issue.level === 'ERROR' ? theme.colors.statusError : theme.colors.statusWarn
                }}
                title={`${formatTime(issue.t)} [${issue.level}] ${issue.message}`}
              />
            ))}
          </div>
        </div>

        <div style={P.timeRow}>
          <span style={P.timeText}>{formatTime(currentTime)}</span>
          <span style={P.issueCount}>
            {err > 0 && <span style={{ color: theme.colors.statusError }}>⬤ {err}err</span>}
            {warn > 0 && <span style={{ color: theme.colors.statusWarn, marginLeft: 8 }}>⬤ {warn}warn</span>}
          </span>
          <span style={P.timeText}>{formatTime(totalDuration)}</span>
        </div>
      </div>

      {/* Row 3 */}
      <div style={P.row3}>
        <button style={P.navBtn} onClick={goPrevIssue}>
          ◀ 이전 이슈
        </button>
        <button style={P.navBtn} onClick={goNextIssue}>
          다음 이슈 ▶
        </button>
      </div>
    </div>
  )
}

const P = {
  wrap: {
    width: '100%',
    background: '#fff',
    border: `1px solid ${theme.colors.border}`,
    borderRadius: 10,
    padding: '10px 12px',
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    boxSizing: 'border-box',
    flexShrink: 0, // ✅ 위/아래 패널 압력 받아도 플레이바가 찌그러지지 않게
    position: 'relative', // ✅ z-index가 의미 있게 동작하도록(필요 시)
    zIndex: 1 // ✅ 탭/뷰/로그가 이상하게 덮을 때 최소 방탄
  },
  row1: {
    display: 'flex',
    alignItems: 'center',
    gap: 10
  },
  ctrlGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: 8
  },
  iconBtn: {
    width: 34,
    height: 34,
    borderRadius: '50%',
    border: `2px solid ${theme.colors.border}`,
    background: '#fff',
    color: theme.colors.text,
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center'
  },
  playBtn: { fontSize: 16 },
  speedGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    flex: 1
  },
  speedLabel: {
    fontSize: 13,
    color: theme.colors.textSecondary
  },
  speedSlider: { flex: 1 },
  speedValue: {
    minWidth: 44,
    textAlign: 'right'
  },
  row2: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8
  },
  timelineOuter: {
    position: 'relative',
    width: '100%',
    height: 10,
    display: 'flex',
    alignItems: 'center'
  },
  startDot: {
    position: 'absolute',
    left: -1,
    width: 10,
    height: 10,
    borderRadius: '50%',
    background: theme.colors.primary
  },
  timelineTrack: {
    position: 'relative',
    width: '100%',
    height: 6,
    background: '#D1D5DB',
    borderRadius: 9999
  },
  timelineProgress: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    background: theme.colors.primary
  },
  issueDot: {
    position: 'absolute',
    top: '50%',
    transform: 'translate(-50%, -50%)',
    width: 8,
    height: 8,
    borderRadius: '50%'
  },
  timeRow: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: 12
  },
  timeText: {
    fontFamily: 'Consolas, monospace'
  },
  issueCount: {
    display: 'inline-flex',
    alignItems: 'center'
  },
  row3: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 10
  },
  navBtn: {
    height: 34,
    borderRadius: 6,
    border: `1px solid ${theme.colors.border}`,
    background: theme.colors.surfaceAlt,
    cursor: 'pointer'
  }
}
