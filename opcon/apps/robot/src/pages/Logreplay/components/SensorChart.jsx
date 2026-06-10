// SensorChart.jsx
import React, { useEffect, useRef, useMemo } from 'react'
import uPlot from 'uplot'
import 'uplot/dist/uPlot.min.css'

export default React.memo(function SensorChart({
  sampleMode = false,
  data: mcapData,
  title = 'Sensor Data',
  labels = { x: 'X', y: 'Y', z: 'Z' },
  colors = { x: 'red', y: 'blue', z: 'green' },
  playheadSec = null,
  t0EpochMs = null
}) {
  const chartRef = useRef(null)
  const plotRef = useRef(null)

  // 샘플 데이터 생성 (시간 t, x/y/z 센서값)
  function generateSample() {
    const t = []
    const x = []
    const y = []
    const z = []
    for (let i = 0; i < 600; i++) {
      t.push(i)
      x.push(Math.sin(i / 50) + Math.random() * 0.1)
      y.push(Math.cos(i / 60) + Math.random() * 0.1)
      z.push(Math.sin(i / 30) * 0.5 + Math.random() * 0.2)
    }
    return { t, x, y, z }
  }

  const sensor = sampleMode ? generateSample() : mcapData
  const baseSec = t0EpochMs != null ? t0EpochMs / 1000 : 0
  const xTime = useMemo(() => {
    if (!sensor?.t || !Array.isArray(sensor.t)) return []
    return sensor.t.map((v) => v + baseSec)
  }, [sensor, baseSec])

  useEffect(() => {
    if (!chartRef.current || !sensor) return
    if (!Array.isArray(sensor.t) || sensor.t.length === 0) return

    // ✅ 이미 존재하면 setData()로 갱신 (깜빡임 방지)
    if (plotRef.current) {
      try {
        plotRef.current.setData([xTime, sensor.x, sensor.y, sensor.z])
      } catch {
        /* 크기 불일치 등 → 아래서 재생성 */
      }
      return
    }

    // uPlot 설정
    const opts = {
      title: sampleMode ? `${title} (Sample)` : title,
      width: chartRef.current.clientWidth,
      height: chartRef.current.clientHeight,
      scales: { x: { time: baseSec > 0 } },
      cursor: { x: false, y: false },
      plugins: [playheadPlugin()],
      series: [
        {}, // x-axis
        { label: labels.x || 'X', stroke: colors.x || 'red' },
        { label: labels.y || 'Y', stroke: colors.y || 'blue' },
        { label: labels.z || 'Z', stroke: colors.z || 'green' }
      ]
    }

    const data = [xTime, sensor.x, sensor.y, sensor.z]

    plotRef.current = new uPlot(opts, data, chartRef.current)

    const resize = () => {
      if (!plotRef.current) return
      plotRef.current.setSize({
        width: chartRef.current.clientWidth,
        height: chartRef.current.clientHeight
      })
    }

    window.addEventListener('resize', resize)

    return () => {
      window.removeEventListener('resize', resize)
      plotRef.current?.destroy()
      plotRef.current = null
    }
  }, [sensor, sampleMode, title, labels, colors, baseSec])

  // ✅ playhead 수직선 (RAF 기반, 리렌더 없이 직접 DOM 조작)
  const playheadRef = useRef(null)
  const baseSecRef = useRef(0)
  baseSecRef.current = baseSec

  useEffect(() => {
    const plot = plotRef.current
    if (!plot || playheadSec == null || !Number.isFinite(playheadSec)) {
      if (playheadRef.current) playheadRef.current.style.display = 'none'
      return
    }

    const plotSec = playheadSec + baseSecRef.current
    const left = plot.valToPos(plotSec, 'x', true)
    const el = playheadRef.current
    if (!el) return
    if (left < plot.bbox.left / devicePixelRatio || left > (plot.bbox.left + plot.bbox.width) / devicePixelRatio) {
      el.style.display = 'none'
    } else {
      el.style.display = ''
      el.style.left = `${left}px`
    }
  }, [playheadSec])

  return (
    <div
      ref={chartRef}
      style={{
        width: '100%',
        height: '100%',
        background: '#fff',
        border: '1px solid #ccc',
        borderRadius: 6,
        boxSizing: 'border-box',
        position: 'relative'
      }}
    >
      <div
        ref={playheadRef}
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          width: 1,
          background: '#ef4444',
          pointerEvents: 'none',
          zIndex: 10,
          display: 'none'
        }}
      />
    </div>
  )
})

// ✅ uPlot 플러그인: 빈 껍데기 (향후 확장 가능)
function playheadPlugin() {
  return { hooks: {} }
}
