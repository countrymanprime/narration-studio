import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { Button } from '../../primitives/Button';
import { statusTone } from '../../../kinds/statusTone';
import { KindChip } from '../../primitives/KindChip';
import { Markup } from '../inspector/Markup';
import { StatusBadge } from '../../primitives/StatusBadge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../primitives/Table';
import { TooltipTarget } from '../../primitives/Tooltip';
import { NOTE_KIND, RESOLUTION_CHIP_CH, TYPE_CHIP_CH, groupByChapter, type NoteRow } from './noteRows';

/** A badge as wide as the longest word it can show, so a changed type or decision never moves the cells around it. */
function FixedChip({ ch, children }: { ch: number; children: ReactNode }) {
  return (
    <span className="inline-flex" style={{ minWidth: `${ch + 4}ch` }}>
      {children}
    </span>
  );
}

/** A note's type chip: the kind's own chip, or a neutral tag for a take comparison, which has no hue. */
function TypeChip({ row }: { row: NoteRow }) {
  const kind = NOTE_KIND[row.type];
  return (
    <FixedChip ch={TYPE_CHIP_CH}>
      {kind ? (
        <KindChip kind={kind} label={row.type} className="w-full justify-center" />
      ) : (
        <StatusBadge tone={statusTone('muted')} shape="tag" label={row.type} className="w-full justify-center" />
      )}
    </FixedChip>
  );
}

/** The mock's From cell: the analyzer with its confidence, or the reason on hover when there is no score. */
function FromCell({ row }: { row: NoteRow }) {
  if (row.confidence !== null) return <>{`${row.from} · ${row.confidence.toFixed(2)}`}</>;
  return <TooltipTarget text={row.confidenceReason || 'No score'}>{row.from}</TooltipTarget>;
}

/**
 * The Proof notes table (Studio Next mock `NotesTable`): Time, Type, Script vs heard, From, Resolution. In all chapters it is
 * grouped by chapter with "<n> open". Type and resolution chips are as wide as their longest word so a decision never moves a cell.
 * One row is in the tab order; the rest are reached with the arrow keys the panel handles.
 */
export function NotesTable({
  rows,
  total,
  allChapters,
  selectedId,
  onSelect,
  onClearFilters,
  badge,
}: {
  rows: readonly NoteRow[];
  /** Notes before any filter: tells "No notes match" from "No notes for this chapter". */
  total: number;
  allChapters: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onClearFilters: () => void;
  /** Drawn after the "heard" text (SN-Q7's takes badge); this slice draws none. */
  badge?: (row: NoteRow) => ReactNode;
}) {
  const body = useRef<HTMLDivElement>(null);
  const anchor = rows.some((r) => r.id === selectedId) ? selectedId : (rows[0]?.id ?? null);

  // `TableRow` puts every row in the tab order; only the anchor row stays there, and the selected row scrolls into view.
  useLayoutEffect(() => {
    body.current?.querySelectorAll<HTMLElement>('tbody tr[data-row]').forEach((tr, i) => {
      tr.tabIndex = rows[i]?.id === anchor ? 0 : -1;
    });
    body.current?.querySelector('tr[aria-selected="true"]')?.scrollIntoView?.({ block: 'nearest' });
  });

  if (rows.length === 0) {
    return total > 0 ? (
      <div className="flex flex-col items-center gap-3 p-8 text-center">
        <h3 className="text-base font-semibold">No notes match</h3>
        <Button variant="secondary" onClick={onClearFilters}>
          Clear filters
        </Button>
      </div>
    ) : (
      <div className="p-8 text-center">
        <h3 className="text-base font-semibold">No notes for this chapter</h3>
      </div>
    );
  }

  const noteRow = (row: NoteRow) => (
    <TableRow key={row.id} selected={row.id === selectedId} onActivate={() => onSelect(row.id)}>
      <TableCell numeric>{row.time}</TableCell>
      <TableCell>
        <TypeChip row={row} />
      </TableCell>
      <TableCell>
        <span className="[overflow-wrap:anywhere]">
          <Markup source={row.headline} />
        </span>
        {badge?.(row)}
      </TableCell>
      <TableCell muted>
        <FromCell row={row} />
      </TableCell>
      <TableCell>
        <FixedChip ch={RESOLUTION_CHIP_CH}>
          <StatusBadge tone={row.resolution.tone} label={row.resolution.label} className="w-full justify-center py-[0.2rem]! text-[0.8125rem]!" />
        </FixedChip>
      </TableCell>
    </TableRow>
  );

  return (
    <div ref={body}>
      <Table label="Notes" className="min-w-[40rem]">
        <TableHead sticky>
          <TableRow>
            <TableHeader>Time</TableHeader>
            <TableHeader>Type</TableHeader>
            <TableHeader>Script vs heard</TableHeader>
            <TableHeader>From</TableHeader>
            <TableHeader>Resolution</TableHeader>
          </TableRow>
        </TableHead>
        <TableBody>
          {allChapters
            ? groupByChapter(rows).flatMap((group) => [
                <TableRow key={`g-${group.chapterId}`} className="*:bg-[var(--surface-2)]">
                  <TableCell colSpan={5}>
                    <b>{group.title}</b> <span className="text-[var(--text-muted)]">· {group.open} open</span>
                  </TableCell>
                </TableRow>,
                ...group.rows.map(noteRow),
              ])
            : rows.map(noteRow)}
        </TableBody>
      </Table>
    </div>
  );
}
