import { useState } from 'react'
import '@/styles/extraction.css'
import { VERIFY_BELOW, sourceIcon, sourceLabel } from '@/config/extraction'
import type { ExtractionSuggestion } from '@/domain/extraction'
import { pct } from '@/format/evidence'
import { pidLabel } from '@/selectors/chapters'
import { claimsOf, CLAIM_LABEL, confidenceWhy, editableText, kindLabel, propertiesOf, summaryOf, withText } from '@/selectors/extraction'
import { acceptSuggestionCmd, openEvidence, rejectSuggestionCmd, reviewSuggestionCmd } from '@/state/commands/extraction'
import { useData } from '@/state/store'
import { Icon, iconNamed } from '@/ui/Icon'
import { IconButton, Input, Pill } from '@/ui/primitives'

/** The confidence as a percent. The tooltip says why it is accepted or has to be checked; a missing confidence says so and is never filled in. */
export function ConfidenceChip({ s }: { s: ExtractionSuggestion }) {
  const data = useData()
  const low = s.status === 'needs-verification'
  return (
    <span className={'pill confchip sm ' + (low ? 'warn' : 'ok')} tabIndex={0} data-conf={s.id} data-tip={confidenceWhy(data, s)} aria-label={(s.confidence == null ? 'No confidence' : pct(s.confidence) + '%') + '. ' + confidenceWhy(data, s)}>
      {s.confidence == null ? 'No score' : pct(s.confidence) + '%'}
    </span>
  )
}

function Quotes({ s }: { s: ExtractionSuggestion }) {
  const data = useData()
  return (
    <>
      {s.evidence.map((ev) => (
        <button type="button" className="xquote" key={ev.paragraphId + ':' + ev.start} data-evidence={ev.paragraphId} data-tip={'Go to the line in the Script · ' + pidLabel(data, ev.paragraphId)} onClick={() => openEvidence(ev)}>
          “{ev.text}”
        </button>
      ))}
      {!s.evidence.length && s.unverifiedQuote ? <span className="sub" data-noquote>Quote not found in the text: “{s.unverifiedQuote}”</span> : null}
    </>
  )
}

/** Where a suggestion came from: its icon and name. */
function SourceMark({ id }: { id: string }) {
  return <span data-source={id} style={{ whiteSpace: 'nowrap' }}><Icon name={iconNamed(sourceIcon(id))} /> {sourceLabel(id)}</span>
}

/** One suggestion: what it says, how sure the source was, the quote it rests on, and Accept / Edit / Reject. */
export function SuggestionRow({ s }: { s: ExtractionSuggestion }) {
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState('')
  const verify = s.status === 'needs-verification'
  const save = (): void => {
    if (text.trim() && acceptSuggestionCmd(s.id, withText(s.payload, text)).ok) setEditing(false)
  }
  return (
    <li className="xsug" data-sug={s.id} data-status={s.status}>
      <div className="sugtop">
        <span className="label sugkind">{kindLabel(s.payload)}</span>
        {editing
          ? <Input type="text" size="sm" aria-label={'Edit ' + kindLabel(s.payload).toLowerCase()} className="sugtext" value={text} autoFocus onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false) }} />
          : <span className="sugtext">{summaryOf(s.payload)}</span>}
        <ConfidenceChip s={s} />
        <span className="sugtools">
          {editing ? (
            <>
              <IconButton icon="check" tip="Save and accept" data-sug-save onClick={save} />
              <IconButton icon="x" tip="Cancel the edit" onClick={() => setEditing(false)} />
            </>
          ) : (
            <>
              {verify
                ? <IconButton icon="check" tip="Accept this suggestion" data-sug-accept onClick={() => acceptSuggestionCmd(s.id)} />
                : <IconButton icon="doneOff" tip="Mark this suggestion reviewed" data-sug-reviewed onClick={() => reviewSuggestionCmd(s.id)} />}
              <IconButton icon="pencil" tip="Edit this suggestion" data-sug-edit onClick={() => { setText(editableText(s.payload)); setEditing(true) }} />
              <IconButton icon="x" tip="Reject this suggestion" className="danger" data-sug-reject onClick={() => rejectSuggestionCmd(s.id)} />
            </>
          )}
        </span>
      </div>
      <Quotes s={s} />
      {s.flag === 'duplicate' ? <span className="sub" data-sug-dup><Pill kind="warn" size="sm">Possible duplicate</Pill> {s.note}</span> : null}
      {verify
        ? <span className="sub" data-sug-reason>Needs verifying: {s.reason ?? 'under ' + pct(VERIFY_BELOW) + '%'} · <SourceMark id={s.source} /></span>
        : <span className="sub">Accepted automatically · <SourceMark id={s.source} /></span>}
    </li>
  )
}

/** A list of suggestions with a heading and a count. */
export function SuggestionList({ title, list }: { title: string; list: ExtractionSuggestion[] }) {
  if (!list.length) return null
  return (
    <div className="stack" style={{ gap: 6 }} data-suggested>
      <span className="label">{title} · {list.length}</span>
      <ul className="sugs">{list.map((s) => <SuggestionRow key={s.id} s={s} />)}</ul>
    </div>
  )
}

/** What was accepted about an entry, under clear labels (Says, Does, Knows, and its details), each with the quote it rests on. Read-only. */
export function AcceptedClaims({ entryId }: { entryId: string }) {
  const data = useData()
  const groups = [
    ...(['talk', 'act', 'know'] as const).map((k) => ({ label: CLAIM_LABEL[k], list: claimsOf(data, entryId, k), k })),
    { label: 'Details', list: propertiesOf(data, entryId), k: 'prop' },
  ].filter((g) => g.list.length)
  if (!groups.length) return null
  return (
    <div className="claims" data-claims>
      {groups.map((g) => (
        <div className="stack" style={{ gap: 6 }} key={g.k} data-claim-group={g.k}>
          <span className="label">{g.label}</span>
          {g.list.map((s) => (
            <div className="claim" key={s.id} data-claim={s.id}>
              <span>{s.payload.kind === 'property' ? s.payload.key + ': ' + s.payload.value : s.payload.kind === 'claim' ? s.payload.text : ''}{s.status === 'accepted-auto' ? <> <ConfidenceChip s={s} /></> : null}</span>
              <Quotes s={s} />
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}
