import { useState } from 'react';
import type { ProductionMilestone } from '../../api/contracts/production';
import { DateField } from '../primitives/DateField';
import { Icon } from '../primitives/Icon';
import { IconButton } from '../primitives/IconButton';
import { statusTone, type StatusId } from '../../kinds/statusTone';
import { StatusBadge } from '../primitives/StatusBadge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../primitives/Table';
import { TooltipTarget } from '../primitives/Tooltip';
import { fmtIso, isIsoDate } from './dates';
import { measureText } from './measures';
import { milestoneStatus, type MilestoneStatus, type ScheduleChapter } from './progress';

const STATUS_ID: Record<MilestoneStatus['kind'], StatusId> = { done: 'done', ok: 'on_track', risk: 'at_risk', late: 'late', none: 'no_estimate' };

/** A status as a small cell: the value is short ("+3 d", a date, a check, a dash) and the sentence is its name and its tooltip. */
function StatusCell({ status, finalRow = false }: { status: MilestoneStatus; finalRow?: boolean }) {
  return (
    <TooltipTarget text={status.sentence}>
      <span role="img" aria-label={status.sentence} data-status={status.kind} data-final-status={finalRow ? '' : undefined}>
        <StatusBadge shape="cell" tone={statusTone(STATUS_ID[status.kind])} label={status.short} />
      </span>
    </TooltipTarget>
  );
}

/** The Final delivery status while the book has no due date: a pace cannot be judged, and the cell says so instead of staying blank. */
const NO_DUE: MilestoneStatus = { kind: 'none', sentence: 'No due date yet. Set one to see if you are on pace.', short: 'No date' };

export type MilestoneTableProps = {
  milestones: readonly ProductionMilestone[];
  chapters: readonly ScheduleChapter[];
  today: Date;
  /** The book's due date, "YYYY-MM-DD", or null while none is set. */
  due: string | null;
  onToggleDone: (index: number) => void;
  onEdit: (index: number, focus?: 'note') => void;
  onRemove: (index: number) => void;
  /** Called with the text the narrator committed (Enter or leaving the field); an empty one clears the due date. */
  onDueChange: (date: string) => void | Promise<unknown>;
};

/**
 * The milestones, read-only (the mock's Schedule table): each row says what it measures as its value, has a status cell, a done toggle that
 * carries its state, and a note, edit and remove button. Rows run by date; a row is named by its place in the stored list, which is what
 * the host saves. The last row is the book's own due date. Nothing in a milestone row is an input: the dialog edits.
 */
export function MilestoneTable({ milestones, chapters, today, due, onToggleDone, onEdit, onRemove, onDueChange }: MilestoneTableProps) {
  const rows = milestones
    .map((m, index) => ({ m, index }))
    .sort((a, b) => (a.m.dueDate < b.m.dueDate ? -1 : a.m.dueDate > b.m.dueDate ? 1 : a.index - b.index));
  const final = due ? milestoneStatus({ dueDate: due, measure: 'all' }, chapters, today) : null;
  return (
    /* The table keeps its width and scrolls inside its own card, with the edge shadow that says there is more, instead of spilling out of the card on a narrow window. */
    <div className={`scroll-x-edges overflow-x-auto ${MEASURES_WIDTH}`} tabIndex={0} role="group" aria-label="Milestones scroll area">
      <Table label="Milestones" flush columns={COLUMNS} className="min-w-[34.5rem] lg:min-w-[44.5rem]">
        <TableHead>
          <TableRow>
            <TableHeader>Milestone</TableHeader>
            <TableHeader className={NARROW_HIDDEN}>Measures</TableHeader>
            <TableHeader>Due</TableHeader>
            <TableHeader>Status</TableHeader>
            <TableHeader hiddenLabel="Actions" />
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map(({ m, index }) => (
            <TableRow key={index}>
              <TableCell>
                <NameBlock name={m.name} measure={measureText(m.measure)} data={{ 'data-name': String(index) }} />
              </TableCell>
              <TableCell className={NARROW_HIDDEN}>
                <span data-measure={index}>{measureText(m.measure)}</span>
              </TableCell>
              <TableCell numeric align="left">
                {fmtIso(m.dueDate, today)}
              </TableCell>
              <TableCell>
                <StatusCell status={milestoneStatus(m, chapters, today)} />
              </TableCell>
              <TableCell align="right">
                {/* The done toggle leads the row's buttons, 8 px apart, so the Milestone column starts at the card title for every row, the Final one too. */}
                <span className="inline-flex gap-2">
                  <IconButton label={`Mark ${m.name} complete`} aria-pressed={Boolean(m.done)} data-done={index} onClick={() => onToggleDone(index)}>
                    <Icon name={m.done ? 'markedDone' : 'markDone'} />
                  </IconButton>
                  <TooltipTarget text={m.note ?? 'Add a note'}>
                    <IconButton
                      label={m.note ? `Edit the note on ${m.name}` : `Add a note to ${m.name}`}
                      data-note={index}
                      onClick={() => onEdit(index, 'note')}
                    >
                      <Icon name="addNote" />
                    </IconButton>
                  </TooltipTarget>
                  <IconButton action="edit" label={`Edit ${m.name}`} data-edit={index} onClick={() => onEdit(index)} />
                  <IconButton action="remove" variant="danger" label={`Remove ${m.name}`} data-remove={index} onClick={() => onRemove(index)} />
                </span>
              </TableCell>
            </TableRow>
          ))}
          {rows.length === 0 && (
            // A card holding only the Final row says the rest is "none yet" and how to add one (XSH-17).
            <TableRow>
              <TableCell colSpan={COLUMNS.length} className="text-[var(--text-muted)]">
                <span data-milestones-empty>No other milestones yet. Add one with +.</span>
              </TableCell>
            </TableRow>
          )}
          <TableRow>
            <TableCell>
              <NameBlock name="Final delivery" measure={WHOLE_BOOK} />
            </TableCell>
            <TableCell className={NARROW_HIDDEN}>
              <span data-measure-final>{WHOLE_BOOK}</span>
            </TableCell>
            <TableCell>
              <DueField value={due ?? ''} onCommit={onDueChange} />
            </TableCell>
            <TableCell>
              <StatusCell status={final ?? NO_DUE} finalRow />
            </TableCell>
            <TableCell />
          </TableRow>
        </TableBody>
      </Table>
    </div>
  );
}

const WHOLE_BOOK = 'Whole book';

// Fixed columns (alignment audit XSH-3): only Milestone takes what is left, so Due and Status stand at the same x in every state
// whatever the milestones are called. Due is the mock's 152 px; Actions holds four 36 px buttons 8 px apart.
// Below 1024 px Measures folds to nothing and its words move under the name (R4SM-13), so Due and Status stay on screen.
const COLUMNS = ['auto', 'var(--ms-measures)', '9.5rem', '6rem', '12rem'] as const;
const MEASURES_WIDTH = '[--ms-measures:0px] lg:[--ms-measures:9rem]';
// A folded column keeps its cells for a screen reader (the copy under the name is hidden from it) but draws nothing.
const NARROW_HIDDEN = 'max-lg:overflow-hidden max-lg:p-0 max-lg:whitespace-nowrap max-lg:text-transparent';

/**
 * A milestone's name, at most two lines with the whole name on hover and in the dialog (R3SH-7: a 200-character word made one row five
 * lines tall), and under it, below 1024 px only, what it measures in the same size.
 */
function NameBlock({ name, measure, data }: { name: string; measure: string; data?: Record<`data-${string}`, string> }) {
  return (
    <>
      <TooltipTarget text={name} className="max-w-full">
        <b {...data} dir="auto" className="line-clamp-2 [overflow-wrap:anywhere]">
          {name}
        </b>
      </TooltipTarget>
      <span aria-hidden="true" className="block text-[var(--text-muted)] lg:hidden">
        {measure}
      </span>
    </>
  );
}

/**
 * The due date, a native date field. A whole, real date is committed as soon as it is written or picked. A part-written one waits and leaving the field drops it;
 * Enter on an emptied field clears the due date, so deleting one part of the date on the way to another never does.
 */
function DueField({ value, onCommit }: { value: string; onCommit: (date: string) => void | Promise<unknown> }) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <DateField
      label="Delivery due"
      // The cell's own width (the mock's 152 px less its 10 px padding each side). It reads as the column's text (R3SH-1, XSH-11): no frame or fill until
      // the pointer or focus is on it, the date in the column's 13 px mono, and its text pulled left onto the other rows' dates.
      className="-ml-2 w-[8.25rem] border-transparent! bg-transparent! px-2! text-[0.8125rem]! hover:border-[var(--line-strong)]! focus:border-[var(--line-strong)]!"
      value={draft ?? value}
      onChange={(text) => {
        setDraft(text);
        if (isIsoDate(text) && text !== value) void onCommit(text);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter' && draft === '' && value !== '') void onCommit('');
      }}
      onBlur={() => setDraft(null)}
    />
  );
}
