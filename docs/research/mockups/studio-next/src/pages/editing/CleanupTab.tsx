import { capsOf, editGateOf } from '@/selectors/daw'
import { useEffect, useRef } from 'react'
import type { BookData } from '@/domain/schemas'
import { clock } from '@/format/time'
import {
  CLEANUP_OPS, EDIT_TEXT, LEVELS, actionText, measureText, opSpec, selectedRows, type CleanupKind, type CleanupRow, type Level,
} from '@/selectors/editing'
import { activeLimits } from '@/selectors/progress'
import { LIMIT_KEYS, limText, masterRowFor } from '@/selectors/master'
import type { MockState } from '@/state/slices/mock'
import type { EditingUi } from '@/state/slices/ui'
import { applyCleanup, playRow, previewCleanup, selectRow, setAdvanced, setLevel, setOp, setParam, setRows, toggleRow } from '@/state/commands/editing'
import { Checkbox, FieldRow, IconButton, NumberInput, Pill, Seg } from '@/ui/primitives'

/** The operation filter and the findings of the chosen one, each with the fix the page proposes. */
export function CleanupHeader({ counts, op }: { counts: Record<CleanupKind, number>; op: CleanupKind }) {
  return (
    <div className="filters" role="group" aria-label="Kind of finding">
      {CLEANUP_OPS.map((o) => (
        <button key={o.kind} type="button" className="chip" data-op={o.kind} aria-pressed={op === o.kind} onClick={() => setOp(o.kind)}>{o.label} {counts[o.kind]}</button>
      ))}
    </div>
  )
}

export function CleanupList({ kind, rows, ed }: { kind: CleanupKind; rows: CleanupRow[]; ed: EditingUi }) {
  const params = ed.params[kind]
  const body = useRef<HTMLTableSectionElement>(null)
  useEffect(() => { body.current?.querySelector('tr[aria-selected="true"]')?.scrollIntoView?.({ block: 'nearest' }) }, [ed.row])
  if (!rows.length) return <div className="empty"><h3>{EDIT_TEXT.noFindings}</h3></div>
  const open = rows.filter((r) => !r.done)
  const on = selectedRows(rows, ed.skip)
  return (
    <table>
      <thead>
        <tr>
          <th style={{ width: 36 }}>
            <Checkbox id="call" aria-label="Select every finding" checked={!!open.length && on.length === open.length} indeterminate={on.length > 0 && on.length < open.length}
              disabled={!open.length} onCheckedChange={(c) => setRows(open.map((r) => r.key), c)} />
          </th>
          <th>Time</th><th>Kind</th><th>Measured</th><th>Proposed</th><th><span className="sr">Play</span></th>
        </tr>
      </thead>
      <tbody ref={body}>
        {rows.map((r) => (
          <tr key={r.key} data-row={r.key} aria-selected={r.key === ed.row} className={r.done ? 'done' : undefined} tabIndex={r.key === (ed.row ?? rows[0].key) ? 0 : -1}
            onClick={(e) => { if (!(e.target as HTMLElement).closest('button,input,[role="checkbox"]')) selectRow(r.key, r.sec) }}>
            <td><Checkbox data-inc={r.key} aria-label={'Include ' + clock(r.sec)} checked={!r.done && !ed.skip.includes(r.key)} disabled={r.done} onCheckedChange={(c) => toggleRow(r.key, c)} /></td>
            <td className="mono">{clock(r.sec)}</td>
            <td><span className={'type t-' + r.ty}>{opSpec(kind).noun[0]}</span></td>
            <td className="mono">{measureText(kind, r)}</td>
            <td>{r.done ? <Pill kind="ok">Fixed</Pill> : actionText(kind, params)}</td>
            <td><IconButton icon="play" tip={'Play ' + clock(r.sec) + ' with 2 s before and after'} data-rplay={r.key} onClick={() => playRow(r)} /></td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/** Light, Standard or Heavy, the thresholds behind them, and Preview and Apply for the selected findings. */
export function CleanupInspector({ data, chapterId, kind, rows, ed, setup }: { data: BookData; chapterId: string; kind: CleanupKind; rows: CleanupRow[]; ed: EditingUi; setup: MockState['setup'] }) {
  const spec = opSpec(kind)
  const params = ed.params[kind]
  const on = selectedRows(rows, ed.skip)
  const edit = editGateOf({ setup }, 'cleanup')
  const fixed = rows.filter((r) => r.done).length
  const mrow = kind === 'noise' ? masterRowFor(data, chapterId) : undefined
  const limits = activeLimits(data)
  return (
    <div className="dr-insp">
      <div className="ph">
        <h2>{spec.label}</h2>
        <span className="sub">{rows.length - fixed} to fix{fixed ? ' · ' + fixed + ' fixed' : ''}</span>
      </div>
      <div className="pb stack">
        <span className="label">Strength</span>
        <Seg<Level | 'custom'> label="Strength" value={ed.level[kind] ?? 'custom'} options={LEVELS} onChange={(v) => { if (v !== 'custom') setLevel(kind, v) }} />
        <details className="adv" open={ed.advanced} onToggle={(e) => setAdvanced(e.currentTarget.open)}>
          <summary>Advanced</summary>
          <div className="stack" style={{ marginTop: 10 }}>
            {spec.fields.map((f) => (
              <FieldRow key={f.key} label={f.label + ' (' + f.unit + ')'} htmlFor={'adv-' + f.key}>
                <NumberInput id={'adv-' + f.key} value={params[f.key] ?? 0} min={f.min} max={f.max} step={f.step} onValueChange={(v) => setParam(kind, f.key, v)} />
              </FieldRow>
            ))}
          </div>
        </details>
        {mrow ? (
          <div className="stack" style={{ gap: 4 }}>
            <span className="label">Chapter measurements</span>
            {LIMIT_KEYS.filter((k) => (k === 'nf' || k === 'head' || k === 'tail') && mrow[k] != null).map((k) => (
              <div className="optrow" key={k}><span>{limits[k].l}</span><span className="mono">{mrow[k]} {limits[k].u} <span className="sub">({limText(limits, k)})</span></span></div>
            ))}
          </div>
        ) : null}
        <div className="row">
          <IconButton icon="play" tip="Preview the selected findings" id="cprev" disabled={!on.length} onClick={() => previewCleanup(kind)} />
          <span className="spacer" />
          <button type="button" className="btn primary" id="capply" disabled={!edit.ok || !on.length} onClick={() => applyCleanup(kind)}>Apply to {on.length} selected</button>
        </div>
        {edit.ok || !capsOf({ setup }).reachable ? null : <div className="sub" id="cleanupnote">{edit.reason}</div>}
      </div>
    </div>
  )
}
