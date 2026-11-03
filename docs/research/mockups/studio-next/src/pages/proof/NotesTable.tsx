import { Btn } from '@/ui/primitives'
import { takeCounts } from '@/selectors/proofTakes'
import { useEffect, useMemo, useRef, type CSSProperties } from 'react'
import type { BookData, ProofNote } from '@/domain/schemas'
import { chName } from '@/selectors/chapters'
import { RES_CHIP_CH, RES_CLASS, RES_LABEL, TO_REVIEW_LABEL, TYPE_CHIP_CH, isOpenNote } from '@/selectors/proof'
import { clearFilters, selectNote } from '@/state/commands/proof'

/** A chip as wide as the longest label it can show (in characters, from the data), so a changed decision or type never moves the cells around it. */
const chipCh = (ch: number): CSSProperties => ({ ['--ch' as string]: ch } as CSSProperties)

/** The list of notes; in "all chapters" it is grouped by chapter. */
export function NotesTable({ data, rows, total, all, sel }: { data: BookData; rows: ProofNote[]; total: number; all: boolean; sel: number | null }) {
  const body = useRef<HTMLTableSectionElement>(null)
  const counts = useMemo(() => takeCounts(data, rows), [data, rows])
  useEffect(() => { body.current?.querySelector('tr[aria-selected="true"]')?.scrollIntoView?.({ block: 'nearest' }) }, [sel])
  if (!rows.length) {
    return total
      ? <div className="empty"><h3>No notes match</h3><Btn id="clearf" data-f="all" onClick={clearFilters}>Clear filters</Btn></div>
      : <div className="empty"><h3>No notes for this chapter</h3></div>
  }
  const anchor = rows.some((r) => r.id === sel) ? sel : rows[0].id
  const tr = (r: ProofNote) => (
    <tr key={r.id} tabIndex={r.id === anchor ? 0 : -1} data-r={r.id} aria-selected={r.id === sel}
      onClick={() => selectNote(r.id, true)} onKeyDown={(e) => { if (e.key === 'Enter') selectNote(r.id, true) }}>
      <td className="mono">{r.t}</td>
      <td><span className={'type fixedchip t-' + r.ty} style={chipCh(TYPE_CHIP_CH)}>{r.ty}</span></td>
      <td>{r.h}{counts.has(r.id) ? <> <span className="tkb" data-takes={counts.get(r.id)}>{counts.get(r.id)} takes</span></> : null}</td>
      <td className="sub" title={r.conf == null ? r.confReason : undefined}>{r.from}{r.conf != null ? ' · ' + r.conf.toFixed(2) : ''}</td>
      <td>{r.res ? <span className={'pill fixedchip ' + RES_CLASS[r.res]} style={chipCh(RES_CHIP_CH)}>{RES_LABEL[r.res]}</span> : <span className="pill fixedchip neutral" style={chipCh(RES_CHIP_CH)}>{TO_REVIEW_LABEL}</span>}</td>
    </tr>
  )
  const groups = all ? data.chapters.filter((c) => rows.some((r) => r.chapterId === c.id)) : [null]
  return (
    <table>
      <thead><tr><th>Time</th><th>Type</th><th>Script vs heard</th><th>From</th><th>Resolution</th></tr></thead>
      <tbody ref={body}>
        {groups.map((g) => g ? [
          <tr key={'g' + g.id} className="grprow"><td colSpan={5}><b>{chName(data, g)}</b> <span className="sub">· {rows.filter((r) => r.chapterId === g.id && isOpenNote(data, r)).length} open</span></td></tr>,
          ...rows.filter((r) => r.chapterId === g.id).map(tr),
        ] : rows.map(tr))}
      </tbody>
    </table>
  )
}
