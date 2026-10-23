import { Checkbox } from '../../primitives/Checkbox';
import { IconButton } from '../../primitives/IconButton';
import { StatusBadge } from '../../primitives/StatusBadge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../primitives/Table';
import { clock } from '../bar/clock';
import { actionText, measureText, opSpec, type CleanupKind, type CleanupParams } from './cleanupOps';
import { selectedRows, type CleanupRow } from './cleanupRows';
import { PREVIEW_AROUND } from './usePreviewPlay';

const NO_FINDINGS = 'No finding passes these thresholds.';

/**
 * The findings of the chosen operation in time order, each with its kind, the fix the page proposes and Play (the finding with two seconds
 * either side); a done one is marked Fixed. Without `onPlay`, Play is off with `playReason`.
 */
export function CleanupList({
  kind,
  rows,
  params,
  skip,
  onToggle,
  onToggleAll,
  onPlay,
  playReason,
}: {
  kind: CleanupKind;
  rows: readonly CleanupRow[];
  params: CleanupParams;
  skip: readonly string[];
  onToggle: (key: string, on: boolean) => void;
  onToggleAll: (keys: string[], on: boolean) => void;
  onPlay?: (row: CleanupRow) => void;
  playReason?: string;
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
            <TableHeader align="left">Kind</TableHeader>
            <TableHeader align="left">Measured</TableHeader>
            <TableHeader align="left">Proposed</TableHeader>
            <TableHeader align="left" hiddenLabel="Play" />
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
              <TableCell>{opSpec(kind).noun[0]}</TableCell>
              <TableCell numeric align="left">
                {measureText(kind, r)}
              </TableCell>
              <TableCell>{r.done ? <StatusBadge tone="success" label="Fixed" /> : actionText(kind, params)}</TableCell>
              <TableCell>
                <IconButton
                  action="play"
                  size="sm"
                  label={`Play ${clock(r.sec)} with ${PREVIEW_AROUND} s before and after`}
                  data-rplay={r.key}
                  disabledReason={onPlay ? undefined : playReason}
                  onClick={() => onPlay?.(r)}
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </>
  );
}
