import { useMemo } from 'react'
import { daw } from '@/state/daw'
import { stripTags } from '@/format/text'
import { mmss } from '@/format/time'
import { chName, chapterById, paragraphById, paragraphsOf } from '@/selectors/chapters'
import { masterRowFor } from '@/selectors/master'
import { isDone, pickupList } from '@/selectors/pickups'
import { baseRows, noteProgress, RES_CLASS, RES_LABEL, threadOf } from '@/selectors/proof'
import { WPH, vals } from '@/selectors/progress'
import type { Resolution } from '@/domain/schemas'
import { decideCompanionNote, openFullApp, selectNote } from '@/state/commands/companion'
import { useData, useMock, useStudio } from '@/state/store'
import { toast } from '@/ui/overlay'
import { IconButton } from '@/ui/primitives'
import { Icon } from '@/ui/Icon'
import { Markup } from './companion/Markup'

const DECISIONS: Array<[Resolution, string]> = [['pickup', 'Needs pickup'], ['edit', 'Fix in edit'], ['waive', 'Waive'], ['defer', 'Defer']]

/** The narrow window beside the DAW: it follows the chapter the DAW playhead is in. */
export default function CompanionPage() {
  const data = useData()
  const mock = useMock()
  const sel = useStudio((s) => s.ui.proof.sel)
  const chapter = chapterById(data, mock.dawChapter)
  const notes = useMemo(() => baseRows(data, { scope: 'chapter', chapter: mock.dawChapter }), [data, mock.dawChapter])
  const row = notes.find((r) => r.id === sel) ?? notes[0]
  const picks = pickupList(data).filter((x) => x.chapterId === mock.dawChapter && !isDone(data, x.id))
  const rp = mock.setup === 'reaper'
  const idx = row ? notes.indexOf(row) : -1
  const move = (d: number): void => { if (row) selectNote(notes[Math.max(0, Math.min(notes.length - 1, idx + d))].id) }
  const para = row ? paragraphById(data, row.pid) : undefined
  const paraNo = para ? paragraphsOf(data, para.chapterId).findIndex((x) => x.id === para.id) + 1 : 0
  const recSec = chapter ? Math.round(((chapter.words / WPH) * 3600 * chapter.rec) / 100) : 0
  const mrow = masterRowFor(data, mock.dawChapter)
  const v = chapter ? vals(data, chapter) : null
  const mastered = !!mrow && !mrow.waiting && !!v?.master

  return (
    <div className="cmp">
      <div className="cmph">
        <div className="logo" aria-hidden="true"><Icon name="mic" /></div>
        <b style={{ font: '600 18px var(--f-display)', letterSpacing: '.04em' }}>Companion</b>
        <span className="spacer" />
        <span className={'pill ' + (rp ? 'ok' : mock.setup === 'builtin' ? 'neutral' : 'warn')}><span className="dot" />{rp ? 'Following playhead' : mock.setup === 'builtin' ? 'Built-in recorder' : 'REAPER not running'}</span>
        <IconButton icon="expand" tip="Open the full app" tipSide="r" id="cfull" onClick={openFullApp} />
      </div>
      <div className="cmpb stack">
        <span className="label">{chapter ? chName(data, chapter) : ''}{para ? ' · ¶ ' + paraNo : ''}</span>
        {row ? <div className="quote" style={{ fontFamily: 'var(--f-serif)', fontSize: 18, lineHeight: 1.55 }}><Markup text={row.script} /></div> : null}
      </div>
      <div className="cmpb stack">
        <div className="row">
          <span className="label">Note at playhead</span><span className="spacer" />
          {row ? <span className={'type t-' + row.ty}>{row.ty}</span> : null}
          {row?.res ? <span className={'pill ' + RES_CLASS[row.res]}>{RES_LABEL[row.res]}</span> : null}
        </div>
        {row ? (
          <>
            <div className="sub" style={{ fontSize: 13 }}>{threadOf(row)[0]?.text ?? row.h}</div>
            <div className="row">
              <IconButton icon="up" tip="Previous note" id="cprev" onClick={() => move(-1)} />
              <IconButton icon="down" tip="Next note" id="cnext" onClick={() => move(1)} />
              <IconButton icon="play" tip="Play ±3 s" id="cplay" onClick={() => toast(daw().playAround(row.sec, 3).message)} />
              <IconButton icon="external" tip="Show in REAPER" id="cgo" disabled={!rp} onClick={() => toast(daw().gotoTime(row.chapterId, row.sec).message)} />
            </div>
            <div className="decide">
              {DECISIONS.map(([k, l]) => (
                <button key={k} type="button" className="btn sm" data-cd={k} aria-pressed={row.res === k} style={{ height: 32, justifyContent: 'center' }} onClick={() => decideCompanionNote(row, k)}>{l}</button>
              ))}
            </div>
          </>
        ) : <div className="sub">No notes for this chapter</div>}
      </div>
      <div className="cmpb stack">
        <span className="label">Pickups in this chapter · {picks.length}</span>
        {picks.map((x) => (
          <div className="optrow" key={x.id}>
            <span className="mono" style={{ color: 'var(--muted)' }}>{x.t}</span>
            <span style={{ flex: 1, marginLeft: 10 }}>{stripTags(x.script).slice(0, 40)}</span>
            <IconButton icon="record" className="rec" tip="Record this line" tipSide="r" data-crec={x.id} onClick={() => toast('Recording this line')} />
          </div>
        ))}
        {picks.length ? null : <div className="sub">None open.</div>}
      </div>
      <div className="cmpb stack">
        <span className="label">This chapter</span>
        <div className="optrow"><span>Recorded</span><b className="mono">{mmss(recSec)}</b></div>
        <div className="optrow"><span>Proof</span><b className="mono">{noteProgress(data, notes).cleared} of {notes.length}</b></div>
        <div className="optrow"><span>Mastered</span><b>{mastered ? v?.qc : 'Not yet'}</b></div>
      </div>
    </div>
  )
}
