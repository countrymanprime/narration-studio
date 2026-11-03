import { useRef } from 'react'
import type { BookData } from '@/domain/schemas'
import { clock } from '@/format/time'
import { shownTakes } from '@/selectors/editing'
import { itemAt, summarize, type ChapterDoc, type DocPara } from '@/selectors/scriptedit'
import type { EditingUi } from '@/state/slices/ui'
import { selectBetween, clickWord } from '@/state/commands/scriptedit'
import { playTake } from '@/state/commands/editing'
import { Pill } from '@/ui/primitives'
import { MiniWave } from './TakeParts'
import { Wave } from './Ribbon'

/**
 * The timeline under the script (wide windows), or in the drawer where it does not fit: the chapter's audio under the line the cursor is on, and
 * one lane for each take of that passage, all on one time axis with one playhead. The selection is mirrored as a band; dragging on the audio
 * selects the words under it, and a lane plays its take.
 */
export function TimelineStrip({ doc, dp, data, ed, nowT, selKeys }: { doc: ChapterDoc; dp: DocPara | null; data: BookData; ed: EditingUi; nowT: number | null; selKeys: string[] }) {
  const drag = useRef<string | null>(null)
  const box = useRef<HTMLDivElement>(null)
  if (!dp) return <div className="sx-tl" id="timeline"><div className="tl-h"><span className="label">Timeline</span></div></div>
  const timed = dp.items.filter((i) => i.t0 != null && !i.cut && i.st !== 'miss')
  const takes = dp.passage ? shownTakes(dp.passage) : []
  const lo = Math.min(timed.length ? timed[0].t0! : Infinity, ...takes.map((t) => t.start)) - 1.2
  const hi = Math.max(timed.length ? timed[timed.length - 1].t1! : -Infinity, ...takes.map((t) => t.start + t.len)) + 1.2
  const ok = Number.isFinite(lo) && Number.isFinite(hi) && hi > lo
  const t0 = ok ? lo : 0
  const t1 = ok ? hi : 1
  const pn = (t: number): number => ((t - t0) / (t1 - t0)) * 100
  const pc = (t: number): string => pn(t).toFixed(2) + '%'
  const sum = selKeys.length && ed.sel ? summarize(data, doc, selKeys) : null
  const band = sum && sum.audible.length ? { a: sum.start, b: sum.end } : null
  const at = (clientX: number): number => {
    const r = box.current!.getBoundingClientRect()
    return t0 + Math.max(0, Math.min(1, (clientX - r.left) / r.width)) * (t1 - t0)
  }
  const keyAt = (t: number): string | null => itemAt({ ...doc, items: dp.items }, t)?.key ?? null
  return (
    <div className="sx-tl" id="timeline" aria-label="Waveform and takes, following the line the cursor is on">
      <div className="tl-h"><span className="label">Timeline</span><span className="mono sub">{clock(t0)} to {clock(t1)}</span>{sum?.audible.length ? <Pill kind="info" size="sm">{sum.len.toFixed(1)} s</Pill> : null}</div>
      <div className="lns-r tl-main">
        <div className="lns-l"><span className="label">Audio</span><span className="sub">{dp.take ? dp.take.id : 'Recording'}</span></div>
        <div ref={box} className="lns-t big" data-tl-audio
          onMouseDown={(e) => { const k = keyAt(at(e.clientX)); if (!k) return; drag.current = k; clickWord(k) }}
          onMouseMove={(e) => { if (drag.current && e.buttons === 1) { const k = keyAt(at(e.clientX)); if (k) selectBetween(drag.current, k) } }}
          onMouseUp={() => { drag.current = null }} onMouseLeave={() => { drag.current = null }}>
          <Wave items={dp.items} t0={t0} t1={t1} now={nowT} sel={sum ? selKeys : undefined} h={40} ticks bars={240} />
        </div>
      </div>
      {takes.map((t) => (
        <div key={t.id} className="lns-r" data-lane={t.id}>
          <div className="lns-l"><span className="mono tid">{t.id}</span>{t.active ? <Pill kind="info" size="sm">Active</Pill> : <Pill kind="neutral" size="sm">Muted</Pill>}</div>
          <div className="lns-t" onClick={() => dp.passage && playTake(dp.passage.id, t.id)} role="button" aria-label={'Play ' + t.id}>
            <div className={'lns-b' + (t.active ? ' on' : '')} style={{ left: pc(t.start), width: (pn(t.start + t.len) - pn(t.start)).toFixed(2) + '%' }}><MiniWave take={t} /></div>
            {band && t.active ? <i className="lns-selband" style={{ left: pc(band.a), width: (pn(band.b) - pn(band.a)).toFixed(2) + '%' }} /> : null}
            {nowT != null ? <i className="lns-now" style={{ left: pc(nowT) }} /> : null}
          </div>
        </div>
      ))}
      <div className="lns-ax mono sub"><span>{clock(t0)}</span><span>{clock((t0 + t1) / 2)}</span><span>{clock(t1)}</span></div>
    </div>
  )
}
