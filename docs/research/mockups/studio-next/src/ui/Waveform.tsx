/**
 * The chapter waveform: an overview strip with a draggable window, the zoomed waveform with its pins, and (optionally) bands
 * (a stretch of time with a name) and a drag-to-choose range. Proof and Editing both draw it; each passes its own pins, bands and
 * window commands, so nothing here knows about notes, takes or effects.
 */
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { mmss } from '@/format/time'
import { MIN_WINDOW } from '@/selectors/proof'

/**
 * The zoomed waveform is symmetric about its centerline (`CY`): the pin heads and tips reach no higher above it than the bottom reaches below,
 * so the pins need no empty headroom and the waveform is as short as it can be.
 */
const H = 84
const CY = H / 2
const pseudo = (n: number): number => (((n + 1) * 2654435761) >>> 0) % 1000 / 1000

/** A marker on the waveform: a point in time with a colour. `done` draws it hollow. */
export interface Pin { id: number | string; sec: number; colour: string; done?: boolean; label: string }
/** A stretch of the chapter. `draft` is a range still being chosen. */
/** `lane` of `lanes`: bands that share a stretch of time (stacked takes) are drawn one above the other. */
export interface Band { id: string; start: number; end: number; label: string; selected?: boolean; dim?: boolean; draft?: boolean; lane?: number; lanes?: number; tone?: 'ok' }
export interface Cluster<T> { items: T[]; x0: number; x1: number }

/** Pins that would touch merge into one count, unless one of them is selected. */
export function clusterPins<T extends { id: number | string; sec: number }>(rows: T[], t0: number, len: number, pw: number, sel: number | string | null): Array<Cluster<T>> {
  const X = (t: number): number => ((t - t0) / len) * pw
  const rs = rows.filter((r) => r.sec >= t0 - 3 && r.sec <= t0 + len + 3).sort((a, b) => a.sec - b.sec)
  const cl: Array<Cluster<T>> = []
  rs.forEach((r) => {
    const x = X(r.sec)
    const last = cl[cl.length - 1]
    if (last && x - last.x1 < 16 && r.id !== sel && !last.items.some((i) => i.id === sel)) {
      last.items.push(r)
      last.x1 = x
    } else cl.push({ items: [r], x0: x, x1: x })
  })
  return cl
}

function useWidth(): [React.RefObject<HTMLDivElement>, number] {
  const ref = useRef<HTMLDivElement>(null)
  const [w, setW] = useState(860)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = (): void => setW(Math.max(360, Math.round(el.clientWidth - 32) || 860))
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, w]
}

export interface WaveformProps {
  /** Length of the chapter recording in seconds. */
  total: number
  winStart: number
  winLen: number
  /** Playhead, in seconds, or null. */
  play: number | null
  pins: Pin[]
  sel: number | string | null
  onPin: (id: number | string) => void
  /** What a merged group of pins is called, for screen readers ("notes", "findings"). */
  pinsName: string
  bands?: Band[]
  onBand?: (id: string) => void
  /**
   * The overview window: drag it, step it with the arrow keys, and let go. With `resize` its left and right edges are handles that
   * can be dragged (or moved with the arrow keys when focused); `edge` is the edge being moved and `sec` the time it goes to.
   */
  window: { move: (centerSec: number) => void; release: () => void; nudge: (dir: 1 | -1) => void; resize?: (edge: 'start' | 'end', sec: number) => void }
  /** Drag across the zoomed waveform to choose a range. `done` is true when the pointer is released. */
  onRange?: (start: number, end: number, done: boolean) => void
  ariaLabel: string
}

export function Waveform({ total, winStart: t0, winLen, play, pins, sel, onPin, pinsName, bands = [], onBand, window: win, onRange, ariaLabel }: WaveformProps) {
  const [ref, W] = useWidth()
  const pw = W - 8
  const X = (t: number): number => ((t - t0) / winLen) * pw
  const bars = useMemo(() => {
    const out: Array<{ x: number; y: number; h: number }> = []
    for (let px = 0; px < pw; px += 4) {
      const tt = t0 + (px / pw) * winLen
      const rnd = pseudo(Math.floor(tt * 1.5))
      const env = 0.35 + 0.55 * Math.abs(Math.sin(tt / 9) * Math.cos(tt / 23))
      const h = Math.max(3, env * (0.3 + rnd) * 46 + 4)  // at most about 58, so the bars stay inside +/- CY
      out.push({ x: px, y: CY - h / 2, h })
    }
    return out
  }, [pw, t0, winLen])
  const cl = clusterPins(pins, t0, winLen, pw, sel)
  const MH = 34
  const mbars = useMemo(() => {
    const out: Array<{ x: number; y: number; w: number; h: number }> = []
    for (let i = 0; i < 160; i++) {
      const env = 0.35 + 0.55 * Math.abs(Math.sin(i / 7) * Math.cos(i / 19))
      const h = Math.max(2, env * (0.3 + pseudo(i + 2)) * 20 + 3)
      out.push({ x: (i * W) / 160, y: MH / 2 - h / 2, w: W / 160 - 1, h })
    }
    return out
  }, [W])

  /* Moving the window: grab it where you like and it keeps that spot under the pointer; a click outside it centres it there. */
  const drag = useRef(false)
  const grabAt = useRef(0)
  const [grabbing, setGrabbing] = useState(false)
  const miniRef = useRef<HTMLDivElement>(null)
  const secAt = (e: PointerEvent): number => {
    const r = miniRef.current!.getBoundingClientRect()
    return ((e.clientX - r.left) / (r.width || 1)) * total
  }
  const move = (e: PointerEvent): void => win.move(secAt(e) - grabAt.current)
  const onDown = (e: PointerEvent): void => {
    if ((e.target as Element).closest('[data-edge]')) return
    drag.current = true
    const at = secAt(e)
    grabAt.current = at >= t0 && at <= t0 + winLen ? at - (t0 + winLen / 2) : 0
    setGrabbing(true)
    move(e)
    try { miniRef.current?.setPointerCapture(e.pointerId) } catch { /* not every environment can capture */ }
  }
  const endMove = (): void => {
    if (!drag.current) return
    drag.current = false
    setGrabbing(false)
    win.release()
  }

  /* Resizing it: an edge follows the pointer; the other edge stays, the length keeps a minimum and the window stays inside the chapter. */
  const edgeDrag = useRef<'start' | 'end' | null>(null)
  const [resizing, setResizing] = useState<'start' | 'end' | null>(null)
  const onEdgeDown = (edge: 'start' | 'end') => (e: PointerEvent): void => {
    if (!win.resize || e.button !== 0) return
    e.stopPropagation()
    edgeDrag.current = edge
    setResizing(edge)
    try { (e.currentTarget as Element).setPointerCapture(e.pointerId) } catch { /* not every environment can capture */ }
  }
  const onEdgeMove = (e: PointerEvent): void => {
    if (edgeDrag.current) win.resize?.(edgeDrag.current, secAt(e))
  }
  const onEdgeUp = (e: PointerEvent): void => {
    if (!edgeDrag.current) return
    e.stopPropagation()
    edgeDrag.current = null
    setResizing(null)
    win.release()
  }
  /** Arrow keys on a focused edge move it by 5 s (30 s with Shift); Home and End are not used. */
  const onEdgeKey = (edge: 'start' | 'end') => (e: KeyboardEvent): void => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
    e.preventDefault()
    e.stopPropagation()
    const step = (e.shiftKey ? 30 : 5) * (e.key === 'ArrowRight' ? 1 : -1)
    win.resize?.(edge, (edge === 'start' ? t0 : t0 + winLen) + step)
    win.release()
  }
  const edgeProps = (edge: 'start' | 'end') => {
    const here = edge === 'start' ? t0 : t0 + winLen
    const min = Math.min(MIN_WINDOW, total)
    const lo = edge === 'start' ? 0 : t0 + min
    const hi = edge === 'start' ? t0 + winLen - min : total
    return {
      'data-edge': edge, tabIndex: 0, role: 'slider', 'aria-orientation': 'horizontal' as const,
      'aria-label': edge === 'start' ? 'Start of the part shown. Left and right arrows move it.' : 'End of the part shown. Left and right arrows move it.',
      'aria-valuemin': Math.round(lo), 'aria-valuemax': Math.round(hi), 'aria-valuenow': Math.round(here), 'aria-valuetext': mmss(Math.round(here)),
      className: 'wedge ' + edge + (resizing === edge ? ' on' : ''),
      onPointerDown: onEdgeDown(edge), onPointerMove: onEdgeMove, onPointerUp: onEdgeUp, onKeyDown: onEdgeKey(edge),
    }
  }
  const onKey = (e: KeyboardEvent): void => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
    e.preventDefault()
    e.stopPropagation()
    win.nudge(e.key === 'ArrowRight' ? 1 : -1)
  }
  const ph = play != null && play >= t0 && play <= t0 + winLen ? X(play) : null

  /* Choosing a range on the zoomed waveform. */
  const rng = useRef<number | null>(null)
  const timeAt = (e: PointerEvent): number => {
    const r = ref.current!.getBoundingClientRect()
    return Math.max(0, Math.min(total, t0 + ((e.clientX - r.left) / (r.width || 1)) * winLen))
  }
  const rangeOf = (e: PointerEvent): [number, number] => {
    const a = rng.current!
    const b = timeAt(e)
    return [Math.min(a, b), Math.max(a, b)]
  }
  const onWaveDown = (e: PointerEvent): void => {
    if (!onRange || e.button !== 0 || (e.target as Element).closest('[data-mk],[data-cl],[data-band]')) return
    rng.current = timeAt(e)
    try { ref.current?.setPointerCapture(e.pointerId) } catch { /* not every environment can capture */ }
  }
  const onWaveMove = (e: PointerEvent): void => {
    if (rng.current == null || !onRange) return
    const [a, b] = rangeOf(e)
    if (b - a >= 0.5) onRange(a, b, false)
  }
  const onWaveUp = (e: PointerEvent): void => {
    if (rng.current == null || !onRange) return
    const [a, b] = rangeOf(e)
    rng.current = null
    if (b - a >= 0.5) onRange(a, b, true)
  }

  return (
    <>
      <div
        id="wmini" ref={miniRef} className="wmini" tabIndex={0} role="slider" aria-label="Part of the chapter shown below. Left and right arrows move it."
        aria-valuemin={0} aria-valuemax={total} aria-valuenow={Math.round(t0)}
        aria-valuetext={'Showing ' + mmss(Math.round(t0)) + ' to ' + mmss(Math.round(t0 + winLen))}
        onPointerDown={onDown} onPointerMove={(e) => { if (drag.current) move(e) }}
        onPointerUp={endMove}
        onKeyDown={onKey}
        data-grabbing={grabbing || undefined}
      >
        <svg viewBox={`0 0 ${W} ${MH}`} width={W} height={MH} aria-hidden="true">
          {mbars.map((b, i) => <rect key={i} x={b.x} y={b.y} width={b.w} height={b.h} fill="var(--faint)" opacity=".5" />)}
          {bands.filter((b) => !b.draft).map((b) => (
            <rect key={b.id} x={(b.start / total) * W} y={MH - 8} width={Math.max(2, ((b.end - b.start) / total) * W)} height={6} rx={2} fill="var(--violet)" opacity={b.dim ? 0.35 : 0.9} />
          ))}
          {pins.map((r) => (
            <rect key={r.id} x={(r.sec / total) * W - 1.2} y={2} width={2.4} height={MH - 4} fill={r.colour} opacity={r.done && r.id !== sel ? 0.35 : 1} />
          ))}
          <rect x={(t0 / total) * W} y={0.75} width={Math.max(6, (winLen / total) * W)} height={MH - 1.5} rx={3} fill="var(--copper)" fillOpacity=".16" stroke="var(--copper)" strokeWidth={1.5} />
        </svg>
        {win.resize ? (
          /* The window's own box over the strip: its body is grabbed to move, its two edges are handles (12 px wide, the full height) to resize. */
          <div className="wwin" style={{ left: (t0 / total) * 100 + '%', width: Math.max(0.8, (winLen / total) * 100) + '%' }}>
            <span {...edgeProps('start')} />
            <span {...edgeProps('end')} />
          </div>
        ) : null}
      </div>
      <div id="wave" ref={ref} onPointerDown={onWaveDown} onPointerMove={onWaveMove} onPointerUp={onWaveUp} style={onRange ? { cursor: 'crosshair', touchAction: 'none' } : undefined}>
        <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label={ariaLabel}>
          {bars.map((b, i) => <rect key={i} x={b.x} y={b.y} width={2.5} height={b.h} rx={1.2} fill="var(--faint)" opacity=".55" />)}
          {bands.map((b) => {
            const x0 = Math.max(0, X(b.start))
            const x1 = Math.min(pw, X(b.end))
            if (x1 <= 0 || x0 >= pw || x1 - x0 < 1) return null
            const lanes = Math.max(1, b.lanes ?? 1)
            const lh = (H - 8) / lanes
            const y0 = 4 + (b.lane ?? 0) * lh
            const bh = lanes > 1 ? lh - 2 : H - 8
            return (
              <g key={b.id} data-band={b.id} style={{ cursor: onBand && !b.draft ? 'pointer' : undefined }} onClick={() => { if (!b.draft) onBand?.(b.id) }}>
                <rect x={x0} y={y0} width={x1 - x0} height={bh} rx={4} fill={b.tone === 'ok' ? 'var(--ok)' : 'var(--violet)'} fillOpacity={b.draft ? 0.1 : b.dim ? 0.08 : 0.2}
                  stroke={b.tone === 'ok' ? 'var(--ok)' : 'var(--violet)'} strokeWidth={b.selected ? 2.5 : 1.25} strokeDasharray={b.draft || b.dim ? '5 3' : undefined} />
                {x1 - x0 > 54 ? <text x={x0 + 6} y={lanes > 1 ? y0 + bh - 5 : H - 12} fontSize={11} fill={b.tone === 'ok' ? 'var(--ok)' : 'var(--violet)'} fontFamily="IBM Plex Mono,monospace">{b.label}</text> : null}
              </g>
            )
          })}
          {cl.map((c) => {
            if (c.items.length > 1) {
              const x = (c.x0 + c.x1) / 2
              const y = 12
              return (
                <g key={c.items[0].id} data-cl={c.items.map((i) => i.id).join(',')} style={{ cursor: 'pointer' }} role="button" aria-label={c.items.length + ' ' + pinsName + ' close together'}
                  onClick={() => onPin(c.items[0].id)}>
                  <line x1={x} x2={x} y1={y + 9} y2={H} stroke="var(--ink)" strokeWidth={1.5} opacity=".5" />
                  <line x1={x} x2={x} y1={y + 9} y2={H} stroke="transparent" strokeWidth={14} />
                  <circle cx={x} cy={y} r={9} fill="var(--surface)" stroke="var(--ink)" strokeWidth={2} />
                  <text x={x} y={y + 4} fontSize={11} fontWeight={700} textAnchor="middle" fill="var(--ink)" fontFamily="IBM Plex Mono,monospace">{c.items.length}</text>
                  <rect x={x - 12} y={0} width={24} height={24} fill="transparent" />
                </g>
              )
            }
            const r = c.items[0]
            const x = c.x0
            const s = r.id === sel
            const col = r.colour
            const y = 12
            return (
              <g key={r.id} data-mk={r.id} style={{ cursor: 'pointer' }} onClick={() => onPin(r.id)}>
                <line x1={x} x2={x} y1={y + 5} y2={H} stroke={col} strokeWidth={s ? 3 : 1.5} opacity={r.done && !s ? 0.4 : 1} />
                <line x1={x} x2={x} y1={y + 5} y2={H} stroke="transparent" strokeWidth={14} />
                <circle cx={x} cy={y} r={s ? 8 : 5} fill={r.done ? 'var(--surface)' : col} stroke={col} strokeWidth={2} />
                {s ? <text x={x + (x > W - 80 ? -13 : 13)} y={y + 4} textAnchor={x > W - 80 ? 'end' : 'start'} fontSize={11} fill="var(--ink)" fontFamily="IBM Plex Mono,monospace">{r.label}</text> : null}
                <rect x={x - 10} y={0} width={20} height={24} fill="transparent" />
              </g>
            )
          })}
          {ph != null ? <line x1={ph} x2={ph} y1={0} y2={H} stroke="var(--ink)" strokeWidth={2} /> : null}
        </svg>
      </div>
    </>
  )
}
