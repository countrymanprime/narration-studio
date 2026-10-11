import { useMemo } from 'react';
import { useContextProvider, type ContextProvider } from '../../../registries/context';
import type { DeliveryProfile, MeasureFileResult } from '../../../types';
import { Panel } from '../../primitives/Panel';
import { StatusBadge } from '../../primitives/StatusBadge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../primitives/Table';
import type { FileActions } from './FileActions';
import { buildRows, type Cell, type FileRow } from './rows';
import { useDawGates } from './useDawGates';
import { useMasterSelection } from './useMasterSelection';

/** The file a right-click landed on: the marker in the row's first cell. */
const fileIdOf = (target: Element): string | null => target.closest('tr')?.querySelector('[data-file]')?.getAttribute('data-file') ?? null;

const DANGER = { color: 'var(--danger-text)' };

/** A measured value; one the profile's rule did not meet is red, bold, marked with a cross and said in words for a screen reader. */
function Value({ cell }: { cell: Cell | undefined }) {
  if (!cell) return null;
  return (
    <span className={cell.missed ? 'font-semibold' : undefined} style={cell.missed ? DANGER : undefined}>
      {cell.missed && <span aria-hidden="true">✕ </span>}
      {cell.text}
      {cell.missed && <span className="sr-only"> (not met)</span>}
    </span>
  );
}

function Result({ row }: { row: FileRow }) {
  if (row.waiting) return <StatusBadge tone="neutral" label={row.waitingPill ?? 'Waiting'} />;
  if (row.verdict === 'fail') return <StatusBadge tone="danger" label="Fail" icon="✕" />;
  if (row.verdict === 'pass') return <StatusBadge tone="success" label="Pass" />;
  return <StatusBadge tone="neutral" label="Not judged" />;
}

/**
 * Master & QC's per-file checks (the Studio Next mock's Master page): one row per file, each level red when the profile's rule on
 * it was not met, the Result column in words, and a row with no measurements saying what it waits on ("<reason> · not mastered").
 * The caller owns which file is selected (it is the shared chapter). Right-click on a row offers its checks through the context
 * provider; the actions themselves are the page's (`FileActions`).
 */
export function FilesTable({
  files,
  profile,
  selected,
  onSelect,
  actions,
}: {
  files: readonly MeasureFileResult[];
  profile: DeliveryProfile;
  selected: string | undefined;
  onSelect: (fileId: string) => void;
  actions: FileActions;
}) {
  const rows = useMemo(() => buildRows(files, profile), [files, profile]);
  const { current, bind, onKeyDown } = useMasterSelection({ rows, selected, onSelect });
  const gates = useDawGates();

  const provider = useMemo<ContextProvider>(
    () => ({
      match: (target) => fileIdOf(target) !== null,
      items: (target) => {
        const row = rows.find((candidate) => candidate.id === fileIdOf(target));
        if (!row) return [];
        return [
          { key: 'show', label: 'Show the checks', onSelect: () => onSelect(row.id) },
          {
            key: 'play',
            label: 'Play the quietest 5 s',
            unavailable: row.waiting ? 'This file is not mastered yet.' : gates.play.ok ? undefined : gates.play.reason,
            onSelect: () => actions.onPlayQuietest(row.id),
          },
          {
            key: 'open',
            label: `Open in ${gates.dawName}`,
            unavailable: gates.open.ok ? undefined : gates.open.reason,
            onSelect: () => actions.onOpenInDaw(row.id),
          },
          { key: 'recheck', label: 'Check the files again', unavailable: gates.recheck.ok ? undefined : gates.recheck.reason, onSelect: actions.onRecheck },
        ];
      },
    }),
    [rows, gates, actions, onSelect],
  );
  useContextProvider(provider);

  return (
    <Panel flush label="Per-file checks">
      {/* The keys sit on the wrapper: a row's own Enter and Space come from `TableRow`, the arrows from here. */}
      <div ref={bind} onKeyDown={onKeyDown} className="overflow-x-auto">
        <Table label="Per-file checks">
          <TableHead>
            <TableRow>
              <TableHeader>File</TableHeader>
              <TableHeader align="right">Length</TableHeader>
              <TableHeader align="right">RMS</TableHeader>
              <TableHeader align="right">Peak</TableHeader>
              <TableHeader align="right">Noise floor</TableHeader>
              <TableHeader align="right">Head / tail</TableHeader>
              <TableHeader align="right">Result</TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((row) => (
              <FileTableRow key={row.id} row={row} selected={row.id === current} onSelect={onSelect} />
            ))}
          </TableBody>
        </Table>
      </div>
    </Panel>
  );
}

function FileTableRow({ row, selected, onSelect }: { row: FileRow; selected: boolean; onSelect: (id: string) => void }) {
  return (
    <TableRow onActivate={() => onSelect(row.id)} selected={selected}>
      <TableCell className="[overflow-wrap:anywhere]">
        {/* The marker the right-click provider reads: a row's own attributes are the primitive's. */}
        <span data-file={row.id} className="contents" />
        {row.name}
      </TableCell>
      {row.waiting ? (
        <>
          <TableCell numeric>—</TableCell>
          <TableCell colSpan={4} muted>
            {row.waiting} · not mastered
          </TableCell>
        </>
      ) : (
        <>
          <TableCell numeric>{row.length}</TableCell>
          <TableCell numeric>
            <Value cell={row.rms} />
          </TableCell>
          <TableCell numeric>
            <Value cell={row.peak} />
          </TableCell>
          <TableCell numeric>
            <Value cell={row.noiseFloor} />
          </TableCell>
          <TableCell numeric>
            <Value cell={row.head} /> / <Value cell={row.tail} />
          </TableCell>
        </>
      )}
      <TableCell align="right">
        <Result row={row} />
      </TableCell>
    </TableRow>
  );
}
