import { useEffect, useRef, useState } from 'react'
import type { Spot } from '@/selectors/proofTakes'

const LANE = 13
const GAP = 4

/**
 * The other takes at the selected note's spot, in thinner lanes under the waveform on the same time axis (the take that plays is the band
 * on the waveform itself). The width is worked out the way the waveform does it, so the two share their time axis exactly.
 */
export function TakeLanes({ spot, winStart, winLen }: { spot: Spot; winStart: number; winLen: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const [W, setW] = useState(860)
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
  const pw = W - 8
  const X = (t: number): number => ((t - winStart) / winLen) * pw
  const others = spot.takes.filter((t) => !t.active)
  if (!others.length) return null
  const H = others.length * (LANE + GAP)
  return (
    <div ref={ref} className="tlanes" data-lanes={others.length}>
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label={'The other takes at this spot: ' + others.map((t) => t.label).join(', ')}>
        {others.map((t, i) => {
          const x0 = Math.max(0, X(t.start))
          const x1 = Math.min(pw, X(t.start + t.len))
          if (x1 - x0 < 1) return null
          const y = i * (LANE + GAP) + GAP / 2
          return (
            <g key={t.id} data-lane={t.id}>
              <rect x={x0} y={y} width={x1 - x0} height={LANE} rx={3} fill="var(--violet)" fillOpacity={t.hidden ? 0.1 : 0.22} stroke="var(--violet)" strokeWidth={1} strokeDasharray={t.hidden ? '4 3' : undefined} />
              {x1 - x0 > 46 ? <text x={x0 + 5} y={y + LANE - 3} fontSize={10} fill="var(--violet)" fontFamily="IBM Plex Mono,monospace">{t.label}</text> : null}
            </g>
          )
        })}
      </svg>
    </div>
  )
}
