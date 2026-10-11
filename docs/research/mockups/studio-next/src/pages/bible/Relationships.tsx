import { REL_SUGGESTIONS } from '@/fixtures/relations'
import { entryById } from '@/selectors/bible'
import { addRelationship, patchRelationship, removeRelationship } from '@/state/commands/bible'
import { useData } from '@/state/store'
import { popAt } from '@/ui/overlay'
import { Icon } from '@/ui/Icon'
import { IconButton, Input } from '@/ui/primitives'
import { EntryPicker } from './EntryPicker'

function PickBtn({ rid, side, id, label, editing }: { rid: number; side: 'a' | 'b'; id: string; label: string; editing: boolean }) {
  const data = useData()
  const name = entryById(data, id)?.name ?? ''
  if (!editing) return <span>{name}</span>
  return (
    <button type="button" className="btn pickbtn" data-keeppop aria-label={label + ': ' + name}
      onClick={(e) => popAt(e.currentTarget, ({ close }) => <EntryPicker cur={id} close={close} onPick={(v) => patchRelationship(rid, { [side]: v })} />, '')}>
      <span>{name}</span><span aria-hidden="true">▾</span>
    </button>
  )
}

/** Relationships of the entry being viewed: what it is to another entry. The viewed entry is already known, so each row is the relationship and the other entry. */
export function Relationships({ entryId, editing }: { entryId: string; editing: boolean }) {
  const data = useData()
  const rels = data.relationships.filter((r) => r.a === entryId || r.b === entryId)
  const me = entryById(data, entryId)?.name ?? ''
  return (
    <div className="stack" style={{ gap: 6 }}>
      <span className="label">Relationships</span>
      <div className="tblwrap">
        <table>
          <thead><tr><th>Relationship</th><th>To</th>{editing ? <th style={{ width: 44 }} /> : null}</tr></thead>
          <tbody>
            {rels.map((r) => {
              /* Written from the other entry's side ("The gardeners serve Queen of Hearts"), so it is shown with an arrow and the whole sentence in the tooltip. */
              const incoming = r.b === entryId && r.a !== entryId
              const other = incoming ? r.a : r.b
              const otherName = entryById(data, other)?.name ?? ''
              return (
                <tr key={r.id}>
                  <td>
                    {editing
                      ? <Input type="text" list="rel-sugg" value={r.rel} placeholder="for example: hates" aria-label="Relationship" onChange={(e) => patchRelationship(r.id, { rel: e.target.value })} />
                      : <span data-tip={otherName + ' ' + r.rel + ' ' + me}>{incoming ? <Icon name="arrowLeft" /> : null}{r.rel || '—'}</span>}
                  </td>
                  <td><PickBtn rid={r.id} side={incoming ? 'a' : 'b'} id={other} label="To" editing={editing} /></td>
                  {editing ? <td><IconButton icon="trash" className="quiet danger" tip="Remove this relationship" tipSide="r" onClick={() => removeRelationship(r.id)} /></td> : null}
                </tr>
              )
            })}
            {editing ? <tr><td colSpan={3}><IconButton icon="plus" tip="Add a relationship" id="reladd" onClick={() => addRelationship(entryId)} /></td></tr> : rels.length ? null : <tr><td colSpan={2} className="sub">—</td></tr>}
          </tbody>
        </table>
      </div>
      <datalist id="rel-sugg">{REL_SUGGESTIONS.map((x) => <option key={x} value={x} />)}</datalist>
    </div>
  )
}
