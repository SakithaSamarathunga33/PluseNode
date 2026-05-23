"use client"

import { useEffect, useMemo, useRef } from "react"
import uPlot from "uplot"
import "uplot/dist/uPlot.min.css"

type Series = {
  label: string
  values: number[]
  color: string
  fill?: string
  width?: number
}

type UPlotChartProps = {
  series: Series[]
  height?: number
  mode?: "line" | "bar"
  max?: number
}

export function UPlotChart({ series, height = 200, mode = "line", max }: UPlotChartProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<uPlot | null>(null)

  const data = useMemo(() => {
    const len = Math.max(2, ...series.map(s => s.values.length))
    const x = Array.from({ length: len }, (_, i) => i)
    return [x, ...series.map(s => padSeries(s.values, len))] as uPlot.AlignedData
  }, [series])

  useEffect(() => {
    const root = rootRef.current
    if (!root) return

    const buildOptions = (): uPlot.Options => ({
      width: root.clientWidth || 400,
      height,
      cursor: { drag: { x: false, y: false } },
      legend: { show: false },
      scales: { x: { time: false }, y: { range: max ? [0, max] : undefined } },
      axes: [
        {
          stroke: "var(--pn-muted)",
          grid: { show: false },
          ticks: { show: false },
          values: (_, vals) => vals.map(v => String(v)),
          font: "10px sans-serif",
        },
        {
          stroke: "var(--pn-muted)",
          grid: { stroke: "rgba(220,232,245,0.06)", width: 1 },
          ticks: { show: false },
          font: "10px sans-serif",
        },
      ],
      series: [
        {},
        ...series.map(s => ({
          label: s.label,
          stroke: s.color,
          fill: mode === "line" ? s.fill : undefined,
          width: s.width ?? 1.5,
          paths: mode === "bar" ? uPlot.paths.bars!({ size: [0.65, 60] }) : undefined,
        })),
      ],
    })

    const chart = new uPlot(buildOptions(), data, root)
    chartRef.current = chart

    const resize = () => chart.setSize({ width: root.clientWidth || 400, height })
    const observer = new ResizeObserver(resize)
    observer.observe(root)

    return () => {
      observer.disconnect()
      chart.destroy()
      chartRef.current = null
    }
  }, [height, max, mode]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    chartRef.current?.setData(data)
  }, [data])

  return <div ref={rootRef} className="uplot-wrap w-full" />
}

function padSeries(values: number[], len: number) {
  const out = values.slice(-len)
  while (out.length < len) out.unshift(out[0] ?? 0)
  return out
}
