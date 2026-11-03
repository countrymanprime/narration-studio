import { useState } from 'react'
import type { BookData, Milestone, PaymentKind } from '@/domain/schemas'
import { addDays, diffDays, fmtD, hm, num, parseIso } from '@/format/time'
import { numberedChapters } from '@/selectors/chapters'
import { PAYMENT_TYPES } from '@/fixtures/schedule'
import { measureOptions, measureText } from '@/selectors/milestones'
import { calc, contractValue, dueDate, measOf, PACE, RATIO, remainFor, today, WPH } from '@/selectors/progress'
import { blankDraft, draftOf, removeMilestone, saveMilestone, setContractAmount, setDueDate, setMilestoneDone, setPaymentType, type MilestoneDraft } from '@/state/commands/schedule'
import { useData, useMock } from '@/state/store'
import { Icon } from '@/ui/Icon'
import { Btn, FieldRow, IconButton, Input, Select, NumberInput, Textarea } from '@/ui/primitives'
import { openModal } from '@/ui/overlay'
import { NeedManuscript } from '@/ui/NeedManuscript'
import { Checkbox } from '@/ui/primitives/Checkbox'
import { ProgressChart } from './production/ProgressChart'
import { VerdictPill } from './production/VerdictPill'

/** kind, the full sentence (tooltip), and the short value shown in the cell */
type PillSpec = ['ok' | 'warn' | 'bad' | 'neutral', string, string]

const CELL_CLASS = { ok: 'done', warn: 'wait', bad: 'open', neutral: '' } as const
/** A status as a small coloured cell, like the Production table: the value is short, the sentence is in the tooltip. */
function StatusCell({ s }: { s: PillSpec }) {
  return <span className={'cell ' + CELL_CLASS[s[0]]} role="img" aria-label={s[1]} data-tip={s[1]}>{s[2] === '✓' ? <Icon name="check" /> : s[2]}</span>
}

/** Whether the pace reaches a milestone's measure by its date. */
function estimate(data: BookData, scope: string, date: Date): PillSpec {
  const h = remainFor(data, scope)
  const proj = addDays(today(data), Math.ceil(h / PACE))
  const late = diffDays(proj, date)
  return late > 0 ? ['bad', 'Late by ' + late + ' d (est. ' + fmtD(proj) + ')', '+' + late + ' d'] : late >= -1 ? ['warn', 'At risk (est. ' + fmtD(proj) + ')', fmtD(proj)] : ['ok', 'On track (est. ' + fmtD(proj) + ')', fmtD(proj)]
}

/** Add or change every detail of a milestone. Saving is undoable; Cancel changes nothing. */
function MilestoneDialog({ id, focus, close }: { id: number | null; focus?: 'note'; close: () => void }) {
  const data = useData()
  const existing = id == null ? undefined : data.milestones.find((m) => m.id === id)
  const [d, setD] = useState<MilestoneDraft>(() => (existing ? draftOf(existing) : blankDraft()))
  const set = (patch: Partial<MilestoneDraft>): void => setD((x) => ({ ...x, ...patch }))
  const chapters = numberedChapters(data).length
  const words = data.chapters.reduce((a, c) => a + c.words, 0)
  const options = measureOptions(data, existing ? measOf(existing.scope) : undefined)
  const save = (): void => { if (saveMilestone(id, d)) close() }
  return (
    <>
      <div className="dh"><h2 style={{ fontSize: 24 }}>{id == null ? 'Add milestone' : 'Edit milestone'}</h2></div>
      <div className="db stack" style={{ gap: 14 }}>
        <FieldRow label="Name" htmlFor="ms-name">
          <Input type="text" id="ms-name" value={d.name} data-autofocus={focus ? undefined : ''} onChange={(e) => set({ name: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter') save() }} />
        </FieldRow>
        <FieldRow label="Due" htmlFor="ms-date">
          <Input type="date" id="ms-date" value={d.date} onChange={(e) => set({ date: e.target.value })} />
        </FieldRow>
        <FieldRow label="Measures" htmlFor="ms-measure">
          <div className="row" style={{ flexWrap: 'nowrap', gap: 8 }}>
            <Select id="ms-measure" aria-label="What the milestone measures" value={d.measure} onValueChange={(v) => set({ measure: v })} options={options} style={{ flex: 1, minWidth: 0 }} />
            {d.measure === 'chN' ? <NumberInput min={1} max={chapters} step={1} value={d.chapters} aria-label="How many chapters" style={{ width: 80 }} onValueChange={(n) => set({ chapters: Math.round(n) })} /> : null}
            {d.measure === 'minN' ? <NumberInput min={1} max={Math.max(1, Math.floor((words / WPH) * 60))} step={1} value={d.minutes} aria-label="How many finished minutes" style={{ width: 80 }} onValueChange={(n) => set({ minutes: Math.round(n) })} /> : null}
          </div>
        </FieldRow>
        <FieldRow label="Note" htmlFor="ms-note">
          <Textarea id="ms-note" rows={3} value={d.note} data-autofocus={focus === 'note' ? '' : undefined} onChange={(e) => set({ note: e.target.value })} />
        </FieldRow>
        <Checkbox id="ms-done" checked={d.done} onCheckedChange={(c) => set({ done: c })} label="Done" />
      </div>
      <div className="df">
        <Btn onClick={close}>Cancel</Btn>
        <Btn className="primary" id="ms-save" onClick={save}>{id == null ? 'Add milestone' : 'Save'}</Btn>
      </div>
    </>
  )
}

const openMilestone = (id: number | null, focus?: 'note'): void => {
  openModal({ label: id == null ? 'Add milestone' : 'Edit milestone', render: ({ close }) => <MilestoneDialog id={id} focus={focus} close={close} /> })
}

function MilestoneRow({ data, m }: { data: BookData; m: Milestone }) {
  const meas = measOf(m.scope)
  const pill: PillSpec = m.done ? ['ok', 'Done', '✓'] : meas === 'custom' ? ['neutral', 'Not estimated', '—'] : estimate(data, m.scope, parseIso(m.date))
  return (
    <tr data-msrow={m.id}>
      <td><IconButton icon={m.done ? 'done' : 'doneOff'} tip={'Mark ' + m.name + ' complete'} className={m.done ? 'ghost done-on' : 'ghost'} aria-pressed={!!m.done} data-msdone={m.id} onClick={() => setMilestoneDone(m.id, !m.done)} /></td>
      <td><b data-msname={m.id}>{m.name}</b></td>
      <td data-msmeasure={m.id}>{measureText(m.scope)}</td>
      <td className="mono">{fmtD(parseIso(m.date))}</td>
      <td><StatusCell s={pill} /></td>
      <td>
        <div className="row" style={{ flexWrap: 'nowrap', gap: 2, justifyContent: 'flex-end' }}>
          <IconButton icon={m.note ? 'note' : 'noteOff'} tip={m.note ?? 'Add a note'} className="ghost" data-msnote={m.id} onClick={() => openMilestone(m.id, 'note')} />
          <IconButton icon="pencil" tip={'Edit ' + m.name} className="ghost" data-msedit={m.id} onClick={() => openMilestone(m.id)} />
          <IconButton icon="trash" tip={'Remove ' + m.name} className="ghost danger" data-msx={m.id} onClick={() => removeMilestone(m.id)} />
        </div>
      </td>
    </tr>
  )
}

/** An amount that is committed when focus leaves or on Enter; empty means no amount set. */
function AmountInput({ value, label }: { value: number | null; label: string }) {
  const [v, setV] = useState<string | null>(null)
  const commit = (): void => {
    if (v == null) return
    const t = v.trim()
    setContractAmount(t === '' ? null : Number(t))
    setV(null)
  }
  return (
    <Input type="number" min={0} step="any" id="contract-amount" aria-label={label} value={v ?? (value == null ? '' : String(value))} style={{ width: 120 }}
      onChange={(e) => setV(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }} />
  )
}

/** How the narrator is paid. Only a rate per finished hour gives the contract a value; with no such rate there is no value figure. */
function ContractPanel({ data }: { data: BookData }) {
  const { payment, amount } = data.contract
  const type = PAYMENT_TYPES.find((t) => t.id === payment)
  const value = contractValue(data)
  return (
    <section className="panel">
      <div className="ph"><h2>Contract</h2></div>
      <div className="pb stack" style={{ overflow: 'visible' }}>
        <div className="optrow">
          <span>Paid</span>
          <Select id="contract-type" aria-label="How you are paid" value={payment} onValueChange={(v) => setPaymentType(v as PaymentKind)}
            options={PAYMENT_TYPES.map((t) => ({ value: t.id, label: t.label }))} />
        </div>
        {type && type.unit ? (
          <div className="optrow">
            <span>Amount</span>
            <span className="row" style={{ flexWrap: 'nowrap', gap: 8 }}><AmountInput value={amount} label={payment === 'pfh' ? 'Rate per finished hour' : 'Royalty share in percent'} /><span className="sub">{type.unit}</span></span>
          </div>
        ) : null}
        {value != null ? <div className="optrow"><span>Value at this rate</span><b className="mono" id="contract-value">{num(Math.round(value))}</b></div> : null}
      </div>
    </section>
  )
}

export default function SchedulePage() {
  const data = useData()
  const mock = useMock()
  if (!mock.hasManuscript) return <NeedManuscript title="Schedule" />
  const k = calc(data)
  const due = dueDate(data)
  const final = estimate(data, 'all', due)
  const rows = [...data.milestones].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
  return (
    <div className="page">
      <div className="phead">
        <div className="stack" style={{ gap: 6 }}><h1>Schedule</h1><div className="sub">Due <b>{fmtD(due)}</b> · {k.daysLeft} days left</div></div>
        <span className="spacer" />
        <VerdictPill data={data} k={k} />
      </div>
      <div className="pgrid" style={{ alignItems: 'stretch' }}>
        <section className="panel"><div className="ph"><h2>Recorded audio vs plan</h2></div><div className="pb" style={{ overflow: 'visible' }}><ProgressChart data={data} k={k} height={280} fill /></div></section>
        <div className="stack" style={{ gap: 16 }}>
          <ContractPanel data={data} />
          <section className="panel" style={{ flex: 1 }}>
            <div className="ph"><h2>How this is worked out</h2></div>
            <div className="pb stack" style={{ overflow: 'visible' }}>
              <div className="optrow"><span>Recording left</span><span className="mono">{hm(k.recLeft)}</span></div>
              <div className="optrow"><span>Editing left</span><span className="mono">{hm(k.editLeft)}</span></div>
              <div className="optrow"><span>Proofing left</span><span className="mono">{hm(k.proofLeft)}</span></div>
              <div className="optrow"><span>Pickups</span><span className="mono">{hm(k.pickH)}</span></div>
              <div className="optrow" style={{ borderTop: '1px solid var(--line)', paddingTop: 8 }}><b>Work left</b><b className="mono">{hm(k.remain)}</b></div>
              <div className="optrow"><span>Your pace</span><span className="mono">{PACE.toFixed(1)} h/day</span></div>
              <div className="optrow"><span>Pace needed for the due date</span><span className="mono">{isFinite(k.reqPace) ? k.reqPace.toFixed(1) + ' h/day' : '—'}</span></div>
              <div className="optrow"><span>At your pace, done</span><b>{fmtD(k.finish)}</b></div>
              <div className="sub">Finished audio is words ÷ {num(WPH)}. Recording takes {RATIO.rec}×, editing {RATIO.edit}× and proofing {RATIO.proof}× the finished hours. Your pace is estimated from the audio the app can see.</div>
            </div>
          </section>
        </div>
      </div>
      <section className="panel">
        <div className="ph"><h2>Milestones</h2><span className="spacer" /><IconButton icon="plus" tip="Add milestone" id="msadd" onClick={() => openMilestone(null)} /></div>
        <div className="tblwrap">
          <table className="ms-table">
            <colgroup><col style={{ width: 56 }} /><col /><col style={{ width: '30%' }} /><col style={{ width: 152 }} /><col style={{ width: 84 }} /><col style={{ width: 132 }} /></colgroup>
            <thead><tr><th><span className="sr-only">Done</span></th><th>Milestone</th><th>Measures</th><th>Due</th><th>Status</th><th><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>
              {rows.map((m) => <MilestoneRow key={m.id} data={data} m={m} />)}
              <tr><td /><td><b>Final delivery</b></td><td className="sub">Whole book</td><td colSpan={1}><Input type="date" id="duedt" value={data.due} aria-label="Delivery due" style={{ width: '100%' }} onChange={(e) => setDueDate(e.target.value)} /></td><td><StatusCell s={final} /></td><td /></tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
