import { useEffect, useRef, useState, type CSSProperties } from 'react'
import type { Annotation } from '@/domain/schemas'
import { annMessages, annsInChapter, isAsk, markOf } from '@/selectors/annotations'
import { pidLabel } from '@/selectors/chapters'
import {
  addToThread, copyText, deleteMessage, editMessage, removeAnnotation, resolveQuery, setEdit, setMarkType, setStatus, showInText,
} from '@/state/commands/script'
import { update, useData, useUi } from '@/state/store'
import { toast } from '@/ui/overlay'
import { Btn, IconButton, Textarea, Select } from '@/ui/primitives'

function EditBox({ a, i, initial }: { a: Annotation; i: number; initial: string }) {
  const [v, setV] = useState(initial)
  const ref = useRef<HTMLTextAreaElement>(null)
  useEffect(() => { ref.current?.focus() }, [])
  return (
    <div className="stack" style={{ gap: 6 }}>
      <Textarea ref={ref} id="amtxt" aria-label="Edit message" style={{ minHeight: 56 }} value={v} onChange={(e) => setV(e.target.value)} />
      <div className="row">
        <Btn data-amcancel onClick={() => setEdit(null)}>Cancel</Btn>
        <Btn className="primary" data-amsave={a.id + ':' + i} onClick={() => { editMessage(a.id, i, v.trim()); setEdit(null) }}>Save</Btn>
      </div>
    </div>
  )
}

/** A note and a query are the same thing: a thread on a passage. A query also tracks the author's reply and can be resolved. */
function AnnCard({ a }: { a: Annotation }) {
  const data = useData()
  const s = useUi().script
  const [reply, setReply] = useState('')
  const mt = markOf(data, a)
  const ask = !!mt.ask
  const res = a.status === 'resolved'
  const ms = annMessages(a)
  const who = s.whoSel[a.id]
  const active = s.sel === a.id
  const chooseWho = (w: 'author' | 'you'): void => update((d) => { d.ui.script.whoSel[a.id] = w })
  return (
    <div className={'wordcard' + (active ? ' a-active' : '')} data-card={a.id}>
      <div className="row" style={{ flexWrap: 'nowrap' }}>
        <span className="swatch" style={{ ['--mc' as string]: 'var(--' + mt.c + ')', width: 14, height: 14 } as CSSProperties} />
        <Select aria-label="Type" style={{ width: 'auto', flex: 1, minWidth: 0 }} value={a.mark ?? ''} onValueChange={(v) => setMarkType(a.id, v)}
          options={data.marks.map((x) => ({ value: x.k, label: x.name }))} />
        {ask ? <span className={'pill ' + (res ? 'ok' : 'warn')}>{res ? 'Resolved' : 'Open'}</span> : null}
        <IconButton icon="locate" tip="Show in text" data-go={a.id} onClick={() => showInText(a.id)} />
        {ask ? <IconButton icon="copy" tip="Copy the query" data-copyq={a.id} onClick={() => copyText(pidLabel(data, a.p) + ': “' + a.q + '”\n' + (a.text ?? ''))} /> : null}
        <IconButton icon="trash" className="quiet danger" tip="Delete note" tipSide="r" data-del={a.id} onClick={() => removeAnnotation(a.id)} />
      </div>
      <div className="quote" style={{ fontFamily: 'var(--f-serif)', fontSize: 14 }}>“{a.q}”</div>
      <div className="sub">{pidLabel(data, a.p)}</div>
      <div className="thread">
        {ms.map((m) =>
          s.aedit === a.id + ':' + m.i ? (
            <EditBox key={m.i} a={a} i={m.i} initial={m.text} />
          ) : (
            <div className={'msg ' + m.who} key={m.i}>
              <span className="who">{m.who === 'author' ? 'Author' : 'You'}</span>
              <span>{m.text}</span>
              <span className="when">
                {m.at}
                <span className="mtools">
                  <IconButton icon="pencil" tip="Edit this message" data-amedit={a.id + ':' + m.i} onClick={() => setEdit(a.id + ':' + m.i)} />
                  <IconButton icon="trash" className="quiet danger" tip="Delete message" tipSide="r" data-amdel={a.id + ':' + m.i} onClick={() => deleteMessage(a.id, m.i)} />
                </span>
              </span>
            </div>
          ),
        )}
      </div>
      {ask && res ? (
        <div className="row"><Btn data-reopen={a.id} onClick={() => setStatus(a.id, 'open')}>Reopen</Btn></div>
      ) : (
        <div className="stack" style={{ gap: 6 }}>
          {ask ? (
            <div className="seg" role="group" aria-label="Who wrote this">
              <button type="button" aria-pressed={(who ?? 'author') === 'author'} onClick={() => chooseWho('author')}>Author replied</button>
              <button type="button" aria-pressed={who === 'you'} onClick={() => chooseWho('you')}>My note</button>
            </div>
          ) : null}
          <Textarea
            data-reply={a.id} aria-label={ask ? 'Reply or note' : 'Add to this note'} value={reply} onChange={(e) => setReply(e.target.value)}
            placeholder={ask ? 'Paste the reply, or add a note' : ms.length ? 'Add to this note' : 'Write a note'}
          />
          <div className="row">
            <Btn
              data-addreply={a.id}
              onClick={() => {
                const tx = reply.trim()
                if (!tx) { toast('Write the reply or note first.'); return }
                addToThread(a.id, who ?? (ask ? 'author' : 'you'), tx)
                setReply('')
              }}
            >Reply</Btn>
            {ask ? <Btn className="primary" data-resolve={a.id} onClick={() => resolveQuery(a.id, who ?? 'author', reply.trim())}>Mark resolved</Btn> : null}
          </div>
        </div>
      )}
    </div>
  )
}

export function ThreadsTab({ chId, asks }: { chId: string; asks: boolean }) {
  const data = useData()
  const s = useUi().script
  const all = data.annotations.filter((a) => isAsk(data, a))
  const nOpen = all.filter((a) => a.status !== 'resolved').length
  const nRes = all.length - nOpen
  const base = asks
    ? all.filter((a) => s.qfilter === 'all' || (s.qfilter === 'open' ? a.status !== 'resolved' : a.status === 'resolved'))
    : annsInChapter(data, chId).filter((a) => a.type === 'mark' && !isAsk(data, a))
  const list = [...base].sort((x, y) => Number(y.id === s.sel) - Number(x.id === s.sel))
  const wrap = useRef<HTMLDivElement>(null)
  useEffect(() => { wrap.current?.querySelector('.a-active')?.scrollIntoView?.({ block: 'nearest' }) }, [s.sel])
  const filters: Array<['open' | 'resolved' | 'all', string]> = [['open', 'Open ' + nOpen], ['resolved', 'Resolved ' + nRes], ['all', 'All']]
  return (
    <div ref={wrap} style={{ display: "contents" }}>
      {asks ? (
        <div className="seg" role="group" aria-label="Show">
          {filters.map(([k, l]) => <button key={k} type="button" data-qf={k} aria-pressed={s.qfilter === k} onClick={() => update((d) => { d.ui.script.qfilter = k })}>{l}</button>)}
        </div>
      ) : null}
      {list.length ? list.map((a) => <AnnCard key={a.id} a={a} />) : <div className="empty"><span>{asks ? 'No queries here.' : 'No notes in this chapter yet. Select text and choose Mark.'}</span></div>}
    </div>
  )
}
