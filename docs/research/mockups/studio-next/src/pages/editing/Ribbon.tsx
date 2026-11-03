import { memo, type ReactNode } from 'react'
import type { DocItem } from '@/selectors/scriptedit'
import { isLow } from '@/selectors/scriptedit'

/**
 * A drawing of the audio under a stretch of words: bars where a word sounds, a tint where the recogniser flagged one, ticks at every word
 * boundary, the selection as a blue band and the playing moment as a line. A stand-in: the real waveform reads the file's peaks, and this
 * takes its shape from the words' times, so the same words always draw the same.
 */
const noise = (i: number, s: number): number => (((i * 2654435761 + s * 40503) >>> 0) % 1000) / 1000

export const Wave = memo(function Wave({ items, t0, t1, now, sel, h = 56, ticks = true, bars = 260 }: {
  items: DocItem[]; t0: number; t1: number; now?: number | null; sel?: string[]; h?: number; ticks?: boolean; bars?: number
}) {
  const W = 1000
  const span = Math.max(0.001, t1 - t0)
  const x = (t: number): number => ((t - t0) / span) * W
  const spans = items.filter((i) => i.t0 != null && i.st !== 'miss' && !i.cut)
  const rects: ReactNode[] = []
  spans.forEach((i) => {
    const w = Math.max(2, x(i.t1!) - x(i.t0!))
    if (i.st === 'extra') rects.push(<rect key={'x' + i.key} x={x(i.t0!)} width={w} y={0} height={h} className="wv-extra" />)
    else if ((i.st === 'mis' || isLow(i)) && !i.accepted) rects.push(<rect key={'l' + i.key} x={x(i.t0!)} width={w} y={0} height={h} className="wv-low" />)
  })
  const picked = sel?.length ? items.filter((i) => sel.includes(i.key) && i.t0 != null && !i.cut && i.st !== 'miss') : []
  if (picked.length) {
    const a = x(picked[0].t0!)
    const b = x(picked[picked.length - 1].t1!)
    rects.push(<rect key="sel" x={a} width={Math.max(2, b - a)} y={0} height={h} className="wv-sel" />)
  }
  /* The audio of each word, found once for the whole drawing. */
  const cover = (t: number): DocItem | undefined => spans.find((i) => t >= i.t0! && t <= i.t1!)
  const out: ReactNode[] = []
  for (let k = 0; k < bars; k++) {
    const t = t0 + (k / bars) * span
    const c = cover(t)
    const amp = c ? 0.28 + 0.7 * Math.abs(Math.sin(k / 2.3 + (c.text.length % 5))) * (0.5 + 0.5 * noise(k, 3)) : 0.03 + 0.03 * noise(k, 7)
    const bh = Math.max(1.5, amp * (h - 6))
    out.push(<rect key={k} x={(k / bars) * W} y={h / 2 - bh / 2} width={W / bars - 1.2} height={bh} rx={1} />)
  }
  return (
    <svg className="wv" viewBox={`0 0 ${W} ${h}`} preserveAspectRatio="none" style={{ height: h }} aria-hidden="true">
      {rects}
      <g className="wv-bars">{out}</g>
      {ticks ? spans.map((i) => <line key={'t' + i.key} x1={x(i.t0!)} x2={x(i.t0!)} y1={0} y2={h} className="wv-tick" />) : null}
      {now != null && now >= t0 && now <= t1 ? <line x1={x(now)} x2={x(now)} y1={0} y2={h} className="wv-now" /> : null}
    </svg>
  )
})
