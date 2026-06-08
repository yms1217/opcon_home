// SensorChart.jsx
import React, { useEffect, useRef } from 'react'
import uPlot from 'uplot'
import 'uplot/dist/uPlot.min.css'

export default function SensorChart({ sampleMode = true, data: mcapData }) {
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

  useEffect(() => {
    if (!chartRef.current || !sensor) return

    // 기존 차트 제거
    if (plotRef.current) {
      plotRef.current.destroy()
      plotRef.current = null
    }

    // uPlot 설정
    const opts = {
      title: 'Sensor Data (Sample)',
      width: chartRef.current.clientWidth,
      height: chartRef.current.clientHeight,
      scales: { x: { time: false } },
      series: [
        {}, // x-axis
        { label: 'X', stroke: 'red' },
        { label: 'Y', stroke: 'blue' },
        { label: 'Z', stroke: 'green' }
      ]
    }

    const data = [sensor.t, sensor.x, sensor.y, sensor.z]

    plotRef.current = new uPlot(opts, data, chartRef.current)

    const resize = () => {
      if (!plotRef.current) return
      plotRef.current.setSize({
        width: chartRef.current.clientWidth,
        height: chartRef.current.clientHeight
      })
    }

    window.addEventListener('resize', resize)
    return () => window.removeEventListener('resize', resize)
  }, [sensor])

  return (
    <div
      ref={chartRef}
      style={{
        width: '100%',
        height: '100%',
        background: '#fff',
        border: '1px solid #ccc',
        borderRadius: 6,
        padding: 4,
        boxSizing: 'border-box'
      }}
    />
  )
}
