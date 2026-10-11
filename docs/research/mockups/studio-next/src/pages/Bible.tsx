import { useMemo, useRef, type KeyboardEvent } from 'react'
import { registerContext } from '@/app/registry'
import { tailItems } from '@/app/context'
import { chapterCounts, entryById, entryNeedsReview, findEntries, reviewCount, sortEntries, typeColour } from '@/selectors/bible'
import { kindLabel, summaryOf, unattached, verifyCount, verifyOf } from '@/selectors/extraction'
import { pct } from '@/format/evidence'
import { selectSuggestion, setVerifyOnly } from '@/state/commands/extraction'
import { deleteEntry, markEntryReviewed, newEntry, selectEntry, setBibleKind, setBibleReviewOnly, setBibleSearch, setBibleSort } from '@/state/commands/bible'
import { openFind } from '@/state/commands/script'
import { getState, useData, useMock, useStudio } from '@/state/store'
import { I, L } from '@/ui/overlay'
import { NeedManuscript } from '@/ui/NeedManuscript'
import { IconButton, Swatch, Input, Select } from '@/ui/primitives'
import { EntryEditor } from './bible/EntryEditor'
import { openImportDialog } from './bible/ImportDialog'
import { startScan } from './bible/startScan'
import { SuggestionList } from './bible/Suggested'

registerContext((t) => {
  const row = t.closest('[data-sbe]')
  if (!row || getState().ui.page !== 'bible') return null
  const id = (row as HTMLElement).dataset.sbe!
  const e = entryById(getState().data, id)
  if (!e) return null
  return [L(e.name), I('Open', () => selectEntry(id)), I('Find in the manuscript', () => openFind(e.name)), ...(e.review ? [I('Mark reviewed', () => markEntryReviewed(id))] : []), I('Delete entry', () => deleteEntry(id)), ...tailItems()]
})


export default function BiblePage() {
  const mock = useMock()
  const data = useData()
  const ui = useStudio((s) => s.ui.bible)
  const focusName = useRef(false)
  const kinds = useMemo(() => data.bibleTypes.map((t) => t.k), [data.bibleTypes])
  const kind = ui.kind === 'All' || kinds.includes(ui.kind) ? ui.kind : 'All'
  /* How many chapters each entry appears in depends on the names and the text only, not on the rest of the book data. */
  const counts = useMemo(() => chapterCounts(data), [data.bible, data.chapters, data.paragraphs]) // eslint-disable-line react-hooks/exhaustive-deps
  const toReview = useMemo(() => reviewCount(data), [data.bible, data.suggestions]) // eslint-disable-line react-hooks/exhaustive-deps
  const toVerify = useMemo(() => verifyCount(data), [data.suggestions]) // eslint-disable-line react-hooks/exhaustive-deps
  const loose = useMemo(() => (ui.verifyOnly ? unattached(data) : []), [data.suggestions, ui.verifyOnly]) // eslint-disable-line react-hooks/exhaustive-deps
  const list = useMemo(
    () => sortEntries(data, findEntries(data, ui.q, kind).filter((e) => (!ui.reviewOnly || entryNeedsReview(data, e)) && (!ui.verifyOnly || verifyOf(data, e.id) > 0)), ui.sort, counts),
    [data, ui.q, kind, ui.sort, ui.reviewOnly, ui.verifyOnly, counts],
  )
  const looseSel = loose.find((x) => x.id === ui.selSug)
  const sel = entryById(data, ui.sel) ?? list[0] ?? data.bible[0]
  const listRef = useRef<HTMLUListElement>(null)
  if (!mock.hasManuscript) return <NeedManuscript title="Story Bible" />

  const onKey = (e: KeyboardEvent): void => {
    const bs = [...(listRef.current?.querySelectorAll<HTMLButtonElement>('[data-sbe]') ?? [])]
    const i = bs.indexOf(document.activeElement as HTMLButtonElement)
    if (i < 0) return
    let n: number | null = null
    if (e.key === 'ArrowDown') n = Math.min(bs.length - 1, i + 1)
    else if (e.key === 'ArrowUp') n = Math.max(0, i - 1)
    if (n == null) return
    e.preventDefault()
    bs.forEach((x) => { x.tabIndex = -1 })
    bs[n].tabIndex = 0
    bs[n].focus()
  }
  const add = (): void => { focusName.current = true; newEntry() }

  return (
    <div className="page fill" style={{ gridTemplateColumns: '320px minmax(0,1fr)', height: '100%' }} id="sbpg">
      <section className="panel">
        <div className="ph"><h1>Story Bible</h1><span className="spacer" />
          <IconButton icon="auto" tip="Scan the manuscript for suggestions" id="sbscan" onClick={startScan} />
          <IconButton icon="import" tip="Import entries (CSV or JSON)" id="sbimport" aria-haspopup="dialog" onClick={openImportDialog} />
          <IconButton icon="plus" tip="New entry" tipSide="r" id="sbnew" onClick={add} /></div>
        <div style={{ padding: '10px 16px', display: 'flex', flexDirection: 'column', gap: 8, borderBottom: '1px solid var(--line)' }}>
          <div className="row" style={{ flexWrap: 'nowrap', gap: 8 }}>
            <Input type="text" id="sbq" placeholder="Find an entry" aria-label="Find an entry" value={ui.q} onChange={(e) => setBibleSearch(e.target.value)} style={{ flex: 1, minWidth: 0 }} />
            <Select id="sbsort" aria-label="Sort entries" size="sm" style={{ width: 'auto', minWidth: 118, flex: 'none' }} value={ui.sort} onValueChange={(v) => setBibleSort(v === 'type' || v === 'chapters' ? v : 'name')}
              options={[{ value: 'name', label: 'By name' }, { value: 'type', label: 'By type' }, { value: 'chapters', label: 'By chapters' }]} />
          </div>
          <div className="filters" role="group" aria-label="Kind">
            {['All', ...kinds].map((k) => (
              <button key={k} type="button" className="chip" data-sbk={k} aria-pressed={kind === k} onClick={() => setBibleKind(k)}>
                {k === 'All' ? null : <Swatch colour={typeColour(data, k)} />}{k}
              </button>
            ))}
            {toReview || ui.reviewOnly ? (
              <button type="button" className="chip" id="sbreview" aria-pressed={ui.reviewOnly} onClick={() => setBibleReviewOnly(!ui.reviewOnly)}>Needs review · {toReview}</button>
            ) : null}
            {toVerify || ui.verifyOnly ? (
              <button type="button" className="chip" id="sbverify" aria-pressed={ui.verifyOnly} onClick={() => setVerifyOnly(!ui.verifyOnly)}>Needs verification · {toVerify}</button>
            ) : null}
          </div>
        </div>
        <ul className="chlist" id="sblist" aria-label="Entries" ref={listRef} onKeyDown={onKey}>
          {loose.map((x) => (
            <li key={x.id}>
              <button type="button" data-sbs={x.id} aria-current={looseSel?.id === x.id} onClick={() => selectSuggestion(x.id)}>
                <span style={{ flex: 1, minWidth: 0 }}><b style={{ display: 'flex', gap: 8, alignItems: 'center' }}><span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{summaryOf(x.payload)}</span><span className="pill warn sm" style={{ marginLeft: 'auto' }}>{x.confidence == null ? 'No score' : pct(x.confidence) + '%'}</span></b><span className="sub">{kindLabel(x.payload)} · not in the Story Bible yet</span></span>
              </button>
            </li>
          ))}
          {list.map((x) => {
            const t = counts.get(x.id) ?? 0
            const nv = verifyOf(data, x.id)
            const names = x.aka.length
            return (
              <li key={x.id}>
                <button type="button" data-sbe={x.id} tabIndex={x.id === sel?.id ? 0 : -1} aria-current={x.id === sel?.id}
                  onClick={(e) => { selectEntry(x.id); e.currentTarget.focus() }}>
                  <span style={{ flex: 1, minWidth: 0 }}><b style={{ display: 'flex', gap: 8, alignItems: 'center' }}>{x.name}{entryNeedsReview(data, x) ? <span className="pill warn sm" data-sbreview-pill style={{ marginLeft: 'auto' }}>{nv ? 'Verify · ' + nv : 'Review'}</span> : null}</b><span className="sub"><Swatch colour={typeColour(data, x.kind)} /> {x.kind} · {names} {names === 1 ? 'name' : 'names'} · {t} {t === 1 ? 'chapter' : 'chapters'}</span></span>
                </button>
              </li>
            )
          })}
          {list.length || loose.length ? null : <li className="sub" style={{ padding: 12 }}>No entries match.</li>}
        </ul>
      </section>
      <section className="panel" style={{ overflow: 'auto' }}>
        {looseSel ? (
          <>
            <div className="ph"><h2 style={{ flex: 1, minWidth: 0, fontSize: 26 }}>{summaryOf(looseSel.payload)}</h2></div>
            <div className="pb stack"><SuggestionList title="Suggested" list={[looseSel]} /></div>
          </>
        ) : sel ? <EntryEditor entry={sel} focusRef={focusName} /> : <div className="empty"><span>No entry selected.</span></div>}
      </section>
    </div>
  )
}
