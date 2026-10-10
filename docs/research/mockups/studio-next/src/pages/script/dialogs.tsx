import { Btn, IconButton, Input, Textarea, Select } from '@/ui/primitives'
import { useState, type CSSProperties } from 'react'
import { modals } from '@/app/modals'
import type { MarkColour, MarkStyle } from '@/domain/schemas'
import { saveMark } from '@/state/commands/script'
import { update, useData } from '@/state/store'
import { openModal, toast } from '@/ui/overlay'
import type { SelectionInfo } from '@/state/slices/ui'
import { Checkbox } from '@/ui/primitives/Checkbox'

const MARK_COLOURS: Record<MarkColour, string> = { copper: 'Copper', info: 'Blue', ok: 'Green', warn: 'Amber', bad: 'Red', violet: 'Violet' }
const MARK_STYLES: Record<MarkStyle, string> = { highlight: 'Highlight', underline: 'Underline', double: 'Double line', dotted: 'Dotted', wavy: 'Wavy', box: 'Box' }

/** One composer for every kind of mark: pick a type, add a note if you want one. Question types need the question text. */
function Composer({ initial, g, close }: { initial: string; g: SelectionInfo; close: () => void }) {
  const data = useData()
  const [k, setK] = useState(initial)
  const [tx, setTx] = useState('')
  const mt = data.marks.find((x) => x.k === k) ?? data.marks[0]
  const title = g.q.length > 60 ? g.q.slice(0, 60) + '…' : g.q
  return (
    <>
      <div className="dh"><div><div className="label">Mark</div><h2 style={{ fontSize: 24 }}>{title}</h2></div></div>
      <div className="db stack">
        <div className="stack" style={{ gap: 6 }}>
          <label className="label" id="mtype-l" htmlFor="mtype">Type</label>
          <Select id="mtype" aria-labelledby="mtype-l" value={k} onValueChange={setK}
            options={data.marks.map((x) => ({ value: x.k, label: x.name + (x.ask ? ' (tracks a reply)' : '') }))} />
        </div>
        <div className="stack" style={{ gap: 6 }}>
          <label className="label" htmlFor="ctext" id="clabel">{mt.ask ? 'Your query' : 'Note (optional)'}</label>
          <Textarea
            id="ctext" data-autofocus value={tx} onChange={(e) => setTx(e.target.value)}
            placeholder={mt.ask ? 'What do you need to ask the author?' : 'Anything you want to remember here'}
          />
        </div>
      </div>
      <div className="df">
        <Btn onClick={close}>Cancel</Btn>
        <Btn className="primary" onClick={() => { if (saveMark(g, k, tx)) close() }}>Save</Btn>
      </div>
    </>
  )
}
export function openMarkComposer(key: string, g: SelectionInfo): void {
  openModal({ label: 'Mark text', render: ({ close }) => <Composer initial={key} g={g} close={close} /> })
}

function MarksDialog({ close }: { close: () => void }) {
  const data = useData()
  const [sure, setSure] = useState<string | null>(null)
  const used = (k: string): number => data.annotations.filter((a) => a.mark === k).length
  const remove = (k: string): void => {
    if (data.marks.length < 2) { toast('Keep at least one mark.'); return }
    if (used(k) && sure !== k) { setSure(k); return }
    update((d) => {
      d.data.annotations = d.data.annotations.filter((a) => a.mark !== k)
      d.data.marks = d.data.marks.filter((m) => m.k !== k)
    })
    setSure(null)
  }
  const edit = (i: number, fn: (m: (typeof data.marks)[number]) => void): void => update((d) => { fn(d.data.marks[i]) })
  return (
    <>
      <div className="dh">
        <div><div className="label">Your marks</div><h2 style={{ fontSize: 24 }}>Define how you mark up</h2></div>
        <span className="spacer" /><Btn className="primary" onClick={close}>Done</Btn>
      </div>
      <div className="db stack">
        {data.marks.map((x, i) => (
          <div className="row" style={{ flexWrap: 'nowrap' }} key={x.k}>
            <span className="swatch" style={{ ['--mc' as string]: 'var(--' + x.c + ')', width: 18, height: 18 } as CSSProperties} />
            <Input type="text" value={x.name} aria-label="Mark name" style={{ flex: 1, minWidth: 0 }} onChange={(e) => edit(i, (m) => { m.name = e.target.value })} />
            <Select aria-label="Colour" style={{ width: 120 }} value={x.c} onValueChange={(v) => edit(i, (m) => { m.c = v as MarkColour })}
              options={Object.entries(MARK_COLOURS).map(([k, v]) => ({ value: k, label: v }))} />
            <Select aria-label="Line" style={{ width: 132 }} value={x.st} onValueChange={(v) => edit(i, (m) => { m.st = v as MarkStyle })}
              options={Object.entries(MARK_STYLES).map(([k, v]) => ({ value: k, label: v }))} />
            <label className="row" style={{ flexWrap: 'nowrap', gap: 4 }} title="Tracks a reply, like a question for the author">
              <Checkbox
                aria-label="Asks" checked={!!x.ask}
                onCheckedChange={(on) => update((d) => {
                  const m = d.data.marks[i]
                  m.ask = on
                  d.data.annotations.forEach((a) => { if (a.mark === m.k && m.ask && !a.status) a.status = 'open' })
                })}
              />Asks
            </label>
            {sure === x.k
              ? <button type="button" className="btn quiet" onClick={() => remove(x.k)}>{'Remove ' + used(x.k) + ' uses too?'}</button>
              : <IconButton icon="trash" tip="Remove" className="quiet danger" onClick={() => remove(x.k)} />}
          </div>
        ))}
        <div className="row">
          <IconButton icon="plus" tip="Add a mark" id="addm" onClick={() => update((d) => { d.data.marks.push({ k: 'm' + Date.now(), name: 'New mark', c: 'bad', st: 'box' }) })} />
        </div>
      </div>
    </>
  )
}
export function openMarksDialog(): void {
  openModal({ label: 'Define marks', render: ({ close }) => <MarksDialog close={close} /> })
}
modals.marks = openMarksDialog
