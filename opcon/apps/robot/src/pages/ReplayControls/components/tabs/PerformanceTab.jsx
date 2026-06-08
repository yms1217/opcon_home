// components/tabs/PerformanceTab.jsx
import React, { useMemo } from 'react'
import { UX, theme } from '../../styles'
import { rosStampToKstHms } from '@/utils/dateUtils'
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine } from 'recharts'

/* ───────────────── helpers ───────────────── */

function GuideHover({ content, label = 'Guide' }) {
  const [open, setOpen] = React.useState(false)

  return (
    <div
      style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      <button
        type="button"
        aria-label={label}
        style={{
          cursor: 'help',
          border: `1px solid ${theme.colors.border}`,
          background: '#fff',
          borderRadius: 999,
          padding: '2px 8px',
          fontSize: 11,
          color: theme.colors.textMuted,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6
        }}
      >
        ⓘ {label}
      </button>

      {open && (
        <div
          role="tooltip"
          style={{
            position: 'absolute',
            zIndex: 50,
            top: 'calc(100% + 6px)',
            right: 0,
            width: 360,
            maxWidth: '70vw',
            padding: 10,
            borderRadius: 10,
            border: `1px solid ${theme.colors.border}`,
            background: '#fff',
            boxShadow: '0 8px 20px rgba(0,0,0,0.08)',
            fontSize: 12,
            lineHeight: 1.55,
            color: theme.colors.text
          }}
        >
          {content}
          <div style={{ marginTop: 8, fontSize: 11, color: theme.colors.textMuted }}>
            * 마우스를 떼면 자동으로 닫힙니다.
          </div>
        </div>
      )}
    </div>
  )
}

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

function getWrappedMsg(w) {
  return w?.msg ?? w ?? null
}
function getWrappedTSec(w) {
  const t = w?.tSec
  return typeof t === 'number' ? t : null
}

// ctrlWrapped에서 tSec <= targetTime 인 마지막 인덱스를 1-pass로 진전
function advanceCtrlIndex(ctrlWrapped, startIdx, targetTime) {
  let i = startIdx
  while (i + 1 < ctrlWrapped.length) {
    const nt = getWrappedTSec(ctrlWrapped[i + 1])
    if (typeof nt === 'number' && nt <= targetTime) i++
    else break
  }
  return i
}

function makeIndexByName(names = []) {
  const map = new Map()
  for (let i = 0; i < names.length; i++) {
    const n = names[i]
    if (typeof n === 'string') map.set(n, i)
  }
  return map
}

// joint_states(actual) vs tracking_controller(target) 한 시점 KPI
function computeTrackKpiAtTime(jsMsg, ctrlMsg, POS_OK = 0.15) {
  if (!jsMsg || !ctrlMsg) return null

  const jsNames = Array.isArray(jsMsg.name) ? jsMsg.name : []
  const jsPos = jsMsg.position
  const jsVel = jsMsg.velocity

  const ctrlNames = Array.isArray(ctrlMsg.name) ? ctrlMsg.name : []
  const tgtPos = ctrlMsg.target_position
  const tgtVel = ctrlMsg.target_velocity
  const maxVel = ctrlMsg.max_velocity

  const idxByName = makeIndexByName(jsNames)

  let sumSq = 0
  let n = 0
  let ok = 0
  let peak = 0

  for (let i = 0; i < ctrlNames.length; i++) {
    const name = ctrlNames[i]
    const idx = idxByName.get(name)
    if (idx == null) continue

    const ap = typeof jsPos?.[idx] === 'number' ? jsPos[idx] : null
    const tp = typeof tgtPos?.[i] === 'number' ? tgtPos[i] : null
    if (ap == null || tp == null) continue

    const e = ap - tp
    sumSq += e * e
    n++
    peak = Math.max(peak, Math.abs(e))
    if (Math.abs(e) <= POS_OK) ok++
  }

  if (!n) return null
  const posRms = Math.sqrt(sumSq / n)
  const successPct = (ok / n) * 100

  return { posRms, peak, n, successPct }
}

// ✅ 시간 구간(histogram) 생성 (시간 분포)
function buildTimeHistogram({ jsWrapped, ctrlWrapped, duration, bins = 30, POS_OK = 0.15 }) {
  if (!Array.isArray(jsWrapped) || jsWrapped.length === 0) return []
  if (!Array.isArray(ctrlWrapped) || ctrlWrapped.length === 0) return []

  const dur = Number(duration || 0)
  if (!(dur > 0)) return []

  const N = Math.max(8, Number(bins || 30))
  const dt = dur / N

  const acc = Array.from({ length: N }, (_, b) => ({
    b,
    t0: b * dt,
    t1: (b + 1) * dt,
    rmsSum: 0,
    rmsN: 0,
    succSum: 0,
    succN: 0,
    peakMax: 0,
    samples: 0
  }))

  // ctrl 포인터 1-pass (두 배열이 시간순 정렬되어 있다고 가정: loader에서 sort됨)
  let ci = 0

  for (let k = 0; k < jsWrapped.length; k++) {
    const jw = jsWrapped[k]
    const t = getWrappedTSec(jw)
    if (typeof t !== 'number') continue
    if (t < 0 || t > dur) continue

    ci = advanceCtrlIndex(ctrlWrapped, ci, t)

    const cw = ctrlWrapped[ci]
    const jsMsg = getWrappedMsg(jw)
    const ctrlMsg = getWrappedMsg(cw)

    const kpi = computeTrackKpiAtTime(jsMsg, ctrlMsg, POS_OK)
    if (!kpi) continue

    const b = Math.min(N - 1, Math.max(0, Math.floor(t / dt)))
    const a = acc[b]
    a.samples += 1

    // bin 내 "샘플별 posRms" 평균
    a.rmsSum += kpi.posRms
    a.rmsN += 1

    // bin 내 "샘플별 successPct" 평균
    a.succSum += kpi.successPct
    a.succN += 1

    // bin 내 peak는 max
    a.peakMax = Math.max(a.peakMax, kpi.peak)
  }

  return acc.map((a) => {
    const posRms = a.rmsN ? a.rmsSum / a.rmsN : null
    const successPct = a.succN ? a.succSum / a.succN : null
    const tMid = (a.t0 + a.t1) / 2

    return {
      b: a.b,
      t0: a.t0,
      t1: a.t1,
      tMid,
      posRms,
      successPct,
      peak: a.peakMax || null,
      samples: a.samples
    }
  })
}

// diagnostic 메시지 정규화 (DiagnosticArray/DiagnosticStatus)
function normalizeDiagnostics(msg) {
  if (!msg) return []
  if (Array.isArray(msg.status)) return msg.status.filter(Boolean)
  if (typeof msg.level === 'number' || msg.name || msg.message) return [msg]
  return []
}

/* ───────────────── main ───────────────── */

export default function PerformanceTab({
  data, // unused (kept for compatibility)
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

  const jsWrapped = samples['/joint_states'] || []
  const ctrlWrapped = samples['/tracking_controller/joint'] || []
  const actWrapped = samples['/hmc_ros2_control/actuator_states'] || []
  const diagWrapped = samples['/hmc_ros2_control/diagnostic'] || []

  const js = useMemo(() => selectSampleAtTime(jsWrapped, currentTime, duration), [jsWrapped, currentTime, duration])
  const ctrl = useMemo(
    () => selectSampleAtTime(ctrlWrapped, currentTime, duration),
    [ctrlWrapped, currentTime, duration]
  )
  const act = useMemo(() => selectSampleAtTime(actWrapped, currentTime, duration), [actWrapped, currentTime, duration])
  const diag = useMemo(
    () => selectSampleAtTime(diagWrapped, currentTime, duration),
    [diagWrapped, currentTime, duration]
  )

  // ✅ KPI(현재 시점) : Target vs Actual
  const kpiNow = useMemo(() => {
    const POS_OK = 0.15 // 임시 기준 (프로젝트에 맞게 조정)
    const out = computeTrackKpiAtTime(js, ctrl, POS_OK)
    if (!out) return null
    return {
      ...out,
      stamp: js?.header?.stamp ? rosStampToKstHms(js.header.stamp) : '-',
      posOkRad: POS_OK
    }
  }, [js, ctrl])

  // ✅ 시간 분포 히스토그램 (bin별 평균 posRms / successPct)
  const timeHist = useMemo(() => {
    const POS_OK = 0.15
    return buildTimeHistogram({
      jsWrapped,
      ctrlWrapped,
      duration,
      bins: 30,
      POS_OK
    })
  }, [jsWrapped, ctrlWrapped, duration])

  // ✅ 이슈 요약(가볍게): actuator + diagnostic
  const issueSummary = useMemo(() => {
    const out = []

    if (act) {
      const servo = act.servo_on
      const err = act.error_code
      const n = Math.max(servo?.length || 0, err?.length || 0)
      let servoOff = 0
      let errCnt = 0
      for (let i = 0; i < n; i++) {
        const s = typeof servo?.[i] === 'number' ? servo[i] : null
        const e = typeof err?.[i] === 'number' ? err[i] : null
        if (s != null && s === 0) servoOff++
        if (e != null && e !== 0) errCnt++
      }
      if (errCnt > 0) out.push(`❌ Actuator error joints: ${errCnt}`)
      if (servoOff > 0) out.push(`⚠️ Servo OFF joints: ${servoOff}`)
    }

    if (diag) {
      const sts = normalizeDiagnostics(diag)
      const err = sts.filter((s) => s?.level === 2).length
      if (err > 0) out.push(`❌ Diagnostic ERROR: ${err}`)
    }

    return out
  }, [act, diag])

  // ── gating ──────────────────────────────
  if (mcapParseError) {
    return (
      <div style={UX.noticePill('error')}>❌ MCAP parse error: {mcapParseError?.message ?? String(mcapParseError)}</div>
    )
  }
  if (isParsingMcap) return <div style={UX.noticePill('info')}>MCAP parsing...</div>

  const hasCtrl = Array.isArray(ctrlWrapped) && ctrlWrapped.length > 0

  return (
    <div style={UX.grid2}>
      {/* ── KPI: Target vs Actual ── */}
      <div style={UX.card}>
        <div style={UX.sectionTitle}>제어 성능 (Target vs Actual)</div>

        {!hasCtrl ? (
          <div style={UX.noticePill('warn')}>
            ⚠️ /tracking_controller/joint 샘플이 없습니다. (Target 기반 KPI/히스토그램이 제한됩니다.)
          </div>
        ) : !kpiNow ? (
          <div style={UX.noticePill('warn')}>⚠️ KPI 계산에 필요한 샘플을 찾지 못했습니다.</div>
        ) : (
          <>
            <div style={UX.kvRow}>
              <span style={UX.kvLabel}>Time</span>
              <span style={UX.badge({ ok: true })}>{kpiNow.stamp}</span>
              <span style={UX.kvSub}>t={Number(currentTime || 0).toFixed(2)}s</span>
            </div>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
              <span style={UX.badge({ ok: true })}>Success {kpiNow.successPct.toFixed(0)}%</span>
              <span style={UX.badge({ ok: true })}>pos RMS {kpiNow.posRms.toFixed(3)}</span>
              <span style={UX.badge({ warn: kpiNow.peak > 0.3, ok: true })}>pos peak {kpiNow.peak.toFixed(3)}</span>
            </div>

            <div style={{ marginTop: 10, fontSize: 11, color: theme.colors.textMuted }}>
              * Success 기준(|pos error| &lt; {kpiNow.posOkRad} rad)은 임시값입니다.
            </div>
          </>
        )}
      </div>

      {/* ── Time Distribution Histogram ── */}
      <div style={UX.card}>
        <div style={UX.sectionTitle}>시간 분포 (Histogram)</div>

        <div style={{ marginLeft: 'auto' }}>
          <GuideHover
            label="Guide"
            content={
              <div>
                <div style={{ fontWeight: 700, marginBottom: 6 }}>히스토그램 해석</div>
                <div style={{ display: 'grid', gap: 6 }}>
                  <div>
                    <b>posRMS↑</b>: 해당 구간에서 Target 대비 추종오차가 커짐
                  </div>
                  <div>
                    <b>success%↓</b>: 오차 기준(POS_OK)을 넘은 조인트 비율 증가
                  </div>
                  <div>
                    <b>연속으로 나쁨</b>: 지속 문제(튜닝/외란/하드웨어) 가능
                  </div>
                  <div>
                    <b>일부 bin만 튐</b>: 순간 이벤트(급동작/모드 전환 등) 가능
                  </div>
                  <div>
                    <b>samples가 적음</b>: 대표성 낮아 해석 주의
                  </div>
                  <div style={{ color: theme.colors.textMuted, fontSize: 11 }}>
                    세로선(ReferenceLine)은 현재 재생 시간입니다.
                  </div>
                </div>
              </div>
            }
          />
        </div>

        {!hasCtrl ? (
          <div style={UX.noticePill('warn')}>
            ⚠️ /tracking_controller/joint 샘플이 없어 히스토그램을 만들 수 없습니다.
          </div>
        ) : !timeHist?.length ? (
          <div style={UX.noticePill('warn')}>⚠️ 히스토그램을 만들 데이터가 부족합니다. (샘플/시간범위 확인)</div>
        ) : (
          <>
            <div style={{ height: 230 }}>
              <ResponsiveContainer>
                <BarChart data={timeHist} margin={{ top: 10, right: 10, left: 0, bottom: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" />

                  {/* ✅ 숫자 축 사용: ReferenceLine x=currentTime 정확히 동작 */}
                  <XAxis
                    type="number"
                    dataKey="tMid"
                    domain={[0, duration]}
                    tickFormatter={(v) => `${Number(v).toFixed(0)}s`}
                    tick={{ fontSize: 11 }}
                  />

                  <YAxis
                    yAxisId="left"
                    tick={{ fontSize: 11 }}
                    label={{ value: 'posRMS(rad)', angle: -90, position: 'insideLeft' }}
                  />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    domain={[0, 100]}
                    tick={{ fontSize: 11 }}
                    label={{ value: 'success(%)', angle: -90, position: 'insideRight' }}
                  />

                  <Tooltip
                    labelFormatter={(v, payload) => {
                      const p = payload?.[0]?.payload
                      if (p?.t0 != null && p?.t1 != null) return `구간: ${p.t0.toFixed(1)}~${p.t1.toFixed(1)}s`
                      return `t≈${Number(v).toFixed(2)}s`
                    }}
                    formatter={(val, name, item) => {
                      const p = item?.payload
                      if (name === 'posRms') return [typeof val === 'number' ? val.toFixed(3) : '-', 'posRMS']
                      if (name === 'successPct')
                        return [typeof val === 'number' ? `${val.toFixed(0)}%` : '-', 'success%']
                      if (name === 'samples') return [p?.samples ?? '-', 'samples']
                      return [val, name]
                    }}
                  />

                  <ReferenceLine x={currentTime} stroke={theme.colors.accent ?? '#7B68EE'} strokeWidth={2} />

                  {/* posRMS 막대 */}
                  <Bar yAxisId="left" dataKey="posRms" fill={theme.colors.primary ?? '#2C9E9E'} />

                  {/* success%는 같은 x에 겹쳐서(투명) 표시 */}
                  <Bar yAxisId="right" dataKey="successPct" fill={theme.colors.statusOk ?? '#10B981'} opacity={0.35} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div style={{ marginTop: 8, fontSize: 11, color: theme.colors.textMuted }}>
              * 각 막대는 해당 시간 구간에서의 평균 posRMS / 평균 success% 입니다. (ReferenceLine = currentTime)
            </div>
          </>
        )}
      </div>

      {/* ── Issue Summary ── */}
      <div style={UX.card}>
        <div style={UX.sectionTitle}>이슈 요약 (diagnostic/actuator 기반)</div>

        {issueSummary.length === 0 ? (
          <div style={{ fontSize: 12, color: theme.colors.textMuted }}>표시할 이슈가 없습니다.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {issueSummary.map((t, i) => (
              <div key={i} style={UX.cmdItem({ warn: t.startsWith('⚠️'), error: t.startsWith('❌') })}>
                {t}
              </div>
            ))}
          </div>
        )}

        <div style={{ marginTop: 10, fontSize: 11, color: theme.colors.textMuted }}>
          * CPU/메모리/전력 같은 리소스 값은 별도 토픽이 필요합니다. 여기서는 제어/하드웨어/진단 기반으로 구성합니다.
        </div>
      </div>

      {/* ── (Optional) Raw stats small note ── */}
      <div style={UX.card}>
        <div style={UX.sectionTitle}>데이터 상태</div>

        <details style={{ marginTop: 6 }}>
          <summary style={{ cursor: 'pointer', fontSize: 12, color: theme.colors.textMuted }}>
            개발자용 샘플 카운트 보기
          </summary>
          <div
            style={{
              marginTop: 8,
              fontSize: 12,
              color: theme.colors.textMuted,
              display: 'flex',
              flexDirection: 'column',
              gap: 6
            }}
          >
            <div>joint_states samples: {Array.isArray(jsWrapped) ? jsWrapped.length : 0}</div>
            <div>tracking_controller samples: {Array.isArray(ctrlWrapped) ? ctrlWrapped.length : 0}</div>
            <div>actuator_states samples: {Array.isArray(actWrapped) ? actWrapped.length : 0}</div>
            <div>diagnostic samples: {Array.isArray(diagWrapped) ? diagWrapped.length : 0}</div>
          </div>
        </details>
      </div>
    </div>
  )
}
