import { useId } from 'react';
import { JOURNAL_LIMIT, type Journal } from '../../studio/journal/createJournal';
import { useOverlay } from '../../overlay/OverlayProvider';
import type { OverlayService } from '../../overlay/overlayService';
import { Button } from '../primitives/Button';
import { KeyChord } from '../primitives/KeyCap';
import { StatusBadge } from '../primitives/StatusBadge';
import { useJournalEntries, type JournalRow } from './useJournalEntries';

type HistoryJournal = Pick<Journal, 'entries' | 'subscribe' | 'undo'>;

export const HISTORY_TITLE = 'Undo history';

/** Opens the panel as a slide-over titled "Undo history"; returns the close function. */
export function openHistoryPanel(overlay: OverlayService, journal: HistoryJournal, dawName: () => string): () => void {
  return overlay.open({
    kind: 'slideOver',
    title: HISTORY_TITLE,
    render: () => <HistoryPanel journal={journal} dawName={dawName()} />,
  });
}

/**
 * The undo history (mock `history.tsx`): the journal's entries newest first, each with its label, a pill naming the DAW or
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
    // What there is comes first (the empty sentence or the list), the key that undoes the newest change last, in key caps as everywhere
    // else (alignment audit R4SM-19, XSL-13).
    <div className="flex flex-col gap-3">
      {rows && rows.length === 0 ? <p>Nothing to undo yet.</p> : null}
      {rows && rows.length >= JOURNAL_LIMIT ? (
        <p className="text-[var(--text-muted)]">{`History keeps the newest ${JOURNAL_LIMIT} changes; older changes can no longer be undone.`}</p>
      ) : null}
      {rows && rows.length > 0 ? (
        <ul aria-label="Changes, newest first" className="flex flex-col gap-3">
          {rows.map((row) => {
            const sentenceId = `${listId}-${row.id}`;
            return (
              <li key={row.id}>
                <div className="flex items-center gap-2">
                  <span className="min-w-0 flex-1">{row.label}</span>
                  <time dateTime={new Date(row.at).toISOString()} className="text-[length:var(--font-size-sm)] text-[var(--text-muted)]">
                    {new Date(row.at).toLocaleTimeString()}
                  </time>
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
      <p className="flex items-center gap-1.5 text-[length:var(--font-size-sm)] text-[var(--text-muted)]">
        <KeyChord keys={['Ctrl', 'Z']} />
        undoes the newest change
      </p>
    </div>
  );
}
