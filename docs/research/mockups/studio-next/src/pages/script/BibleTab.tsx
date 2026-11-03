import type { CSSProperties } from 'react'
import { entriesInChapter, entryById, firstLabel, sayOf, softOf, typeColour } from '@/selectors/bible'
import { go } from '@/state/commands/nav'
import { openFind, sbMark } from '@/state/commands/script'
import { update, useData, useUi } from '@/state/store'
import { popAt, closePop, toast } from '@/ui/overlay'
import { IconButton } from '@/ui/primitives'
import { DictBlock, ExtLinks } from './Dict'

function KindPill({ kind }: { kind: string }) {
  const c = useData().bibleTypes.find((t) => t.k === kind)?.c ?? 'faint'
  return <span className="pill" style={{ background: 'var(--' + softOf(c) + ')', color: 'var(--' + c + ')' }}>{kind}</span>
}

const CHARACTER_FIELDS: Array<['voice' | 'acts' | 'knows', string]> = [['voice', 'How they talk'], ['acts', 'How they act'], ['knows', 'What they know']]

export function BibleTab({ chId }: { chId: string }) {
  const data = useData()
  const s = useUi().script
  const entry = entryById(data, s.entryId)
  const list = entriesInChapter(data, chId)
  const setField = (f: 'sum' | 'voice' | 'acts' | 'knows', v: string): void => {
    update((d) => { const e = d.data.bible.find((x) => x.id === entry?.id); if (e) e[f] = v })
  }
  let card = null
  if (entry) {
    card = (
      <div className="wordcard">
        <div className="row">
          <h3>{entry.name}</h3><KindPill kind={entry.kind} /><span className="pill neutral">first: {firstLabel(data, entry)}</span><span className="spacer" />
          <IconButton icon="search" tip="Find in the manuscript" onClick={() => openFind(entry.name)} />
          <IconButton icon="comment" tip="Add a note" onClick={() => toast('Select text in the reader, then choose Mark.')} />
          <IconButton
            icon="book" tip="Open in Story Bible to edit" tipSide="r"
            onClick={() => { update((d) => { d.ui.bible.sel = entry.id; d.ui.bible.kind = 'All'; d.ui.bible.q = '' }); go('bible') }}
          />
        </div>
        <div className="stack" style={{ gap: 4 }}>
          <span className="label">Description</span>
          <div aria-label="Description" style={{ whiteSpace: 'pre-wrap', color: entry.sum ? 'var(--ink)' : 'var(--faint)' }}>{entry.sum || '—'}</div>
        </div>
        {entry.kind === 'Character'
          ? CHARACTER_FIELDS.map(([k, l]) => (
            <div className="stack" style={{ gap: 4 }} key={k}>
              <span className="label">{l}</span>
              <div aria-label={l} style={{ whiteSpace: 'pre-wrap', color: entry[k] ? 'var(--ink)' : 'var(--faint)' }}>{entry[k] || '—'}</div>
            </div>
          ))
          : null}
        <div className="stack" style={{ gap: 4 }}>
          <span className="label">Names and how I say them</span>
          {entry.aka.map((a) => <div className="optrow" key={a}><span>{a}</span><span className="mono">{sayOf(entry, a) || '—'}</span></div>)}
        </div>
      </div>
    )
  } else if (s.miss) {
    card = (
      <div className="wordcard">
        <h3>“{s.miss}”</h3>
        <div>No Story Bible entry for this.</div>
        <DictBlock w={s.miss} />
        <div className="row">
          <IconButton
            icon="plus" tip="Create an entry" data-act="create"
            onClick={(e) => {
              const g = s.missSel
              if (!g) { toast('Select the text in the reader first.'); return }
              popAt(e.currentTarget, () => (
                <div className="stack" style={{ gap: 2 }}>
                  <div className="label" style={{ padding: '4px 10px' }}>Add to the Story Bible as</div>
                  {data.bibleTypes.map((t) => (
                    <button key={t.k} type="button" className="item" data-sb={t.k} onClick={() => { closePop(); sbMark(t.k, g) }}>
                      <span className="swatch" style={{ ['--mc' as string]: 'var(--' + typeColour(data, t.k) + ')' } as CSSProperties} />{t.k}
                    </button>
                  ))}
                </div>
              ))
            }}
          />
        </div>
        <div className="label">Look up</div>
        <ExtLinks w={s.miss} />
      </div>
    )
  }
  const pick = (id: string): void => update((d) => { d.ui.script.entryId = id; d.ui.script.miss = null })
  return (
    <>
      {card}
      <div className="label">In this chapter</div>
      {list.length ? (
        <div className="tblwrap">
          <table>
            <tbody>
              {list.map((e) => (
                <tr key={e.id} tabIndex={0} data-e={e.id} aria-selected={s.entryId === e.id} onClick={() => pick(e.id)} onKeyDown={(k) => { if (k.key === 'Enter') pick(e.id) }}>
                  <td><b>{e.name}</b></td>
                  <td className="sub">{e.kind} · first {firstLabel(data, e)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <div className="sub">No Story Bible entries in this chapter.</div>}
    </>
  )
}
