import { useEffect, useMemo, useRef, useState } from 'react'
import type { BibleEntry } from '@/domain/schemas'
import { chName } from '@/selectors/chapters'
import { aliasNeedsReview, appearsIn, entryById, entryNeedsReview, needsReview, nameOwner, pronOfName, typeColour } from '@/selectors/bible'
import { reviewable, verifyOf } from '@/selectors/extraction'
import { speakerColourOf, SPEAKER_PALETTE } from '@/selectors/speakers'
import { addName, cancelEdit, deleteEntry, markAliasReviewed, markEntryReviewed, mergeEntries, patchEntry, removeName, renameEntry, saveEdit, setEntryColour, setSay, startEdit } from '@/state/commands/bible'
import { setPronSource } from '@/state/commands/pronunciation'
import { TYPE_COLOURS } from '@/state/commands/settings'
import { PronSourceTag } from '@/ui/PronSource'
import { openInScript } from '@/state/commands/nav'
import { openFind } from '@/state/commands/script'
import { useData, useUi } from '@/state/store'
import { toast } from '@/ui/overlay'
import { Btn, IconButton, Pill, Input, Textarea, Select, Swatch } from '@/ui/primitives'
import { Relationships } from './Relationships'
import { AcceptedClaims, SuggestionList } from './Suggested'

function NameBox({ entry, focusRef }: { entry: BibleEntry; focusRef: React.MutableRefObject<boolean> }) {
  const [v, setV] = useState(entry.name)
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => setV(entry.name), [entry.name, entry.id])
  useEffect(() => {
    if (focusRef.current) { focusRef.current = false; ref.current?.focus(); ref.current?.select() }
  }, [entry.id, focusRef])
  const commit = (): void => { if (!renameEntry(entry.id, v)) setV(entry.name) }
  return (
    <Input ref={ref} variant="bare" type="text" id="sbname" value={v} aria-label="Name" onChange={(e) => setV(e.target.value)} onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') commit() }}
      style={{ font: '600 26px var(--f-display)', flex: 1 }} />
  )
}

function Names({ entry, editing }: { entry: BibleEntry; editing: boolean }) {
  const data = useData()
  const [add, setAdd] = useState('')
  /* The name typed belongs to another entry: offer to merge that entry into this one instead of adding a second copy. */
  const [clash, setClash] = useState<{ name: string; owner: string } | null>(null)
  const submit = (): void => {
    const owner = nameOwner(data, entry.id, add)
    if (owner) { setClash({ name: add.trim(), owner: owner.id }); return }
    if (addName(entry.id, add)) { setAdd(''); setClash(null) }
  }
  const other = clash ? entryById(data, clash.owner) : undefined
  return (
    <div className="stack" style={{ gap: 8 }}>
      <span className="label">Names the app links in the text, and how I say each</span>
      {entry.aka.map((a, i) => {
        const p = pronOfName(entry, a)
        const review = aliasNeedsReview(entry, a)
        return (
          <div className="row" style={{ flexWrap: 'nowrap' }} key={a} data-name={a}>
            <span style={{ minWidth: 130, fontWeight: 500 }}>{a}</span>
            {review ? <Pill kind="warn" size="sm">Needs review</Pill> : null}
            {editing
              ? <Input type="text" data-say={i} value={p.say} placeholder="for example: kroh-KAY" aria-label={'How I say ' + a} style={{ flex: 1, minWidth: 90 }} onChange={(e) => setSay(entry.id, a, e.target.value)} />
              : <span className="mono" data-say-ro={i} style={{ flex: 1 }}>{p.say || '—'}</span>}
            {editing || p.say
              ? <PronSourceTag src={p.src} label={'Pronunciation source for ' + a} onPick={editing ? (id) => setPronSource({ kind: 'name', entryId: entry.id, name: a }, id) : undefined} />
              : null}
            {review ? <IconButton icon="doneOff" tip={'Mark ' + a + ' reviewed'} data-alias-reviewed={a} onClick={() => markAliasReviewed(entry.id, a)} /> : null}
            <IconButton icon="speaker" tip={'Hear a reference clip for ' + a} data-sbplay onClick={() => toast('Playing the reference clip')} />
            {editing ? <IconButton icon="record" className="rec" tip={'Record my own clip for ' + a} data-sbrec onClick={() => toast('Recording your own clip')} /> : null}
            {editing ? <IconButton icon="trash" className="quiet danger" tip={'Remove ' + a} data-akax={i} disabled={entry.aka.length < 2} onClick={() => removeName(entry.id, i)} /> : null}
          </div>
        )
      })}
      {editing ? (
        <div className="row">
          <Input type="text" id="sbaka" placeholder="Add a name" aria-label="Add a name" style={{ width: 200 }} value={add} onChange={(e) => { setAdd(e.target.value); setClash(null) }}
            onKeyDown={(e) => { if (e.key === 'Enter') submit() }} />
          {clash && other ? (
            <>
              <span id="sbclash" role="status">“{clash.name}” is already a name of {other.name}.</span>
              <Btn id="sbmerge" onClick={() => { if (mergeEntries(entry.id, other.id)) { setAdd(''); setClash(null) } }}>Merge into this entry</Btn>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

function Text({ entry, field, id, label, editing }: { entry: BibleEntry; field: 'sum' | 'voice' | 'acts' | 'knows'; id: string; label: string; editing: boolean }) {
  return (
    <div className="stack" style={{ gap: 6 }}>
      <label className="label" htmlFor={id}>{label}</label>
      {editing
        ? <Textarea id={id} data-sbf={field} value={entry[field] ?? ''} onChange={(e) => patchEntry(entry.id, { [field]: e.target.value })} />
        : <div id={id} data-sbf-ro={field} style={{ whiteSpace: 'pre-wrap', color: entry[field] ? 'var(--ink)' : 'var(--faint)' }}>{entry[field] || '—'}</div>}
    </div>
  )
}

function Appears({ entry }: { entry: BibleEntry }) {
  const data = useData()
  const chapters = useMemo(() => appearsIn(data, entry), [data, entry])
  return (
    <div className="stack" style={{ gap: 6 }}>
      <span className="label">Appears in · {chapters.length} {chapters.length === 1 ? 'chapter' : 'chapters'}</span>
      {chapters.length ? (
        <div className="tblwrap">
          <table>
            <tbody>
              {chapters.map((c) => (
                <tr key={c.id} data-sbl={c.id}>
                  <td>{chName(data, c)}</td>
                  <td style={{ width: 44, textAlign: 'right' }}><IconButton icon="arrowRight" tip="Go to chapter" data-sbgo={c.id} onClick={() => openInScript(c.id)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <div className="sub">Not mentioned in a chapter with text yet.</div>}
    </div>
  )
}

/** The colour of this speaker's chips: assigned from the palette until the narrator picks one. */
function SpeakerColour({ entry }: { entry: BibleEntry }) {
  const auto = speakerColourOf({ id: entry.id })
  const labelOf = (c: string): string => TYPE_COLOURS.find(([k]) => k === c)?.[1] ?? c
  return (
    <div className="row">
      <label className="label" htmlFor="sbcolour">Speaker colour</label>
      <Swatch colour={speakerColourOf(entry)} />
      <Select id="sbcolour" aria-label="Speaker colour" style={{ width: 'auto', minWidth: 160 }} value={entry.colour ?? 'auto'}
        onValueChange={(v) => setEntryColour(entry.id, v === 'auto' ? null : SPEAKER_PALETTE.find((c) => c === v) ?? null)}
        options={[{ value: 'auto', label: 'Automatic (' + labelOf(auto) + ')' }, ...SPEAKER_PALETTE.map((c) => ({ value: c, label: labelOf(c) }))]} />
    </div>
  )
}

/** An entry opens read-only. Edit makes every field editable; Save keeps the changes, Cancel puts everything back. */
export function EntryEditor({ entry, focusRef }: { entry: BibleEntry; focusRef: React.MutableRefObject<boolean> }) {
  const data = useData()
  const ui = useUi()
  const editing = ui.bible.editing?.id === entry.id
  const isChar = entry.kind === 'Character'
  const speaks = !!data.bibleTypes.find((t) => t.k === entry.kind)?.speaker
  return (
    <>
      <div className="ph">
        {editing ? <NameBox entry={entry} focusRef={focusRef} /> : <h2 id="sbname-ro" style={{ flex: 1, minWidth: 0, fontSize: 26 }}>{entry.name}</h2>}
        {editing
          ? <Select id="sbkind" aria-label="Type" style={{ width: 'auto', minWidth: 120 }} value={entry.kind} onValueChange={(v) => patchEntry(entry.id, { kind: v })} options={data.bibleTypes.map((t) => ({ value: t.k, label: t.k }))} />
          : <Pill kind="neutral" style={{ background: 'var(--' + (typeColour(data, entry.kind) === 'copper' ? 'copper' : typeColour(data, entry.kind) + '-soft') + ')', color: 'var(--' + typeColour(data, entry.kind) + ')' }}>{entry.kind}</Pill>}
        {entryNeedsReview(data, entry) ? <Pill kind="warn" size="sm">Needs review</Pill> : null}
        {needsReview(entry) ? <Btn id="sbreviewed" disabled={verifyOf(data, entry.id) > 0} title={verifyOf(data, entry.id) > 0 ? 'Verify its suggestions first' : undefined} onClick={() => markEntryReviewed(entry.id)}>Mark reviewed</Btn> : null}
        <IconButton icon="search" tip="Find in the manuscript" id="sbfind" onClick={() => openFind(entry.name)} />
        {editing ? (
          <>
            <IconButton icon="trash" className="danger" tip="Delete this entry" id="sbdel" style={{ marginLeft: 16 }} onClick={() => deleteEntry(entry.id)} />
            <Btn id="sbcancel" onClick={cancelEdit}>Cancel</Btn>
            <Btn className="primary" id="sbsave" onClick={saveEdit}>Save</Btn>
          </>
        ) : <IconButton icon="pencil" tip="Edit" id="sbedit" onClick={() => startEdit(entry.id)} />}
      </div>
      <div className="pb stack">
        <Names key={entry.id + (editing ? "-edit" : "")} entry={entry} editing={editing} />
        {editing && speaks ? <SpeakerColour entry={entry} /> : null}
        <Text entry={entry} field="sum" id="sbsum" label="Description" editing={editing} />
        {isChar ? (
          <>
            <Text entry={entry} field="voice" id="sbvoice" label="How they talk" editing={editing} />
            <Text entry={entry} field="acts" id="sbacts" label="How they act" editing={editing} />
            <Text entry={entry} field="knows" id="sbknows" label="What they know" editing={editing} />
          </>
        ) : null}
        <AcceptedClaims entryId={entry.id} />
        <SuggestionList title="Suggested" list={reviewable(data, entry.id)} />
        <Relationships entryId={entry.id} editing={editing} />
        <Appears entry={entry} />
      </div>
    </>
  )
}
