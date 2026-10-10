import { useMemo } from 'react'
import { clock } from '@/format/time'
import { activeRegions, capState, coverage, fmtPct, regionName, regionsOf, type CapState } from '@/selectors/editing'
import type { MockState } from '@/state/slices/mock'
import type { EditingUi } from '@/state/slices/ui'
import { openDrawer, selectFx, setCap } from '@/state/commands/editing'
import type { BookData } from '@/domain/schemas'
import { FieldRow, NumberInput, Pill, type PillKind } from '@/ui/primitives'

const CAP_PILL: Record<CapState, [PillKind, string]> = { within: ['ok', 'Within the cap'], over: ['warn', 'Over the cap'], far: ['bad', 'Far over the cap'] }

/** Where effects sit in the chapter, how much of it they cover, and the cap that figure is judged against. */
export function CoverageStrip({ data, chapterId, setup, ed }: { data: BookData; chapterId: string; setup: MockState['setup']; ed: EditingUi }) {
  const cov = useMemo(() => coverage(data, chapterId, setup), [data, chapterId, setup])
  const cap = data.editor.fxCapPct
  const st = capState(cov.pct, cap)
  const on = useMemo(() => activeRegions(data, chapterId, setup), [data, chapterId, setup])
  const all = regionsOf(data, chapterId)
  /** The effect a click on a stretch selects: the last one to start there. */
  const topAt = (mid: number): string | undefined =>
    [...on].filter((r) => r.scope === 'track' || (r.start <= mid && mid < r.end)).sort((a, b) => b.start - a.start)[0]?.id
  const pct = (x: number): string => (x / cov.total) * 100 + '%'
  return (
    <div className="cover">
      <div className="cover-h">
        <span className="label">Coverage</span>
        <b className="cover-fig" id="covfig">Effects cover {fmtPct(cov.pct)} of this chapter</b>
        <Pill kind={CAP_PILL[st][0]} dot>{CAP_PILL[st][1]}</Pill>
        <span className="spacer" />
        <FieldRow label="Cap" htmlFor="fxcap" inline>
          <NumberInput id="fxcap" aria-label="Most of a chapter effects may cover, in percent" style={{ width: 76 }} value={cap} min={0} max={100} step={1} onValueChange={setCap} />
          <span className="sub">%</span>
        </FieldRow>
      </div>
      <div className="covstrip" role="group" aria-label={all.length ? 'Where effects sit in this chapter' : 'No effects on this chapter'}>
        {cov.segs.map((s) => {
          const id = topAt((s.start + s.end) / 2)
          const label = s.n + (s.n > 1 ? ' effects' : ' effect') + ' from ' + clock(s.start) + ' to ' + clock(s.end)
          return (
            <button key={s.start} type="button" className={'cv' + (id && id === ed.fx && ed.drawer === 'effects' ? ' sel' : '')} data-n={Math.min(2, s.n)} data-fx={id}
              style={{ left: pct(s.start), width: pct(s.end - s.start) }} aria-label={label + (id ? ': ' + regionName(data, data.fxRegions.find((r) => r.id === id)!) : '')} title={label}
              onClick={() => { if (id) { openDrawer('effects'); selectFx(id) } }} />
          )
        })}
      </div>
      <div className="covkey">
        <span><i /> None</span>
        <span><i data-n="1" /> 1 effect</span>
        <span><i data-n="2" /> 2 or more</span>
      </div>
    </div>
  )
}
