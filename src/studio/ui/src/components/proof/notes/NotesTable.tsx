import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { Button } from '../../primitives/Button';
import { statusTone } from '../../../kinds/statusTone';
import { KindChip } from '../../primitives/KindChip';
import { KindMark } from '../../primitives/KindMark';
import { StatusBadge } from '../../primitives/StatusBadge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../primitives/Table';
import { TooltipTarget } from '../../primitives/Tooltip';
import { NOTE_KIND, RESOLUTION_CHIP_CH, TYPE_CHIP_CH, groupByChapter, type NoteRow } from './noteRows';

/** A badge as wide as the longest word it can show, so a changed type or decision never moves the cells around it. */
function FixedChip({ ch, children }: { ch: number; children: ReactNode }) {
  return (
    <span className="inline-flex" style={{ minWidth: `${ch + 1}ch` }}>
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

/** The note's headline sentence with the words in question marked in the note's kind (the mark is the registry's, never drawn here). */
function Headline({ row }: { row: NoteRow }) {
  const kind = NOTE_KIND[row.type];
  const quoted = `“${row.marked}”`;
  const at = row.marked === '' ? -1 : row.headline.indexOf(quoted);
  if (at < 0 || !kind) return <>{row.headline}</>;
  return (
    <>
      {row.headline.slice(0, at + 1)}
      <KindMark kind={kind}>{row.marked}</KindMark>
      {row.headline.slice(at + quoted.length - 1)}
    </>
  );
}

/** The mock's From cell: the analyzer with its confidence, or the reason on hover when there is no score. The source never breaks inside
 * its name, and the score stays with its separator, so a narrow column never starts a line with "· 0.90". */
function FromCell({ row }: { row: NoteRow }) {
  if (row.confidence !== null)
    return (
      <>
        <span className="whitespace-nowrap">{row.from}</span> <span className="whitespace-nowrap">· {row.confidence.toFixed(2)}</span>
      </>
    );
  return <TooltipTarget text={row.confidenceReason || 'No score'}>{row.from}</TooltipTarget>;
}

/** The columns' widths: Script vs heard takes what the others leave, so a sentence wraps only when that column is full, and the columns
 * stand in the same place in every chapter and filter (alignment audit XPF-4). */
const NOTE_COLUMNS = ['5.25rem', '6rem', 'auto', '11rem', '8.5rem'] as const;

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
  /** Drawn after the headline (the takes badge). */
  badge?: (row: NoteRow) => ReactNode;
}) {
  const body = useRef<HTMLDivElement>(null);
  const anchor = rows.some((r) => r.id === selectedId) ? selectedId : (rows[0]?.id ?? null);

  // `TableRow` puts every row in the tab order; only the anchor row stays there.
  useLayoutEffect(() => {
    body.current?.querySelectorAll<HTMLElement>('tbody tr[data-row]').forEach((tr, i) => {
      tr.tabIndex = rows[i]?.id === anchor ? 0 : -1;
    });
  });

  // The selected row scrolls into view when the selection (or whether its row is listed) changes, not on every render: a re-render
  // while a menu is open (the chapter stepper's) must not drag the page back to the row.
  const selectedListed = rows.some((r) => r.id === selectedId);
  useLayoutEffect(() => {
    body.current?.querySelector('tr[aria-selected="true"]')?.scrollIntoView?.({ block: 'nearest' });
  }, [selectedId, selectedListed]);

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
        <h3 className="text-base font-semibold">{allChapters ? 'No notes yet' : 'No notes for this chapter'}</h3>
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
        <span className="flex items-center gap-2">
          <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">
            <Headline row={row} />
          </span>
          {badge?.(row)}
        </span>
      </TableCell>
      <TableCell muted>
        <FromCell row={row} />
      </TableCell>
      <TableCell>
        <FixedChip ch={RESOLUTION_CHIP_CH}>
          <StatusBadge
            tone={row.resolution.tone}
            // An undecided note's pill is drawn hollow, so it still shows on the selected row's fill (R3PF-10); a decision keeps its fill.
            look={row.decided ? 'soft' : 'outline'}
            label={row.resolution.label}
            className="w-full justify-center text-[13px]!"
          />
        </FixedChip>
      </TableCell>
    </TableRow>
  );

  return (
    <div ref={body}>
      <Table label="Notes" columns={NOTE_COLUMNS} className="min-w-[40rem]">
        <TableHead sticky>
          <TableRow>
            <TableHeader align="right">Time</TableHeader>
            <TableHeader>Type</TableHeader>
            <TableHeader>Script vs heard</TableHeader>
            <TableHeader>From</TableHeader>
            <TableHeader>Resolution</TableHeader>
          </TableRow>
        </TableHead>
        <TableBody>
          {allChapters
            ? groupByChapter(rows).flatMap((group) => [
                <TableRow key={`g-${group.chapterId}`}>
                  <TableCell colSpan={5} className="bg-[var(--surface-2)]">
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
