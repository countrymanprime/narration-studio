import { Checkbox } from '../../primitives/Checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../primitives/Table';
import { clock } from '../bar/clock';
import { actionText, measureText, opSpec, type CleanupKind, type CleanupParams } from './cleanupOps';
import { selectedRows, type CleanupRow } from './cleanupRows';

const NO_FINDINGS = 'No finding passes these thresholds.';

/** The findings of the chosen operation in time order, each with the fix the page proposes; a done one is struck as Fixed. */
export function CleanupList({
  kind,
  rows,
  params,
  skip,
  onToggle,
  onToggleAll,
}: {
  kind: CleanupKind;
  rows: readonly CleanupRow[];
  params: CleanupParams;
  skip: readonly string[];
  onToggle: (key: string, on: boolean) => void;
  onToggleAll: (keys: string[], on: boolean) => void;
}) {
  if (!rows.length) return <p className="m-0 p-3 text-[var(--text-muted)]">{NO_FINDINGS}</p>;
  const open = rows.filter((r) => !r.done);
  const on = selectedRows(rows, skip);
  return (
    <>
      <div className="px-3 pt-2">
        <Checkbox
          checked={!!open.length && on.length === open.length}
          disabled={!open.length}
          onChange={(c) =>
            onToggleAll(
              open.map((r) => r.key),
              c,
            )
          }
        >
          Select every finding
        </Checkbox>
      </div>
      <Table label={`${opSpec(kind).label} found`}>
        <TableHead>
          <TableRow>
            <TableHeader align="left">Time</TableHeader>
            <TableHeader align="left">Measured</TableHeader>
            <TableHeader align="left">Proposed</TableHeader>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.key} className={r.done ? 'opacity-60' : undefined}>
              <TableCell numeric align="left">
                <Checkbox checked={!r.done && !skip.includes(r.key)} disabled={r.done} onChange={(c) => onToggle(r.key, c)}>
                  <span data-row={r.key}>{clock(r.sec)}</span>
                </Checkbox>
              </TableCell>
              <TableCell numeric align="left">
                {measureText(kind, r)}
              </TableCell>
              <TableCell>{r.done ? <span className="text-[var(--text-muted)]">Fixed</span> : actionText(kind, params)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </>
  );
}
