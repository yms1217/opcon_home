// components/tabs/SystemStatusTab.jsx
import React, { useMemo } from 'react'
import { UX, theme } from '../../styles'
import { rosStampToKstHms } from '@/utils/dateUtils'

/* ───────────────── helpers ───────────────── */

// wrapped[{tSec,msg}]에서 currentTime(상대초)에 해당하는 msg 선택 (이진탐색)
function selectSampleAtTime(wrapped, currentTime, totalDuration) {
  if (!Array.isArray(wrapped) || wrapped.length === 0) return null
  const first = wrapped[0]
  const looksWrapped = first && typeof first === 'object' && ('msg' in first || 'tSec' in first)
  const firstTSec = looksWrapped ? first?.tSec : null

  const dur = Number(totalDuration || 0)
  const target = Number(currentTime || 0)

  // fallback
  if (!looksWrapped || firstTSec == null) {
    if (dur > 0) {
      const r = Math.min(1, Math.max(0, target / dur))
      const idx = Math.round(r * (wrapped.length - 1))
      return wrapped[idx]?.msg ?? wrapped[idx] ?? null
    }
    return wrapped[wrapped.length - 1]?.msg ?? wrapped[wrapped.length - 1] ?? null
  }

  let lo = 0
  let hi = wrapped.length - 1
  let ans = 0
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    const t = wrapped[mid]?.tSec
    if (typeof t === 'number' && t <= target) {
      ans = mid
      lo = mid + 1
    } else hi = mid - 1
  }
  return wrapped[ans]?.msg ?? null
}

// diagnostic 메시지( DiagnosticArray or DiagnosticStatus )를 최대한 안전하게 펼치기
function normalizeDiagnostics(msg) {
  if (!msg) return []
  // DiagnosticArray 형태
  if (Array.isArray(msg.status)) return msg.status.filter(Boolean)
  // DiagnosticStatus 형태
  if (typeof msg.level === 'number' || msg.name || msg.message) return [msg]
  return []
}

function levelLabel(level) {
  // ROS diagnostic: 0 OK, 1 WARN, 2 ERROR, 3 STALE
  if (level === 0) return 'OK'
  if (level === 1) return 'WARN'
  if (level === 2) return 'ERROR'
  if (level === 3) return 'STALE'
  return 'UNKNOWN'
}

function levelKind(level) {
  if (level === 2) return 'error'
  if (level === 1 || level === 3) return 'warn'
  return 'ok'
}

function summarizeActuators(act) {
  if (!act) return null
  const names = Array.isArray(act.name) ? act.name : []
  const servo = act.servo_on
  const err = act.error_code
  const mode = act.drv_mode

  const n = names.length || Math.max(servo?.length || 0, err?.length || 0, mode?.length || 0)

  let servoOnCount = 0
  let errCount = 0
  const modeCounts = new Map()

  for (let i = 0; i < n; i++) {
    const s = typeof servo?.[i] === 'number' ? servo[i] : null
    const e = typeof err?.[i] === 'number' ? err[i] : null
    const m = typeof mode?.[i] === 'number' ? mode[i] : null

    if (s != null && s !== 0) servoOnCount++
    if (e != null && e !== 0) errCount++

    if (m != null) modeCounts.set(m, (modeCounts.get(m) || 0) + 1)
  }

  const modes = Array.from(modeCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${k}(${v})`)
    .join(', ')

  return {
    total: n,
    servoOnCount,
    errCount,
    modes: modes || '-',
    stamp: act?.header?.stamp ? rosStampToKstHms(act.header.stamp) : '-'
  }
}

/* ───────────────── main ───────────────── */

export default function SystemStatusTab({
  mcapSummary,
  currentTime = 0,
  totalDuration,
  isParsingMcap = false,
  mcapParseError = null
}) {
  const samples = mcapSummary?.samples || {}
  const timeRange = mcapSummary?.timeRange || null

  const duration = useMemo(() => {
    if (Number.isFinite(totalDuration)) return Number(totalDuration)
    if (timeRange && Number.isFinite(timeRange.startSec) && Number.isFinite(timeRange.endSec)) {
      return Math.max(0, timeRange.endSec - timeRange.startSec)
    }
    return 0
  }, [totalDuration, timeRange])

  const diagWrapped = samples['/hmc_ros2_control/diagnostic'] || []
  const actWrapped = samples['/hmc_ros2_control/actuator_states'] || []

  const diagMsg = useMemo(
    () => selectSampleAtTime(diagWrapped, currentTime, duration),
    [diagWrapped, currentTime, duration]
  )
  const actMsg = useMemo(
    () => selectSampleAtTime(actWrapped, currentTime, duration),
    [actWrapped, currentTime, duration]
  )

  const diagList = useMemo(() => normalizeDiagnostics(diagMsg), [diagMsg])

  const diagSummary = useMemo(() => {
    const counts = { ok: 0, warn: 0, error: 0, stale: 0 }
    const hot = []
    for (const st of diagList) {
      const lv = st?.level
      if (lv === 0) counts.ok++
      else if (lv === 1) counts.warn++
      else if (lv === 2) counts.error++
      else if (lv === 3) counts.stale++
      // warn/error/stale만 리스트업
      if (lv === 1 || lv === 2 || lv === 3) {
        hot.push({
          level: lv,
          name: st?.name || '(no name)',
          message: st?.message || '',
          hardware_id: st?.hardware_id || ''
        })
      }
    }
    return {
      counts,
      hot: hot.slice(0, 10),
      stamp: diagMsg?.header?.stamp ? rosStampToKstHms(diagMsg.header.stamp) : '-'
    }
  }, [diagList, diagMsg])

  const actSummary = useMemo(() => summarizeActuators(actMsg), [actMsg])

  // ── gating ──────────────────────────────
  if (mcapParseError)
    return (
      <div style={UX.noticePill('error')}>❌ MCAP parse error: {mcapParseError?.message ?? String(mcapParseError)}</div>
    )
  if (isParsingMcap) return <div style={UX.noticePill('info')}>MCAP parsing...</div>

  const hasDiag = Array.isArray(diagWrapped) && diagWrapped.length > 0
  const hasAct = Array.isArray(actWrapped) && actWrapped.length > 0

  return (
    <div style={UX.grid2}>
      {/* ── Diagnostics ── */}
      <div style={UX.card}>
        <div style={UX.sectionTitle}>진단 상태 (/hmc_ros2_control/diagnostic)</div>

        {!hasDiag ? (
          <div style={UX.noticePill('warn')}>⚠️ diagnostic 토픽 샘플이 없습니다.</div>
        ) : (
          <>
            <div style={UX.kvRow}>
              <span style={UX.kvLabel}>Time</span>
              <span style={UX.badge({ ok: true })}>{diagSummary.stamp}</span>
              <span style={UX.kvSub}>t={Number(currentTime || 0).toFixed(2)}s</span>
            </div>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
              <span style={UX.badge({ ok: true })}>OK {diagSummary.counts.ok}</span>
              <span style={UX.badge({ warn: diagSummary.counts.warn > 0 })}>WARN {diagSummary.counts.warn}</span>
              <span style={UX.badge({ error: diagSummary.counts.error > 0 })}>ERROR {diagSummary.counts.error}</span>
              <span style={UX.badge({ warn: diagSummary.counts.stale > 0 })}>STALE {diagSummary.counts.stale}</span>
            </div>

            <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {diagSummary.hot.length === 0 ? (
                <div style={{ fontSize: 12, color: theme.colors.textMuted }}>WARN/ERROR 항목이 없습니다.</div>
              ) : (
                diagSummary.hot.map((it, i) => (
                  <div
                    key={i}
                    style={UX.cmdItem({ warn: it.level === 1 || it.level === 3, error: it.level === 2 })}
                    title={it.hardware_id ? `hw: ${it.hardware_id}` : ''}
                  >
                    <span style={{ color: theme.colors.textMuted }}>[{levelLabel(it.level)}]</span> {it.name}
                    {it.message ? ` — ${it.message}` : ''}
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </div>

      {/* ── Actuator States ── */}
      <div style={UX.card}>
        <div style={UX.sectionTitle}>구동기 상태 (/hmc_ros2_control/actuator_states)</div>

        {!hasAct ? (
          <div style={UX.noticePill('warn')}>⚠️ actuator_states 토픽 샘플이 없습니다.</div>
        ) : !actSummary ? (
          <div style={UX.noticePill('warn')}>⚠️ actuator_states 메시지를 해석할 수 없습니다.</div>
        ) : (
          <>
            <div style={UX.kvRow}>
              <span style={UX.kvLabel}>Time</span>
              <span style={UX.badge({ ok: true })}>{actSummary.stamp}</span>
              <span style={UX.kvSub}>total {actSummary.total}</span>
            </div>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
              <span style={UX.badge({ ok: actSummary.servoOnCount === actSummary.total })}>
                ServoOn {actSummary.servoOnCount}/{actSummary.total}
              </span>
              <span style={UX.badge({ error: actSummary.errCount > 0, ok: actSummary.errCount === 0 })}>
                Error {actSummary.errCount}
              </span>
              <span style={UX.badge({ ok: true })}>drv_mode {actSummary.modes}</span>
            </div>

            <div style={{ marginTop: 10, fontSize: 11, color: theme.colors.textMuted }}>
              * status_word/drive_mode/error_code는 하드웨어 상태 기반(팩트)이며, joint_states 기반 휴리스틱보다 우선
              신뢰할 수 있습니다.
            </div>
          </>
        )}
      </div>
    </div>
  )
}
