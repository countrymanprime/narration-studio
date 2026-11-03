/** Proof: one chapter at a time with its waveform, or the whole book as a chapter strip and a list. */
import { useLayoutEffect, useEffect, useMemo } from 'react'
import { registerCommands, registerContext, registerKeys } from '@/app/registry'
import { modals } from '@/app/modals'
import { tailItems } from '@/app/context'
import { NeedManuscript } from '@/ui/NeedManuscript'
import { ChapterBar, stepChapter } from '@/ui/ChapterBar'
import { IconButton, Input, Select } from '@/ui/primitives'
import { I, L, SEP, toast } from '@/ui/overlay'
import { capsOf, gateOf } from '@/selectors/daw'
import { WAVE_TOTAL, baseRows, isOpenNote, noteProgress, sourcesOf, stepLen, visibleRows } from '@/selectors/proof'
import { DEAD_AIR_LIMIT } from '@/config/estimates'
import { daw } from '@/state/daw'
import { getState, update, useData, useMock, useUi } from '@/state/store'
import { openInBooth, openInScript } from '@/state/commands/nav'
import { mmss } from '@/format/time'
import {
  allChapters, cleanDeadAir, closeFindNotes, decideNote, followSelection, moveNote, openFindNotes, reopenNote,
  setFilter, setQuery, setSort, stopPlay, toggleFindNotes, toggleInView, togglePlay, viewOf, zoomWindow,
} from '@/state/commands/proof'
import { spotOf } from '@/selectors/proofTakes'
import { CheckCard } from './proof/CheckCard'
import { ChapterStrip } from './proof/ChapterStrip'
import { KeyHints } from '@/ui/KeyHints'
import { Inspector } from './proof/Inspector'
import { NotesTable } from './proof/NotesTable'
import { WaveBlock } from './proof/Wave'

export default function ProofPage() {
  const data = useData()
  const ui = useUi()
  const mock = useMock()
  const p = ui.proof
  const view = useMemo(() => viewOf(ui), [ui.proof.scope, ui.chapter, p.filter, p.query, p.winStart, p.winLen, p.winFilter, p.sort]) // eslint-disable-line react-hooks/exhaustive-deps
  const all = p.scope === 'all'
  const base = useMemo(() => baseRows(data, view), [data, view])
  const rows = useMemo(() => visibleRows(data, view), [data, view])
  const order = useMemo(() => visibleRows(data, view, true), [data, view])
  const row = base.find((r) => r.id === p.sel) ?? null
  const prog = useMemo(() => noteProgress(data, base), [data, base])
  const toReview = base.filter((r) => !r.res).length
  const unfixed = base.filter((r) => isOpenNote(data, r)).length
  const sources = useMemo(() => sourcesOf(base), [base])
  const spot = useMemo(() => (row ? spotOf(data, row) : null), [data, row])

  // The window follows the selected note.
  useLayoutEffect(() => { if (mock.hasManuscript && row && p.winFor !== row.id) followSelection() }, [row, p.winFor, mock.hasManuscript])
  useEffect(() => () => stopPlay(), [])

  if (!mock.hasManuscript) return <NeedManuscript title="Proof" />

  /* The counts are given room for the most digits they can have (the number of notes), so a decision never changes the width of a chip. */
  const digits = String(base.length).length
  const filters: Array<['all' | 'open' | 'unfixed' | 'pickup' | 'done', string, number]> = [
    ['all', 'All', base.length], ['open', 'To review', toReview], ['unfixed', 'Open', unfixed], ['pickup', 'Pickups', base.filter((r) => r.res === 'pickup').length], ['done', 'Decided', prog.decided],
  ]
  const off = !capsOf(mock).reachable
  const chapterRows = base.filter((r) => r.chapterId === ui.chapter)

  return (
    <div className="page proof">
      <section className="panel wave">
        <div className="ph">
          <h1>Proof</h1>
          <ChapterBar scopeKey="proof" />
          <span className="spacer" />
          {base.length ? (
            <div className="row">
              <div className="ring" style={{ ['--p' as string]: prog.pct }} aria-hidden="true" />
              <span><b data-cleared>{prog.cleared} of {prog.total}</b> <span className="sub">cleared</span> <span className="sub" data-decided>· {prog.decided} decided</span></span>
            </div>
          ) : null}
        </div>
        {all ? (
          <div className="wavewrap"><span className="label">Open notes, by chapter</span><ChapterStrip data={data} current={ui.chapter} /></div>
        ) : (
          <>
          <CheckCard chapterId={ui.chapter} />
          <div className="wavewrap">
            <div className="wtools">
              <span className="label">Showing</span>
              <span className="mono" id="wlabel">{mmss(Math.round(p.winStart)) + '–' + mmss(Math.round(p.winStart + p.winLen))}</span>
              <span className="spacer" />
              <IconButton icon="zoomOut" tip="Zoom out" id="wzout" disabled={stepLen(p.winLen, 1) == null} onClick={() => zoomWindow(1)} />
              <IconButton icon="zoomIn" tip="Zoom in" id="wzin" tipSide="r" disabled={stepLen(p.winLen, -1) == null} onClick={() => zoomWindow(-1)} />
            </div>
            <WaveBlock rows={chapterRows} sel={p.sel} winStart={p.winStart} winLen={p.winLen} play={p.play} spot={spot} />
          </div>
          </>
        )}
      </section>
      <section className="panel queue">
        <div className="ph">
          <h2>Notes · {rows.length}{rows.length !== base.length ? ' of ' + base.length : ''}</h2>
          <div className="filters" role="group" aria-label="Filter notes">
            {filters.map(([k, l, n]) => <button key={k} type="button" className="chip" data-f={k} aria-pressed={p.filter === k} onClick={() => setFilter(k)}>{l} <span className="cn" style={{ ['--cn' as string]: digits + 'ch' }}>{n}</span></button>)}
            {!all && p.winLen < WAVE_TOTAL ? <button type="button" className="chip" data-wf aria-pressed={p.winFilter} onClick={toggleInView}>In view</button> : null}
          </div>
          <span className="spacer" />
          <div className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
            <Select id="psort" aria-label="Sort notes" value={p.sort} onValueChange={(v) => setSort(v as typeof p.sort)} style={{ width: 'auto', minWidth: 116 }}
              options={[{ value: 'time', label: 'By time' }, { value: 'confidence', label: 'By confidence' }, { value: 'severity', label: 'By severity' }]} />
            <IconButton icon="listen" tip="Check recordings…" id="chk" aria-haspopup="dialog" disabled={off} onClick={() => modals.checkRecordings([ui.chapter])} />
            <Input type="text" id="pfind" placeholder="Find in notes" aria-label="Find in notes" value={p.query} style={{ width: 170, display: p.findOpen ? undefined : 'none' }}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); closeFindNotes() } }} />
            <IconButton icon="search" tip="Find in notes (Ctrl+F)" id="pfopen" onClick={toggleFindNotes} />
            <IconButton icon="import" tip="Import proofer sheet" id="imp" onClick={() => toast('Choose the proofer’s CSV.')} />
            <IconButton icon="export" tip="Export for proofer" id="exp" tipSide="r" onClick={() => toast('Exported ' + data.proofNotes.length + ' notes for the proofer.')} />
          </div>
        </div>
        {sources.length ? <div className="sub" id="psources" style={{ padding: '6px 16px' }}>Sources: {sources.map((x) => x.source + ' ' + x.n).join(' · ')}</div> : null}
        <div className="tblwrap" style={{ flex: 1 }}>
          <NotesTable data={data} rows={rows} total={base.length} all={all} sel={p.sel} />
        </div>
      </section>
      {row ? <Inspector row={row} ui={p} order={order} /> : <aside className="panel insp" />}
      <KeyHints hints={[
        { keys: ['↑', '↓'], label: 'Notes' },
        { keys: ['←', '→'], label: 'Chapter' },
        { keys: ['P'], label: 'Pickup' }, { keys: ['E'], label: 'Edit' }, { keys: ['W'], label: 'Waive' }, { keys: ['D'], label: 'Defer' },
        { keys: ['Space'], label: 'Play' },
        ...(all ? [] : [{ keys: ['Esc'], label: 'All chapters' }]),
        { keys: ['Ctrl', 'Z'], label: 'Undo' },
      ]} />
    </div>
  )
}

/* Right-click on a note, in the list or on the waveform. */
registerContext((t) => {
  const s = getState()
  if (s.ui.page !== 'proof') return null
  const pr = t.closest('tr[data-r],g[data-mk]') as HTMLElement | null
  if (!pr) return null
  const id = +(pr.dataset.r ?? pr.dataset.mk ?? 0)
  const r = s.data.proofNotes.find((x) => x.id === id)
  if (!r) return null
  const goto = gateOf(s.mock, 'goto')
  return [
    L(r.t + ' · ' + r.ty),
    I('Needs pickup', () => decideNote(id, 'pickup'), { checked: r.res === 'pickup', k: 'P' }),
    I('Fix in edit', () => decideNote(id, 'edit'), { checked: r.res === 'edit', k: 'E' }),
    I('Waive', () => decideNote(id, 'waive'), { checked: r.res === 'waive', k: 'W' }),
    I('Defer', () => decideNote(id, 'defer'), { checked: r.res === 'defer', k: 'D' }),
    I('Reopen', () => reopenNote(id), { disabled: !r.res }),
    SEP,
    I('Play ±3 s', () => { update((d) => { d.ui.proof.sel = id }); togglePlay() }),
    I('Go to ' + goto.label, () => toast(daw().gotoTime(r.chapterId, r.sec).message), { disabled: !goto.ok }),
    ...(r.ty === 'pacing' && !r.res ? [SEP, I('Trim the gap to ' + DEAD_AIR_LIMIT + ' s', () => cleanDeadAir([r.id]))] : []),
    SEP,
    I('Open this chapter in Script', () => openInScript(r.chapterId)),
    I('Open this chapter in Booth', () => openInBooth(r.chapterId)),
    ...tailItems(),
  ]
})

/* The jump menu offers the chapter steps with their keys while Proof is showing. */
registerCommands(() => (getState().ui.page === 'proof' ? [
  { g: 'Proof', l: 'Next chapter', k: '→', fn: () => stepChapter(1) },
  { g: 'Proof', l: 'Previous chapter', k: '←', fn: () => stepChapter(-1) },
] : []))

/* Keys while Proof is showing. */
registerKeys('proof', (e, info) => {
  const s = getState()
  if (!s.mock.hasManuscript) return
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') { e.preventDefault(); openFindNotes(); return true }
  if (e.key === 'Escape') {
    if (!info.hadPop && s.ui.proof.scope === 'chapter' && !info.typing) { allChapters(); return true }
    return
  }
  if (info.typing || !info.plain) return
  const k = e.key.toLowerCase()
  const sel = s.ui.proof.sel
  if (k === 'j' || e.key === 'ArrowDown') { e.preventDefault(); moveNote(1) }
  else if (k === 'k' || e.key === 'ArrowUp') { e.preventDefault(); moveNote(-1) }
  /* Left and right step the chapter. The focused overview window and its edge handles keep their own arrows (they stop the key first). */
  else if ((e.key === 'ArrowRight' || e.key === 'ArrowLeft') && !e.shiftKey && !(e.target as HTMLElement | null)?.closest('[role="slider"]')) { e.preventDefault(); stepChapter(e.key === 'ArrowRight' ? 1 : -1) }
  else if (k === 'p' && sel != null) decideNote(sel, 'pickup')
  else if (k === 'e' && sel != null) decideNote(sel, 'edit')
  else if (k === 'w' && sel != null) decideNote(sel, 'waive')
  else if (k === 'd' && sel != null) decideNote(sel, 'defer')
  else if (e.key === ' ' && (e.target as HTMLElement | null)?.tagName !== 'BUTTON') { e.preventDefault(); togglePlay() }
  else return
  return true
})
