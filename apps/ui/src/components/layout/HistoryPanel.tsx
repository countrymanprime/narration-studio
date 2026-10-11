import { useId } from 'react';
import type { Journal } from '../../studio/journal/createJournal';
import { useOverlay } from '../../overlay/OverlayProvider';
import type { OverlayService } from '../../overlay/overlayService';
import { Button } from '../primitives/Button';
import { StatusBadge } from '../primitives/StatusBadge';
import { useJournalEntries, type JournalRow } from './useJournalEntries';

type HistoryJournal = Pick<Journal, 'entries' | 'subscribe' | 'undo'>;

/** Opens the panel as a slide-over titled "Undo history"; returns the close function. */
export function openHistoryPanel(overlay: OverlayService, journal: HistoryJournal, dawName: () => string): () => void {
  return overlay.open({
    kind: 'slideOver',
    title: 'Undo history',
    render: () => <HistoryPanel journal={journal} dawName={dawName()} />,
  });
}

/**
 * The undo history (ADR 0771, mock `history.tsx`): the journal's entries newest first, each with its label, a pill naming the DAW or
 * "App", and Undo. A row the journal would refuse shows the journal's own sentence and its Undo is off.
 */
function HistoryPanel({ journal, dawName }: { journal: HistoryJournal; dawName: string }) {
  const overlay = useOverlay();
  const rows = useJournalEntries(journal);
  const listId = useId();

  const undo = async (row: JournalRow) => {
    const result = await journal.undo(row.id);
    if (result.ok) overlay.announce(`Undid ${row.label}`);
    else overlay.toast(result.refusal.reason);
  };

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[var(--text-muted)]">Ctrl Z undoes the last one</p>
      {rows && rows.length === 0 ? <p className="text-[var(--text-muted)]">Nothing to undo yet.</p> : null}
      {rows && rows.length > 0 ? (
        <ul aria-label="Changes, newest first" className="flex flex-col gap-3">
          {rows.map((row) => {
            const sentenceId = `${listId}-${row.id}`;
            return (
              <li key={row.id}>
                <div className="flex items-center gap-2">
                  <span className="min-w-0 flex-1">{row.label}</span>
                  <StatusBadge tone={row.daw ? 'success' : 'neutral'} label={row.daw ? dawName : 'App'} />
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={row.refusal !== null}
                    aria-describedby={row.refusal !== null ? sentenceId : undefined}
                    onClick={() => void undo(row)}
                  >
                    Undo
                  </Button>
                </div>
                {row.refusal !== null ? (
                  <p id={sentenceId} className="mt-1 text-[length:var(--font-size-sm)] text-[var(--text-muted)]">
                    {row.refusal}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
