import { useEffect, useRef } from 'react'
import { pidLabel } from '@/selectors/chapters'
import { snippet, type Match } from '@/selectors/search'
import { closeFind, pickFind, setFindQuery, stepFind, toggleFindList } from '@/state/commands/script'
import { useData, useUi } from '@/state/store'
import { IconButton, Input } from '@/ui/primitives'

export function FindBar({ matches }: { matches: Match[] }) {
  const data = useData()
  const { find, findNonce } = useUi().script
  const inp = useRef<HTMLInputElement>(null)
  const n = matches.length
  const short = find.q.trim().length < 2
  const count = short ? '' : n ? Math.min(find.i, n - 1) + 1 + ' of ' + n : 'No matches'
  useEffect(() => {
    if (!find.open) return
    inp.current?.focus()
    inp.current?.select()
  }, [find.open, findNonce])
  const show = find.list && n > 0
  const cur = useRef<HTMLButtonElement>(null)
  useEffect(() => { if (show) cur.current?.scrollIntoView?.({ block: 'nearest' }) }, [show, find.i])
  return (
    <div className="findbar" id="findbar" hidden={!find.open}>
      <div className="row" style={{ flexWrap: 'nowrap' }}>
        <Input
          ref={inp} id="findq" type="text" placeholder="Find in the manuscript" aria-label="Find in the manuscript" value={find.q}
          onFocus={() => { if (!find.list && n) toggleFindList() }}
          onChange={(e) => setFindQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); stepFind(e.shiftKey ? -1 : 1) }
            else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeFind() }
          }}
        />
        <span className="sub mono" id="findcount" style={{ whiteSpace: 'nowrap' }}>{count}</span>
        <IconButton icon="up" tip="Previous match (Shift+Enter)" id="findprev" onClick={() => stepFind(-1)} />
        <IconButton icon="down" tip="Next match (Enter)" id="findnext" onClick={() => stepFind(1)} />
        <IconButton icon="list" tip="Results" id="findlistbtn" onClick={toggleFindList} />
        <IconButton icon="x" tip="Close search (Esc)" id="findclose" tipSide="r" onClick={closeFind} />
      </div>
      <div id="findlist" className="findlist" hidden={!show}>
        {show ? (
          <>
            {matches.slice(0, 80).map((m, i) => {
              const sn = snippet(data, m.pid, m.s, m.e)
              return (
                <button
                  key={i} type="button" data-fi={i} aria-selected={i === find.i} ref={i === find.i ? cur : undefined}
                  onClick={() => { pickFind(i); document.getElementById('rdscroll')?.focus({ preventScroll: true }) }}
                >
                  <span className="pl">{pidLabel(data, m.pid)}</span>
                  <span>{sn.pre}<mark>{sn.hit}</mark>{sn.post}</span>
                </button>
              )
            })}
            {n > 80 ? <div className="sub" style={{ padding: '6px 10px' }}>{n - 80} more. Refine your search.</div> : null}
          </>
        ) : null}
      </div>
    </div>
  )
}
