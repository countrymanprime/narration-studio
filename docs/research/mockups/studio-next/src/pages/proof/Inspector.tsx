import { useEffect, useMemo, useRef } from 'react'
import type { FindingType, ProofNote } from '@/domain/schemas'
import { DEAD_AIR_LIMIT } from '@/config/estimates'
import type { ProofUi } from '@/state/slices/ui'
import { FINDING_TYPES, RES_LABEL, evidenceChange, threadOf } from '@/selectors/proof'
import {
  acceptEvidence, addMarkerFor, addMessage, cleanDeadAir, decideNote, deleteMessage, editMessage, markSeen, moveNote, reopenNote, saveMessage, setDecisionNote,
  setNoteType, setWho, togglePlay,
} from '@/state/commands/proof'
import { openInBooth, openInEditing, openInScript } from '@/state/commands/nav'
import { heardMarkup, spotOf, type Spot } from '@/selectors/proofTakes'
import { playTakeRaw } from '@/state/commands/proofTakes'
import { Icon } from '@/ui/Icon'
import { gateOf } from '@/selectors/daw'
import { useData, useMock, useStudio } from '@/state/store'
import { Markup } from '@/ui/Markup'
import { Btn, IconButton, Pill, Textarea, Select } from '@/ui/primitives'
import { toast } from '@/ui/overlay'
import { daw } from '@/state/daw'

const DECISIONS: Array<[Exclude<ProofNote['res'], null | 'keep' | 'fixed'>, string]> = [['pickup', 'P'], ['edit', 'E'], ['waive', 'W'], ['defer', 'D']]

/** The selected finding: what the script says against what was heard, the decision and the thread of notes. */
export function Inspector({ row, ui, order }: { row: ProofNote; ui: ProofUi; order: ProofNote[] }) {
  const mock = useMock()
  const goto = gateOf(mock, 'goto')
  const marker = gateOf(mock, 'markers')
  const data = useData()
  const th = threadOf(row)
  const at = order.findIndex((x) => x.id === row.id)
  const reply = useRef<HTMLTextAreaElement>(null)
  const edit = useRef<HTMLTextAreaElement>(null)
  useEffect(() => { if (ui.edit != null) edit.current?.focus() }, [ui.edit])
  useEffect(() => { markSeen(row.id) }, [row.id])
  const change = evidenceChange(row, ui.seen[row.id])
  const spot = useMemo(() => spotOf(data, row), [data, row])
  return (
    <aside className="panel insp">
      <div className="ph">
        <h2 className="mono">{row.t}</h2>
        <Select id="ptype" aria-label="Type of finding" style={{ width: 'auto', minWidth: 120 }} value={row.ty} onValueChange={(v) => setNoteType(row.id, v as FindingType)}
          options={FINDING_TYPES.map((k) => ({ value: k, label: k }))} />
        <span className="spacer" />
        <IconButton icon="up" tip="Previous note" id="prevn" disabled={at <= 0} onClick={() => moveNote(-1)} />
        <IconButton icon="down" tip="Next note" id="nextn" tipSide="r" disabled={at >= order.length - 1} onClick={() => moveNote(1)} />
      </div>
      <div className="pb stack">
        {change ? (
          <div className="banner" role="alert" id="evchanged" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
            <div className="stack" style={{ minWidth: 0, gap: 6 }}>
              <b>The evidence changed</b>
              <span className="label">Before</span>
              <div className="quote diff" data-was><Markup text={change.was} /></div>
              <span className="label">Now</span>
              <div className="quote diff" data-now><Markup text={change.now} /></div>
            </div>
            <div className="row"><Btn id="evaccept" onClick={() => acceptEvidence(row.id)}>Use the new evidence</Btn></div>
          </div>
        ) : null}
        {row.ty === 'takes' ? (spot ? (<><span className="label">Script</span><div className="quote">{spot.script}</div></>) : null) : (
          <>
            <span className="label">Script</span>
            <div className="quote"><Markup text={row.script} /></div>
            <span className="label">Heard</span>
            <div className="quote diff"><Markup text={row.heard} /></div>
          </>
        )}
        {spot ? <SpotTakes spot={spot} row={row} /> : null}
        {row.ty === 'pacing' && !row.res ? (
          <div className="row"><IconButton icon="scissors" tip={'Trim the gap to ' + DEAD_AIR_LIMIT + ' s'} id="trim" onClick={() => cleanDeadAir([row.id])} /><span className="sub">Cleanup</span></div>
        ) : null}
        <div className="row">
          <IconButton icon={ui.play != null ? 'stop' : 'play'} tip={ui.play != null ? 'Stop' : 'Play ±3 s (Space)'} id="play" onClick={togglePlay} />
          <IconButton icon="external" tip={'Show in ' + goto.label} id="reaper" disabled={!goto.ok} onClick={() => toast(daw().gotoTime(row.chapterId, row.sec).message)} />
          <IconButton icon="flag" tip={'Add marker in ' + marker.label} id="marker" disabled={!marker.ok} onClick={() => addMarkerFor(row.id)} />
          <IconButton icon="script" tip="Open this chapter in Script" id="toscript" onClick={() => openInScript(row.chapterId)} />
          <IconButton icon="mic" tip="Open this chapter in Booth" id="tobooth" onClick={() => openInBooth(row.chapterId)} />
          <span className="spacer" />
          {row.res ? <Btn id="reopen" onClick={() => reopenNote(row.id)}>Reopen</Btn> : null}
        </div>
        {goto.ok ? null : <div className="sub">{goto.reason}</div>}
        <span className="label">Decision</span>
        <div className="decide" role="group" aria-label="Resolution">
          {DECISIONS.map(([k, key]) => (
            <button key={k} type="button" className="btn" data-d={k} aria-pressed={row.res === k} onClick={() => decideNote(row.id, k)}>{RES_LABEL[k]}<kbd>{key}</kbd></button>
          ))}
        </div>
        <Textarea id="pdnote" aria-label="Note with the decision" maxLength={2000} placeholder="Note with the decision (optional)" style={{ minHeight: 56 }}
          value={ui.dnote[row.id] ?? ''} onChange={(e) => setDecisionNote(row.id, e.target.value)} />
        <div className="sub" id="pconf" title={row.conf == null ? row.confReason : undefined}>
          {row.conf != null ? 'Confidence ' + row.conf.toFixed(2) : 'No confidence: ' + (row.confReason ?? 'the check gave none.')}
        </div>
        <span className="label">Notes on this finding</span>
        <div className="thread">
          {th.length ? th.map((x, i) => ui.edit === i ? (
            <div key={i} className="stack" style={{ gap: 6 }}>
              <Textarea id="pedtxt" ref={edit} aria-label="Edit note" style={{ minHeight: 56 }} defaultValue={x.text} />
              <div className="row">
                <Btn id="pedcancel" onClick={() => editMessage(null)}>Cancel</Btn>
                <Btn className="primary" id="pedsave" onClick={() => saveMessage(row.id, edit.current?.value ?? '')}>Save</Btn>
              </div>
            </div>
          ) : (
            <div key={i} className={'msg ' + (x.who === 'proofer' ? 'author' : '')}>
              <span className="who">{x.who === 'proofer' ? 'Proofer' : 'You'}</span>
              <span>{x.text}</span>
              <span className="when">{x.at}
                <span className="mtools">
                  <IconButton icon="pencil" tip="Edit this note" data-medit={i} onClick={() => editMessage(i)} />
                  <IconButton icon="trash" className="quiet danger" tip="Delete note" data-mdel={i} tipSide="r" onClick={() => deleteMessage(row.id, i)} />
                </span>
              </span>
            </div>
          )) : <div className="sub">No notes yet.</div>}
        </div>
        <div className="stack" style={{ gap: 6 }}>
          <div className="seg" role="group" aria-label="Who wrote this">
            <button type="button" data-pwho="proofer" aria-pressed={ui.who === 'proofer'} onClick={() => setWho('proofer')}>Proofer replied</button>
            <button type="button" data-pwho="you" aria-pressed={ui.who === 'you'} onClick={() => setWho('you')}>My note</button>
          </div>
          <div className="row" style={{ flexWrap: 'nowrap', alignItems: 'flex-start' }}>
            <Textarea id="preply" ref={reply} aria-label="Add a note" placeholder="Add a note or paste the proofer's reply" style={{ minHeight: 56 }} />
            <Btn id="paddreply" onClick={() => { if (addMessage(row.id, reply.current?.value ?? '') && reply.current) reply.current.value = '' }}>Add note</Btn>
          </div>
        </div>
      </div>
    </aside>
  )
}

/** The takes at this note's spot: each can be played raw, the kept one shows the script against what was heard. Proof only plays and links; choosing is Editing's. */
function SpotTakes({ spot, row }: { spot: Spot; row: ProofNote }) {
  const playing = useStudio((s) => s.ui.proof.takePlay)
  return (
    <>
      <div className="row" style={{ flexWrap: 'nowrap' }}>
        <span className="label">Takes at this spot · {spot.takes.length}</span>
        <span className="spacer" />
        <IconButton icon="scissors" tip="Manage takes in Editing" id="toediting" tipSide="r" onClick={() => openInEditing(row.chapterId, spot.passageId)} />
      </div>
      <div className="tkl" data-spot={spot.passageId}>
        {spot.takes.map((t) => (
          <div key={t.id} className={'tk' + (t.kept ? ' kept' : '')} data-take={t.id}>
            <IconButton icon={playing === t.id ? 'stop' : 'play'} tip={(playing === t.id ? 'Stop ' : 'Play ') + t.label + ' (raw audio)'} data-tplay={t.id} onClick={() => playTakeRaw(t.id)} />
            <div className="stack" style={{ gap: 2, minWidth: 0 }}>
              <div className="row" style={{ gap: 6 }}>
                <b className="tkn">{t.label}</b><span className="sub mono">{Math.round(t.len)} s</span>
                {t.kept ? <Pill kind="ok" size="sm"><Icon name="check" /> Kept</Pill> : t.active ? <Pill kind="neutral" size="sm">Active</Pill> : null}
              </div>
              <div className="tkt">{t.kept ? <Markup text={heardMarkup(spot.script, t.text)} /> : t.text}</div>
            </div>
          </div>
        ))}
      </div>
    </>
  )
}
