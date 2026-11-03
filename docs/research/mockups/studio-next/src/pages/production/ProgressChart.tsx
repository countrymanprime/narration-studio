import { useEffect, useRef, useState } from 'react'
import type { BookData } from '@/domain/schemas'
import { addDays, diffDays, fmtD } from '@/format/time'
import { NOT_MEASURED, recordedSeries } from '@/selectors/measured'
import { dueDate, planStart, today, WPH, type Calc } from '@/selectors/progress'

const MONO = 'IBM Plex Mono,monospace'

/** Recorded audio against the plan: plan dashed, actual solid, projection dotted. */
/** The chart has a fixed height and draws to the width it is given, so a wide window gives it room without making it taller. */
export function ProgressChart({ data, k, height = 200, fill = false }: { data: BookData; k: Calc; height?: number; fill?: boolean }) {
  const box = useRef<HTMLDivElement>(null)
  const [W, setW] = useState(520)
  const [fillH, setFillH] = useState(height)
  useEffect(() => {
    const el = box.current
    if (!el) return
    const on = (): void => {
      setW(Math.max(280, Math.round(el.clientWidth)))
      if (fill) setFillH(Math.max(height, Math.round(el.clientHeight)))
    }
    on()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(on)
    ro.observe(el)
    return () => ro.disconnect()
  }, [fill, height])
  const H = fill ? fillH : height
  const L = 40, R = 12, T = 14, B = 28
  const td = today(data)
  const due = dueDate(data)
  const start = planStart(data)
  const end = new Date(Math.max(due.getTime(), k.finish.getTime()) + 3 * 86400000)
  const span = diffDays(end, start)
  const ymax = Math.ceil(k.fh * 1.1)
  const X = (d: Date): number => L + (diffDays(d, start) / span) * (W - L - R)
  const Y = (v: number): number => H - B - (v / ymax) * (H - B - T)
  // The actual line is what the take log reports, up to the recorded length now; with no log there is no line.
  const series = recordedSeries(data)
  const nowDay = diffDays(td, start)
  const actual: Array<[number, number]> = series.ok ? [...series.value.filter((p) => p[0] < nowDay), [nowDay, k.rw / WPH]] : []
  const xt: number[] = []
  for (let d = 0; d <= span; d += 7) xt.push(d)
  const ticks = [0, 1, 2, 3].filter((v) => v <= ymax)
  return (
    <div style={fill ? { position: 'relative', height: '100%', minHeight: height } : undefined}>
    <div ref={box} style={fill ? { position: 'absolute', inset: 0 } : { width: '100%', height: H }}>
    <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} style={{ display: 'block' }} role="img" aria-label="Recorded audio versus plan">
      {ticks.map((v) => (
        <g key={v}>
          <line x1={L} x2={W - R} y1={Y(v)} y2={Y(v)} stroke="var(--line)" />
          <text x={L - 6} y={Y(v) + 4} textAnchor="end" fontSize="11" fill="var(--muted)" fontFamily={MONO}>{v}h</text>
        </g>
      ))}
      {xt.map((d) => (
        <text key={d} x={X(addDays(start, d))} y={H - 8} textAnchor="middle" fontSize="11" fill="var(--muted)" fontFamily={MONO}>{fmtD(addDays(start, d))}</text>
      ))}
      <line x1={X(due)} x2={X(due)} y1={T} y2={H - B} stroke="var(--bad)" strokeDasharray="2 4" />
      <text x={X(due) - 4} y={T + 10} textAnchor="end" fontSize="11" fill="var(--bad)">due {fmtD(due)}</text>
      <line x1={X(start)} y1={Y(0)} x2={X(due)} y2={Y(k.fh)} stroke="var(--faint)" strokeWidth="2" strokeDasharray="6 5" />
      {actual.length ? <polyline fill="none" stroke="var(--copper)" strokeWidth="3" points={actual.map((a) => X(addDays(start, a[0])) + ',' + Y(a[1])).join(' ')} /> : null}
      {series.ok ? null : <text x={L + 8} y={T + 10} fontSize="11" fill="var(--muted)">Recorded days {NOT_MEASURED}</text>}
      <line x1={X(td)} y1={Y(k.rw / WPH)} x2={X(k.finish)} y2={Y(k.fh)} stroke="var(--copper)" strokeWidth="2" strokeDasharray="1 5" strokeLinecap="round" />
      <circle cx={X(td)} cy={Y(k.rw / WPH)} r="5" fill="var(--copper)" stroke="var(--surface)" strokeWidth="2" />
      <text x={X(td)} y={Y(k.rw / WPH) - 10} textAnchor="middle" fontSize="11" fill="var(--ink)">today</text>
      <text x={X(k.finish)} y={Y(k.fh) - 8} textAnchor="end" fontSize="11" fill="var(--copper-text)">done {fmtD(k.finish)} (est.)</text>
    </svg>
    </div>
    </div>
  )
}
