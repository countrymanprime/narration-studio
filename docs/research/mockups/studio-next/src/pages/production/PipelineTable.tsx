import type { BookData, Chapter } from '@/domain/schemas'
import { hm, num } from '@/format/time'
import { chLabel } from '@/selectors/chapters'
import { vals, WPH } from '@/selectors/progress'
import { noteProgress } from '@/selectors/proof'
import { cellAct } from '@/state/commands/production'
import { modals } from '@/app/modals'
import { Icon } from '@/ui/Icon'
import { useEffect } from 'react'
import { stampSuggestions } from '@/state/commands/readiness'
import { stageReadiness } from '@/selectors/readiness'
import { ReadinessChip } from './StageReadiness'

function Cell({ cls, children, to, tip }: { cls: string; children: React.ReactNode; to?: string; tip?: string }) {
  return to
    ? <button type="button" className={'cell ' + cls} data-cell={to} title={tip ?? ''} onClick={() => cellAct(to)}>{children}</button>
    : <span className={'cell ' + cls} title={tip}>{children}</span>
}

/** One format for every stage column: a tick when done, the percent when under way, a dash when not started. */
const stage = (p: number, to: string, tip: string) =>
  p >= 100 ? <Cell cls="done" to={to} tip={tip}><Icon name="check" /></Cell> : p > 0 ? <Cell cls="prog" to={to} tip={tip}>{p}%</Cell> : <Cell cls="" to={to} tip={tip}>—</Cell>

function Row({ data, c }: { data: BookData; c: Chapter }) {
  const v = vals(data, c)
  const label = chLabel(data, c)
  const rd = stageReadiness(data, c)
  /* The verdict chip sits on the corner of the cell for the stage the chapter is in. */
  const wrap = (col: typeof rd.column, cell: React.ReactNode): React.ReactNode => (rd.column === col ? <span className="rd-w">{cell}<ReadinessChip r={rd} /></span> : cell)
  const words = (p: number): number => Math.round((c.words * p) / 100)
  const notes = data.proofNotes.filter((n) => n.chapterId === c.id)
  const proofTip = notes.length ? `${noteProgress(data, notes).cleared} of ${notes.length} notes cleared` : v.proof >= 100 ? 'Proofed' : v.proof > 0 ? `${v.proof}% proofed` : 'Not started'
  const prep = c.prep === 'prepped'
    ? <Cell cls="done" to={'script:' + c.id} tip="Prepped"><Icon name="check" /></Cell>
    : c.prep === 'progress'
      ? <Cell cls="prog" to={'script:' + c.id} tip="Prep in progress"><Icon name="circleHalf" /></Cell>
      : <Cell cls="" to={'script:' + c.id} tip="Prep not started"><Icon name="circleEmpty" /></Cell>
  return (
    <tr data-chrow={c.id}>
      <td style={{ fontWeight: 500 }}>
        {label ? <><span className="mono" style={{ color: 'var(--faint)' }}>{label}</span> {c.title}</> : c.title}
        {c.flag ? <> <button type="button" className="pill warn" data-flag={c.id} title={c.flag.text} onClick={() => modals.flags()}>Text changed</button></> : null}
      </td>
      <td className="mono">{hm(c.words / WPH)}</td>
      <td>{wrap('prep', prep)}</td>
      <td>{wrap('record', stage(v.rec, 'booth:' + c.id, `${v.rec}% recorded · ${num(words(v.rec))} of ${num(c.words)} words`))}</td>
      <td>{wrap('edit', stage(v.edit, 'edit:' + c.id, `${v.edit}% edited · ${num(words(v.edit))} of ${num(c.words)} words`))}</td>
      <td>{wrap('proof', stage(v.proof, 'proof', proofTip))}</td>
      <td>{wrap('pickups', v.rec < 100 ? <Cell cls="">—</Cell> : <Cell cls={v.pick ? 'open' : 'done'} to="pickups" tip={v.pick ? `${v.pick} open pickups` : 'No open pickups'}>{v.pick}</Cell>)}</td>
      <td>{v.master ? <Cell cls="done" to="master" tip="Mastered"><Icon name="check" /></Cell> : <Cell cls="" to="master" tip="Not mastered">—</Cell>}</td>
      <td>{wrap('qc', v.qc === 'PASS' ? <Cell cls="done" to="master">PASS</Cell> : v.qc ? <Cell cls="open" to="master">{v.qc}</Cell> : <Cell cls="" to="master">—</Cell>)}</td>
    </tr>
  )
}

/** Every chapter and where it stands in each stage. Every stage column is the same width. */
export function PipelineTable({ data }: { data: BookData }) {
  /* A chapter whose evidence is complete gets a suggestion on record, so a later change in the evidence can be told from it. */
  useEffect(() => { stampSuggestions() }, [data])
  return (
    <div className="tblwrap">
      <table style={{ tableLayout: 'fixed' }}>
        <colgroup><col /><col style={{ width: 64 }} />{[0, 1, 2, 3, 4, 5, 6].map((i) => <col key={i} style={{ width: 80 }} />)}</colgroup>
        <thead><tr><th>Chapter</th><th>Fin.</th><th>Prep</th><th>Record</th><th>Edit</th><th>Proof</th><th>Pickups</th><th>Master</th><th>QC</th></tr></thead>
        <tbody>{data.chapters.map((c) => <Row key={c.id} data={data} c={c} />)}</tbody>
      </table>
    </div>
  )
}
