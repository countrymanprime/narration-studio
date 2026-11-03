import { Fragment, useEffect, useMemo, useRef, type KeyboardEvent } from 'react'
import { modals } from '@/app/modals'
import { registerContext } from '@/app/registry'
import { tailItems } from '@/app/context'
import type { Pickup } from '@/domain/schemas'
import { chName, hasText } from '@/selectors/chapters'
import { gateOf } from '@/selectors/daw'
import { NOT_MEASURED, sessionMinutes } from '@/selectors/measured'
import { checkState } from '@/selectors/checks'
import { isDone, isOut, pickupList, sessionPickups, srcLabel, typeLabel } from '@/selectors/pickups'
import { go, openInScript } from '@/state/commands/nav'
import { projectBasis, reconcilePickupMarkers } from '@/state/commands/pickups'
import {
  addPickupByHand, addPickupMarkers, copyPickupScript, openPickMode, pickupScript, removePickup, setPickupIncluded, togglePickupDone,
  togglePickupIncluded,
} from '@/state/commands/pickups'
import { getState, update, useData, useMock, useUi } from '@/state/store'
import { ChapterBar } from '@/ui/ChapterBar'
import { NeedManuscript } from '@/ui/NeedManuscript'
import { I, L, SEP, openModal, popAt, toast, type CtxItem } from '@/ui/overlay'
import { IconButton, Input } from '@/ui/primitives'
import { CheckRecordings } from './pickups/CheckRecordings'
import { Checkbox } from '@/ui/primitives/Checkbox'

/** The line to re-record. A proof note can carry <b>bold</b> and <i>italic</i> for the word in question; nothing else is markup. */
export function ScriptLine({ text }: { text: string }) {
  return (
    <>
      {text.split(/(<(?:b|i)>.*?<\/(?:b|i)>)/g).map((part, i) => {
        const m = /^<(b|i)>(.*)<\/\1>$/.exec(part)
        if (!m) return <Fragment key={i}>{part}</Fragment>
        return m[1] === 'b' ? <b key={i}>{m[2]}</b> : <i key={i}>{m[2]}</i>
      })}
    </>
  )
}

/** The Check recordings dialog belongs to this page; other pages open it through modals. */
modals.checkRecordings = (pre = []) =>
  openModal({ label: 'Check recordings', wide: true, render: ({ close }) => <CheckRecordings pre={pre} close={close} /> })

function AddPickup({ close }: { close: () => void }) {
  const data = useData()
  const chapterId = useUi().chapter
  const t = useRef<HTMLInputElement>(null)
  const l = useRef<HTMLInputElement>(null)
  const c = data.chapters.find((x) => x.id === chapterId) ?? data.chapters[0]
  return (
    <div className="stack" style={{ gap: 8, minWidth: 300 }}>
      <span className="label">{chName(data, c)}</span>
      <label className="stack" style={{ gap: 4 }}><span className="label">Time in the recording</span><Input type="text" id="apt" ref={t} placeholder="05:12.0" aria-label="Time in the recording" /></label>
      <label className="stack" style={{ gap: 4 }}><span className="label">Line to re-record</span><Input type="text" id="apl" ref={l} placeholder="Start of the line" aria-label="Line to re-record" /></label>
      <button type="button" className="btn primary" id="apok" onClick={() => { if (addPickupByHand(chapterId, t.current?.value ?? '', l.current?.value ?? '')) close() }}>Add pickup</button>
    </div>
  )
}

export default function PickupsPage() {
  const data = useData()
  const ui = useUi()
  const mock = useMock()
  const markers = gateOf(mock, 'markers')
  /* The DAW's markers are the truth for which pickups are done: take them when the page opens. */
  useEffect(() => { reconcilePickupMarkers() }, [])
  const body = useRef<HTMLTableSectionElement>(null)
  const all = useMemo(() => pickupList(data), [data])
  const list = useMemo(() => (ui.pickups.scope === 'all' ? all : all.filter((x) => x.chapterId === ui.chapter)), [all, ui.pickups.scope, ui.chapter])
  const picked = useMemo(() => sessionPickups(data, list), [data, list])
  const minutes = sessionMinutes(picked.map((x) => x.id))
  const groups = useMemo(() => data.chapters.filter((c) => list.some((x) => x.chapterId === c.id)).map((c) => ({ c, items: list.filter((x) => x.chapterId === c.id) })), [data.chapters, list])
  if (!mock.hasManuscript) return <NeedManuscript title="Pickups" />
  const sel = list.some((x) => x.id === ui.pickups.sel) ? ui.pickups.sel : (list[0]?.id ?? null)
  const off = mock.setup === 'reaper-off'

  /* Up and down move between lines; Space includes or leaves out; Enter records the line. */
  const rowKey = (e: KeyboardEvent<HTMLTableRowElement>, x: Pickup): void => {
    if ((e.target as HTMLElement).closest('button,input')) return
    const rows = [...(body.current?.querySelectorAll<HTMLTableRowElement>('tr[data-pk]') ?? [])]
    const i = rows.indexOf(e.currentTarget)
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      const n = rows[Math.max(0, Math.min(rows.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))]
      update((d) => { d.ui.pickups.sel = n.dataset.pk ?? null })
      n.focus()
    } else if (e.key === ' ') {
      e.preventDefault()
      if (!isDone(data, x.id)) { togglePickupIncluded(x.id); update((d) => { d.ui.pickups.sel = x.id }) }
    } else if (e.key === 'Enter') openPickMode([x])
  }
  const select = (x: Pickup): void => update((d) => { d.ui.pickups.sel = x.id; d.ui.chapter = x.chapterId })

  return (
    <div className="page two">
      <section className="panel">
        <div className="ph">
          <h1>Pickups</h1>
          <ChapterBar scopeKey="pickups" />
          <span className="spacer" />
          <IconButton icon="listen" tip="Check recordings…" id="chk" aria-haspopup="dialog" disabled={off}
            onClick={() => modals.checkRecordings(data.chapters.filter((c) => hasText(data, c.id) && checkState(data, c.id, projectBasis()) !== 'current').map((c) => c.id))} />
          <IconButton icon="plus" tip="Add a pickup by hand" id="addp" data-keeppop onClick={(e) => popAt(e.currentTarget, ({ close }) => <AddPickup close={close} />, '')} />
        </div>
        {list.length ? (
          <div className="tblwrap" style={{ overflow: 'auto' }}>
            <table>
              <thead><tr><th style={{ width: 36 }}><span className="sr">Include in the session</span></th><th>Time</th><th>Type</th><th>Line to re-record</th><th>From</th><th>Status</th><th></th></tr></thead>
              <tbody ref={body}>
                {groups.map((g) => (
                  <Fragment key={g.c.id}>
                    <tr><td colSpan={7} style={{ background: 'var(--raised)' }}><b>{chName(data, g.c)}</b> <span className="sub">· {g.items.filter((x) => !isDone(data, x.id)).length} open</span></td></tr>
                    {g.items.map((x) => {
                      const dn = isDone(data, x.id)
                      return (
                        <tr key={x.id} tabIndex={x.id === sel ? 0 : -1} data-pk={x.id} aria-selected={x.id === ui.pickups.sel}
                          onClick={(e) => { if ((e.target as HTMLElement).closest('button,input')) return; select(x); e.currentTarget.focus() }}
                          onKeyDown={(e) => rowKey(e, x)}>
                          <td><Checkbox data-inc={x.id} checked={!isOut(data, x.id) && !dn} disabled={dn} aria-label={'Include ' + x.t + ' in the session'} onCheckedChange={(c) => setPickupIncluded(x.id, c)} /></td>
                          <td className="mono">{x.t}</td>
                          <td><span className={'type t-' + x.ty}>{typeLabel(x)}</span></td>
                          <td style={{ fontSize: 16 }}><ScriptLine text={x.script} /></td>
                          <td className="sub" title={x.conf == null ? x.confReason : undefined}>{srcLabel(x)}</td>
                          <td>{dn ? <span className="pill ok">Recorded</span> : <span className="pill neutral">Open</span>}</td>
                          <td>
                            <div className="row" style={{ flexWrap: 'nowrap', gap: 4, justifyContent: 'flex-end' }}>
                              <IconButton icon="play" tip="Hear the original in context" data-ctxp={x.id} onClick={() => toast('Playing the original around this line')} />
                              <IconButton icon="mic" tip="Open in Booth at this line" data-recp={x.id} onClick={() => openPickMode([x])} />
                              <IconButton icon={dn ? 'done' : 'doneOff'} tip={dn ? 'Mark open again' : 'Mark recorded'} data-donep={x.id} onClick={() => togglePickupDone(x.id)} />
                              <IconButton icon="trash" className="quiet danger" tip="Remove from pickups" tipSide="r" data-delp={x.id} onClick={() => removePickup(x.id)} />
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        ) : all.length ? (
          <div className="empty"><h3>No pickups for this chapter</h3></div>
        ) : (
          <div className="empty"><h3>No pickups queued</h3><span>Mark a proof note “Needs pickup” and it appears here.</span><IconButton icon="arrowRight" tip="Go to Proof" data-go2="proof" onClick={() => go('proof')} /></div>
        )}
      </section>
      <aside className="panel">
        <div className="ph">
          <h2>Pickup session</h2><span className="spacer" />
          <IconButton icon="copy" tip="Copy the pickup script" tipSide="r" id="copyp" onClick={() => copyPickupScript(pickupScript(data, picked))} />
        </div>
        <div className="pb stack">
          <div className="optrow"><span>Lines</span><b className="mono">{picked.length}</b></div>
          <div className="optrow"><span>About</span><b className="mono">{minutes.ok ? minutes.value + ' min' : NOT_MEASURED}</b></div>
          <button type="button" className="btn primary" id="rp" disabled={!picked.length} onClick={() => openPickMode(picked)}>Open {picked.length} in Booth</button>
          <IconButton icon="flag" tip={'Add ' + picked.length + ' as markers in ' + markers.label} id="expm" disabled={!(picked.length && markers.ok)} onClick={() => addPickupMarkers(picked)} />
        </div>
      </aside>
    </div>
  )
}

/** Right-click on a pickup row. */
registerContext((target): CtxItem[] | null => {
  const tr = target.closest('tr[data-pk]')
  const s = getState()
  if (!tr || s.ui.page !== 'pickups') return null
  const id = (tr as HTMLElement).dataset.pk as string
  const x = pickupList(s.data).find((y) => y.id === id)
  if (!x) return null
  const dn = isDone(s.data, id)
  const c = s.data.chapters.find((y) => y.id === x.chapterId)
  return [
    L((c ? chName(s.data, c) : x.chapterId) + ' · ' + x.t),
    I(isOut(s.data, id) ? 'Include in the session' : 'Leave out of the session', () => togglePickupIncluded(id), { disabled: dn }),
    I('Hear the original in context', () => toast('Playing the original around this line')),
    I('Open in Booth at this line', () => openPickMode([x])),
    I('Open this chapter in Script', () => openInScript(x.chapterId)),
    I(dn ? 'Mark open again' : 'Mark recorded', () => togglePickupDone(id)),
    I('Remove from pickups', () => removePickup(id, false)),
    SEP,
    I('Go to the note in Proof', () => { update((d) => { if (x.rid != null) d.ui.proof.sel = x.rid }); go('proof') }, { disabled: x.rid == null }),
    ...tailItems(),
  ]
})

