import { useState } from 'react';
import { describeApiError } from '../../api/errorMessage';
import { useChapterSync } from '../../hooks/useChapterSync';
import { usePort } from '../../ports/usePort';
import { Button } from '../primitives/Button';
import type { Notify } from '../primitives/Toast';
import { chapterSyncActivityRows, chapterSyncTimeLabel } from './chapterSyncText';

/**
 * What each chapter sync did, newest first, with Undo on a link sync made that the chapter still holds. It lives in Settings
 * (Recording & DAW › Advanced), not in the engine panel: it is a record to look back on, not something to act on while syncing.
 */
export function SyncActivityLog({ notify }: { notify: Notify }) {
  const port = usePort('chapterSync');
  const state = useChapterSync(port);
  const [undoingTrackGuid, setUndoingTrackGuid] = useState('');

  if (!state) return <p className="text-[0.8125rem] text-[var(--text-muted)]">Reading the sync activity…</p>;

  const rows = chapterSyncActivityRows(state.activity, (guid) => state.chapters.find((chapter) => chapter.trackGuid === guid)?.trackName ?? '');
  if (rows.length === 0) return <p className="text-[0.8125rem] text-[var(--text-muted)]">No sync has run in this project yet.</p>;

  // Undo is offered only while the chapter still holds that automatic link: the host would refuse it on a link already changed or cleared.
  const stillAuto = (trackGuid: string) => state.chapters.some((chapter) => chapter.trackGuid === trackGuid && chapter.origin === 'auto');
  // Undo removes one automatic link and remembers the pair so sync never makes it again; chaptersync:state redraws the list.
  const undo = async (trackGuid: string) => {
    setUndoingTrackGuid(trackGuid);
    try {
      await port.chapterSyncUndo(trackGuid);
      notify('Link undone. Sync will not make it again.');
    } catch (error) {
      notify(describeApiError(error), 'error');
    } finally {
      setUndoingTrackGuid('');
    }
  };

  return (
    <ul aria-label="Sync activity" className="w-full divide-y divide-[var(--border)] text-[0.8125rem]">
      {rows.map((row) => (
        <li key={row.key} className="grid grid-cols-[5.5rem_minmax(0,1fr)_auto] items-baseline gap-x-3 py-1.5">
          <span className="text-[var(--text-muted)]">{chapterSyncTimeLabel(row.at)}</span>
          <span className="[overflow-wrap:anywhere]">{row.text}</span>
          {row.undoTrackGuid && stillAuto(row.undoTrackGuid) ? (
            <Button
              variant="link"
              size="sm"
              disabled={undoingTrackGuid === row.undoTrackGuid}
              aria-label={`Undo: ${row.text}`}
              onClick={() => void undo(row.undoTrackGuid)}
            >
              Undo
            </Button>
          ) : (
            <span aria-hidden="true" />
          )}
        </li>
      ))}
    </ul>
  );
}
