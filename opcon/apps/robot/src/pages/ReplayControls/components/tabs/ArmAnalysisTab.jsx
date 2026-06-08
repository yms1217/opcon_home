// ArmAnalysisTab.jsx (A안: tSec=상대초 기준 전체 교체본)
import React, { useMemo, useEffect } from 'react'
import { theme, UX } from '../../styles'
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, ReferenceLine } from 'recharts'
import { rosStampToKstHms } from '@/utils/dateUtils'
/* ───────────────── helpers ───────────────── */

// rad → deg
const rad2deg = (r) => (typeof r === 'number' ? (r * 180) / Math.PI : null)

function getArmJointIndices(names = [], side = 'left') {
  const re = side === 'right' ? /^right_joint_(\d+)$/i : /^left_joint_(\d+)$/i
  const pairs = []
  for (let i = 0; i < names.length; i++) {
    const m = re.exec(String(names[i] ?? ''))
    if (!m) continue
    const jn = Number(m[1])
    pairs.push({ idx: i, jn })
  }
  pairs.sort((a, b) => a.jn - b.jn)
  return pairs.map((p) => p.idx)
}

// 간단한 안정성 지표: 최근 window에서 vel RMS, effort RMS 계산
function computeStability(samples, idxs, windowSize = 120) {
  if (!Array.isArray(samples) || samples.length < 2 || !idxs?.length) return null
  const tail = samples.slice(Math.max(0, samples.length - windowSize))

  let velSqSum = 0
  let effSqSum = 0
  let nVel = 0
  let nEff = 0
  let velPeak = 0
  let effPeak = 0

  for (const s of tail) {
    const v = s?.velocity
    const e = s?.effort
    for (const idx of idxs) {
      const vv = typeof v?.[idx] === 'number' ? v[idx] : null
      const ee = typeof e?.[idx] === 'number' ? e[idx] : null
      if (vv != null) {
        velSqSum += vv * vv
        nVel += 1
        velPeak = Math.max(velPeak, Math.abs(vv))
      }
      if (ee != null) {
        effSqSum += ee * ee
        nEff += 1
        effPeak = Math.max(effPeak, Math.abs(ee))
      }
    }
  }

  const velRms = nVel > 0 ? Math.sqrt(velSqSum / nVel) : null
  const effRms = nEff > 0 ? Math.sqrt(effSqSum / nEff) : null

  // velRms가 작을수록 100에 가까움(보수적 매핑)
  const smoothPct = velRms != null ? Math.max(0, Math.min(100, 100 * Math.exp(-0.8 * velRms))) : null

  return { velRms, effRms, velPeak, effPeak, smoothPct }
}

// wrapped index 찾기 (tSec 기준, 이진탐색) — EndEffectorTab과 동일 패턴
function indexAtTime(wrapped, tSec) {
  if (!Array.isArray(wrapped) || wrapped.length === 0) return -1
  const first = wrapped[0]
  const looksWrapped = first && typeof first === 'object' && ('msg' in first || 'tSec' in first)
  const firstTSec = looksWrapped ? first?.tSec : null

  // fallback: tSec가 없다면 "비율"로 추정하거나 마지막으로
  if (!looksWrapped || firstTSec == null || typeof tSec !== 'number') return wrapped.length - 1

  let lo = 0
  let hi = wrapped.length - 1
  let ans = 0
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    const tt = wrapped[mid]?.tSec
    if (typeof tt === 'number' && tt <= tSec) {
      ans = mid
      lo = mid + 1
    } else hi = mid - 1
  }
  return ans
}

// 이벤트 로그(명령 대신) : spike / gap 등 joint_states 기반 자동 생성

function buildDerivedEvents(slice, idxs, sideLabel) {
  if (!Array.isArray(slice) || slice.length === 0 || !idxs?.length) return []

  const out = []
  const VEL_WARN = 1.8 // rad/s (프로젝트에 맞게 튜닝)
  const EFF_WARN = 6.0 // effort 단위 (프로젝트에 맞게 튜닝)

  let prevSec = null
  for (let k = 0; k < slice.length; k++) {
    const s = slice[k]
    const stamp = s?.header?.stamp
    const t = rosStampToKstHms(stamp)

    // 시간 gap 체크(아주 러프)
    const sec = stamp?.sec ?? null
    if (prevSec != null && sec != null) {
      const dt = sec - prevSec
      if (dt > 1) {
        out.push({ t, msg: `⚠️ [${sideLabel}] joint_states time gap ~${dt}s`, warn: true })
      }
    }
    if (sec != null) prevSec = sec

    // spike 체크
    let maxVel = 0
    let maxEff = 0
    for (const idx of idxs) {
      const vv = typeof s?.velocity?.[idx] === 'number' ? Math.abs(s.velocity[idx]) : 0
      const ee = typeof s?.effort?.[idx] === 'number' ? Math.abs(s.effort[idx]) : 0
      maxVel = Math.max(maxVel, vv)
      maxEff = Math.max(maxEff, ee)
    }
    if (maxVel > VEL_WARN)
      out.push({ t, msg: `⚠️ [${sideLabel}] velocity spike: ${maxVel.toFixed(2)} rad/s`, warn: true })
    if (maxEff > EFF_WARN) out.push({ t, msg: `❌ [${sideLabel}] effort spike: ${maxEff.toFixed(2)}`, error: true })
  }

  return out.slice(-8)
}

/**
 * ✅ A안(권장): wrapped[*].tSec 는 "상대초(0~duration)"로 정규화되어 있다고 가정
 *    → currentTime(상대초) 기준으로 tSec <= currentTime 인 마지막 샘플 선택 (이진탐색)
 *
 * - 하위호환: tSec가 없거나 msg-only 배열이면
 *   totalDuration이 있으면 "비율"로, 없으면 last fallback
 */
function selectSampleAtTime(wrapped, currentTime, totalDuration) {
  if (!Array.isArray(wrapped) || wrapped.length === 0) return null

  const first = wrapped[0]
  const last = wrapped[wrapped.length - 1]
  const looksWrapped = first && typeof first === 'object' && ('msg' in first || 'tSec' in first)
  const firstTSec = looksWrapped ? first?.tSec : null

  const dur = Number(totalDuration || 0)
  const target = Number(currentTime || 0)

  // Fallback: tSec 없음 or msg-only 배열
  if (!looksWrapped || firstTSec == null) {
    if (dur > 0) {
      const r = Math.min(1, Math.max(0, target / dur))
      const idx = Math.round(r * (wrapped.length - 1))
      const picked = wrapped[idx]
      return picked?.msg ?? picked ?? null
    }
    return last?.msg ?? last ?? null
  }

  // A안 핵심: tSec(상대초) <= currentTime(상대초)
  let lo = 0
  let hi = wrapped.length - 1
  let ans = 0

  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    const t = wrapped[mid]?.tSec
    if (typeof t === 'number' && t <= target) {
      ans = mid
      lo = mid + 1
    } else {
      hi = mid - 1
    }
  }

  return wrapped[ans]?.msg ?? null
}

// 상대초(tSec) → KST HH:MM:SS 포맷
function formatKstTime(tSec, timeRange) {
  const base = timeRange?.absStartSec ?? timeRange?.startSec
  if (typeof base !== 'number' || typeof tSec !== 'number') return '-'
  const absMs = (base + tSec) * 1000

  const d = new Date(absMs)

  return d.toLocaleTimeString('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  })
}

/* ───────────────── main ───────────────── */

export default function ArmAnalysisTab({
  side = 'left',
  mcapSummary,
  windowSize = 120,
  currentTime = 0,
  isParsingMcap = false,
  mcapParseError = null
}) {
  const DEBUG = false

  // samples['/joint_states'] may be:
  //  - [{tSec,msg},...]  (A안: tSec=상대초)
  //  - [obj,...]         (fallback)
  const wrapped = mcapSummary?.samples?.['/joint_states'] ?? []
  const timeRange = mcapSummary?.timeRange ?? null

  const totalDuration = useMemo(() => {
    const tr = mcapSummary?.timeRange
    return tr && Number.isFinite(tr.startSec) && Number.isFinite(tr.endSec)
      ? Math.max(0, tr.endSec - tr.startSec)
      : undefined
  }, [mcapSummary])

  // 분석용: msg만 뽑아낸 배열 (stability/derivedEvents에 사용)
  const jointSamples = useMemo(() => wrapped.map((x) => x?.msg ?? x).filter(Boolean), [wrapped])

  // ✅ 표시용: currentTime에 해당하는 “현재 샘플”
  const currentSample = useMemo(
    () => selectSampleAtTime(wrapped, currentTime, totalDuration),
    [wrapped, currentTime, totalDuration]
  )

  useEffect(() => {
    const w = wrapped
    if (!Array.isArray(w) || w.length === 0) return
    const firstT = w[0]?.tSec
    const lastT = w[w.length - 1]?.tSec
    //console.log('[joint_states tSec range]', { len: w.length, firstT, lastT, currentTime })
  }, [wrapped, currentTime])

  useEffect(() => {
    if (!DEBUG) return
    //console.log('[ArmTab] props.currentTime changed:', currentTime)
  }, [currentTime, DEBUG])

  const names = currentSample?.name ?? []
  const idxs = useMemo(() => getArmJointIndices(names, side), [names, side])

  const joints = useMemo(() => {
    if (!currentSample || !idxs.length) return []
    return idxs.map((idx, i) => {
      const full = String(names[idx] ?? `J${i + 1}`)
      const posRad = currentSample?.position?.[idx]
      const vel = currentSample?.velocity?.[idx]
      const eff = currentSample?.effort?.[idx]
      const posDeg = rad2deg(posRad)

      // 경고 기준(임시): vel/eff 값 기반 (추후 정책화 가능)
      const warn = (typeof vel === 'number' && Math.abs(vel) > 1.2) || (typeof eff === 'number' && Math.abs(eff) > 4.0)
      const error = (typeof vel === 'number' && Math.abs(vel) > 2.5) || (typeof eff === 'number' && Math.abs(eff) > 8.0)

      return {
        key: full,
        name: `J${i + 1}`,
        fullName: full,
        posDeg,
        vel,
        eff,
        warn,
        error
      }
    })
  }, [currentSample, idxs, names])

  const stability = useMemo(() => {
    if (!Array.isArray(wrapped) || wrapped.length === 0) return null
    const idxNow = indexAtTime(wrapped, Number(currentTime || 0))
    if (idxNow < 0) return null

    // jointSamples는 wrapped와 동일 길이/순서라고 가정(위에서 map으로 생성)
    const start = Math.max(0, idxNow - windowSize + 1)
    const slice = jointSamples.slice(start, idxNow + 1)
    return computeStability(slice, idxs, windowSize)
  }, [wrapped, jointSamples, idxs, windowSize, currentTime])

  // ── Chart data (Position / Velocity) ─────────────────
  const chartData = useMemo(() => {
    if (!Array.isArray(wrapped) || !idxs.length) return []

    const jointIdx = idxs[0] // 대표 joint: J1 (필요시 selector로 확장)

    return wrapped
      .slice(Math.max(0, wrapped.length - windowSize))
      .map((w) => {
        const msg = w?.msg ?? w
        const pos = msg?.position?.[jointIdx]
        const vel = msg?.velocity?.[jointIdx]

        return {
          t: w?.tSec ?? null,
          posDeg: typeof pos === 'number' ? rad2deg(pos) : null,
          vel: typeof vel === 'number' ? vel : null
        }
      })
      .filter((d) => typeof d.t === 'number')
  }, [wrapped, idxs, windowSize])

  const sideLabel = side === 'right' ? 'RA' : 'LA'

  const derivedEvents = useMemo(() => {
    if (!Array.isArray(wrapped) || wrapped.length === 0) return []
    const idxNow = indexAtTime(wrapped, Number(currentTime || 0))
    if (idxNow < 0) return []

    const start = Math.max(0, idxNow - windowSize + 1)
    const slice = jointSamples.slice(start, idxNow + 1)
    return buildDerivedEvents(slice, idxs, sideLabel)
  }, [wrapped, jointSamples, idxs, sideLabel, windowSize, currentTime])

  const hasData = !!currentSample && idxs.length > 0

  return (
    <div style={styles.root}>
      {/* ── Joint Status ── */}
      <div style={UX.card}>
        <div style={UX.sideTitle(side)}>Joint 상태 — {side === 'right' ? 'RIGHT ARM ▶' : '◀ LEFT ARM'}</div>

        {/* 로딩/에러 상태 */}
        {mcapParseError ? (
          <div style={UX.noticePill('error')}>
            ❌ MCAP parse error: {mcapParseError?.message ?? String(mcapParseError)}
          </div>
        ) : isParsingMcap ? (
          <div style={UX.noticePill('info')}>MCAP parsing...</div>
        ) : !hasData ? (
          <div style={UX.noticePill('warn')}>⚠️ /joint_states에서 {side} arm joint를 찾지 못했습니다.</div>
        ) : (
          <>
            <div style={{ ...UX.kvRow, marginBottom: 10 }}>
              <span style={UX.kvLabel}>Stamp</span>
              <span style={UX.badge({ ok: true })}>{rosStampToKstHms(currentSample?.header?.stamp)}</span>
              <span style={UX.kvSub}>frame: {currentSample?.header?.frame_id ?? '-'}</span>
            </div>

            {joints.map((j) => {
              const pct = j.posDeg != null ? Math.min(100, (Math.abs(j.posDeg) / 180) * 100) : 0
              return (
                <div key={j.key} style={UX.gaugeRow}>
                  <div style={UX.gaugeLabel}>
                    <span title={j.fullName}>
                      {j.error ? '🔴' : j.warn ? '🟡' : '🟢'} {j.name}
                    </span>
                    <span>
                      {j.posDeg != null ? `${j.posDeg.toFixed(1)}°` : '-'} ·
                      {typeof j.vel === 'number' ? ` v ${j.vel.toFixed(2)}` : ' v -'} ·
                      {typeof j.eff === 'number' ? ` e ${j.eff.toFixed(2)}` : ' e -'}
                    </span>
                  </div>

                  <div style={UX.gaugeBar}>
                    <div
                      style={UX.gaugeFill({
                        pct,
                        warn: j.warn,
                        error: j.error,
                        side
                      })}
                    />
                  </div>
                </div>
              )
            })}
          </>
        )}
      </div>

      {/* ── Real‑time Chart (placeholder) ── */}
      <div style={UX.card}>
        <div style={UX.sideTitle(side)}>실시간 차트</div>

        {chartData.length === 0 ? (
          <div style={UX.noticePill('warn')}>차트에 표시할 joint 데이터가 없습니다.</div>
        ) : (
          <>
            {/* ── Position Chart ── */}
            <div style={{ height: 160 }}>
              <ResponsiveContainer>
                <LineChart data={chartData}>
                  <XAxis dataKey="t" tickFormatter={(v) => formatKstTime(v, timeRange)} tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} label={{ value: 'deg', angle: -90, position: 'insideLeft' }} />
                  <Tooltip />
                  <ReferenceLine x={currentTime} stroke={theme.colors.accent} />
                  <Line
                    type="monotone"
                    dataKey="posDeg"
                    stroke={theme.colors.statusOk}
                    dot={false}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* ── Velocity Chart ── */}
            <div style={{ height: 160, marginTop: 12 }}>
              <ResponsiveContainer>
                <LineChart data={chartData}>
                  <XAxis dataKey="t" tickFormatter={(v) => formatKstTime(v, timeRange)} tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} label={{ value: 'rad/s', angle: -90, position: 'insideLeft' }} />
                  <Tooltip />
                  <ReferenceLine x={currentTime} stroke={theme.colors.accent} />
                  <Line
                    type="monotone"
                    dataKey="vel"
                    stroke={theme.colors.statusWarn}
                    dot={false}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div style={{ marginTop: 6, fontSize: 11, color: theme.colors.textMuted }}>
              joint: {names[idxs[0]]} · samples: {chartData.length}
            </div>
          </>
        )}
      </div>

      {/* ── Stability Analysis ── */}
      <div style={UX.card}>
        <div style={UX.sideTitle(side)}>안정성 분석 (joint_states 기반)</div>

        {!stability ? (
          <div style={UX.noticePill('warn')}>⚠️ 안정성 분석을 위해 /joint_states 샘플이 더 필요합니다.</div>
        ) : (
          <>
            <div style={UX.gaugeRow}>
              <div style={UX.gaugeLabel}>
                <span>Smoothness</span>
                <span style={{ color: stability.smoothPct < 70 ? theme.colors.statusWarn : theme.colors.statusOk }}>
                  {stability.smoothPct.toFixed(0)}% · velRMS {stability.velRms?.toFixed?.(2) ?? '-'}
                </span>
              </div>
              <div style={UX.gaugeBar}>
                <div style={UX.gaugeFill({ pct: stability.smoothPct, warn: stability.smoothPct < 70, side })} />
              </div>
            </div>

            <div style={UX.kvRow}>
              <span style={UX.kvLabel}>vel peak</span>
              <span style={UX.badge({ ok: stability.velPeak < 1.8, warn: stability.velPeak >= 1.8 })}>
                {stability.velPeak?.toFixed?.(2) ?? '-'}
              </span>
              <span style={UX.kvLabel}>eff RMS</span>
              <span style={UX.badge({ ok: true })}>{stability.effRms?.toFixed?.(2) ?? '-'}</span>
            </div>
          </>
        )}
      </div>

      {/* ── Derived Event History ── */}
      <div style={UX.card}>
        <div style={UX.sideTitle(side)}>이벤트/경고 (자동 생성)</div>

        <div style={{ ...UX.colTight, gap: 4 }}>
          {derivedEvents.length === 0 ? (
            <div style={UX.noticePill('info')}>표시할 이벤트가 없습니다.</div>
          ) : (
            derivedEvents.map((c, i) => (
              <div key={i} style={UX.cmdItem({ warn: c.warn, error: c.error })}>
                <span style={{ color: theme.colors.textMuted }}>[{c.t}]</span> {c.msg}
              </div>
            ))
          )}
        </div>

        <div style={{ marginTop: 8, color: theme.colors.textMuted, fontSize: 11 }}>
          * /rosout, command topic이 없어서 joint_states로부터 파생된 경고만 표시합니다.
        </div>
      </div>
    </div>
  )
}

const styles = {
  root: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 10,

    // ✅ 핵심: row를 정의하지 않는다
    gridAutoRows: 'auto',

    // ✅ 스크롤은 부모가 담당
    height: 'auto',
    minHeight: 'auto',
    overflow: 'visible'
  }
}
