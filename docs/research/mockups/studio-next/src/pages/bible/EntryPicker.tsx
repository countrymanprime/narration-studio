import { useState } from 'react'
import { findEntries, typeColour } from '@/selectors/bible'
import { useData } from '@/state/store'
import { Swatch, Input } from '@/ui/primitives'

/** A search box over the Story Bible entries, because a book can have hundreds. */
export function EntryPicker({ cur, onPick, close }: { cur: string; onPick: (id: string) => void; close: () => void }) {
  const data = useData()
  const [q, setQ] = useState('')
  const matches = findEntries(data, q, 'All').slice(0, 50)
  return (
    <div className="stack" style={{ gap: 6, minWidth: 320 }}>
      <Input type="text" id="ep-q" placeholder="Search entries" aria-label="Search entries" autoComplete="off" autoFocus value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && matches[0]) { close(); onPick(matches[0].id) }
          else if (e.key === 'Escape') { e.stopPropagation(); close() }
        }} />
      <div id="ep-l" role="listbox" style={{ maxHeight: 260, overflow: 'auto' }}>
        {matches.map((e) => (
          <button key={e.id} type="button" className="item" role="option" aria-selected={e.id === cur} data-n={e.name} onClick={() => { close(); onPick(e.id) }}>
            <Swatch colour={typeColour(data, e.kind)} />
            <span style={{ flex: 1 }}>{e.name}</span>
            <span className="sub">{e.kind}</span>
          </button>
        ))}
        {matches.length ? null : <div className="sub" style={{ padding: 8 }}>No entries match.</div>}
      </div>
    </div>
  )
}
