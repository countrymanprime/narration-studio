import { useState } from 'react';
import type { ProductionMilestone } from '../../api/contracts/production';
import { Icon } from '../primitives/Icon';
import { IconButton } from '../primitives/IconButton';
import { StatusBadge, type StatusTone } from '../primitives/StatusBadge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../primitives/Table';
import { TextField } from '../primitives/TextField';
import { TooltipTarget } from '../primitives/Tooltip';
import { fmtIso } from './dates';
import { measureText } from './measures';
import { milestoneStatus, type MilestoneStatus, type ScheduleChapter } from './progress';

const STATUS_TONE: Record<MilestoneStatus['kind'], StatusTone> = { done: 'success', ok: 'success', risk: 'warning', late: 'danger', none: 'neutral' };

/** A status as a small cell: the value is short ("+3 d", a date, a check, a dash) and the sentence is its name and its tooltip. */
function StatusCell({ status, finalRow = false }: { status: MilestoneStatus; finalRow?: boolean }) {
  return (
    <TooltipTarget text={status.sentence}>
      <span role="img" aria-label={status.sentence} data-status={status.kind} data-final-status={finalRow ? '' : undefined}>
        <StatusBadge shape="cell" tone={STATUS_TONE[status.kind]} label={status.short} />
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
    <Table label="Milestones" flush>
      <TableHead>
        <TableRow>
          <TableHeader hiddenLabel="Done" />
          <TableHeader className="min-w-[10rem]">Milestone</TableHeader>
          {/* The mock's column sizes: Measures keeps room for "All recorded" on one line, and Due is a date wide (152 px) whatever a milestone is called. */}
          <TableHeader className="md:min-w-[9rem]">Measures</TableHeader>
          <TableHeader className="w-[9.5rem]">Due</TableHeader>
          <TableHeader>Status</TableHeader>
          <TableHeader hiddenLabel="Actions" />
        </TableRow>
      </TableHead>
      <TableBody>
        {rows.map(({ m, index }) => (
          <TableRow key={index}>
            <TableCell>
              <IconButton label={`Mark ${m.name} complete`} aria-pressed={Boolean(m.done)} data-done={index} onClick={() => onToggleDone(index)}>
                <Icon name={m.done ? 'markedDone' : 'markDone'} />
              </IconButton>
            </TableCell>
            <TableCell>
              <b data-name={index} dir="auto" className="[overflow-wrap:anywhere]">
                {m.name}
              </b>
            </TableCell>
            <TableCell>
              <span data-measure={index}>{measureText(m.measure)}</span>
            </TableCell>
            <TableCell numeric align="left">
              {fmtIso(m.dueDate, today)}
            </TableCell>
            <TableCell>
              <StatusCell status={milestoneStatus(m, chapters, today)} />
            </TableCell>
            <TableCell align="right">
              <span className="inline-flex gap-0.5">
                <TooltipTarget text={m.note ?? 'Add a note'}>
                  <IconButton label={m.note ? `Edit the note on ${m.name}` : `Add a note to ${m.name}`} data-note={index} onClick={() => onEdit(index, 'note')}>
                    <Icon name="addNote" />
                  </IconButton>
                </TooltipTarget>
                <IconButton action="edit" label={`Edit ${m.name}`} data-edit={index} onClick={() => onEdit(index)} />
                <IconButton action="remove" variant="danger" label={`Remove ${m.name}`} data-remove={index} onClick={() => onRemove(index)} />
              </span>
            </TableCell>
          </TableRow>
        ))}
        <TableRow>
          <TableCell />
          <TableCell>
            <b>Final delivery</b>
          </TableCell>
          <TableCell muted>Whole book</TableCell>
          {/* The mock's 152 px column: a long milestone name must not take the room the date field needs. */}
          <TableCell className="min-w-[9.5rem]">
            <DueField value={due ?? ''} onCommit={onDueChange} />
          </TableCell>
          <TableCell>
            <StatusCell status={final ?? NO_DUE} finalRow />
          </TableCell>
          <TableCell />
        </TableRow>
      </TableBody>
    </Table>
  );
}

/** The due date, committed when focus leaves or on Enter. It is written "YYYY-MM-DD", as the plan stores it. */
function DueField({ value, onCommit }: { value: string; onCommit: (date: string) => void | Promise<unknown> }) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft !== null && draft.trim() !== value) onCommit(draft.trim());
    setDraft(null);
  };
  return (
    <TextField
      label="Delivery due"
      mono
      placeholder="YYYY-MM-DD"
      value={draft ?? value}
      onChange={setDraft}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur();
      }}
    />
  );
}
