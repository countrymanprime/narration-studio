import { useEffect, useMemo, useState } from 'react';
import type { DawCapabilities, WordTimes } from '../../../api/contracts/daw';
import { usePort } from '../../../ports/usePort';
import type { ChapterDoc } from '../model';
import { buildWordClock, type WordClock } from './wordClock';
import { useVisible } from './useDawPlayPosition';

/**
 * The Editing page's map between its words and the DAW's project seconds: the host's word table (`WorkspaceWordTimes`) laid over the page's words. The
 * table is asked for on opening, when the window is shown, and each time the DAW reports an edit of the project (`daw_project_edited`, REAPER's change
 * counter), so a move, a trim, a rate change, a split or a deleted section is in it as soon as the host reads it. A read that fails keeps the table
 * the page has; a DAW that cannot make one (not answering, `track_state` off, no linked track) leaves the page with no map, and the DAW is not followed.
 *
 * Each read makes REAPER list the chapter's items, which costs in proportion to the chapter, and REAPER's counter moves on every undo point, so a
 * nudge or a drag moves it many times a second. The first edit after a quiet spell is read at once; edits that follow within `WORD_TIMES_MIN_GAP_MS`
 * of the last edit-driven read wait and are answered by one read when the gap has passed (#3664).
 */
/** The least time between two reads the DAW's edits ask for: a burst of edits is answered by one read at the end of it. */
export const WORD_TIMES_MIN_GAP_MS = 600;

export function useWordClock(
  chapterId: string,
  doc: ChapterDoc,
  tokenOf: (key: string) => number | undefined,
  caps: DawCapabilities | null,
): { clock: WordClock | null; pending: boolean } {
  const sync = usePort('dawTransportSync');
  const visible = useVisible();
  const enabled = !!caps?.reachable && !!caps.capabilities['track_state']?.available;
  const [table, setTable] = useState<WordTimes | null>(null);
  /** The host has answered for this chapter at least once (a table, or that it cannot make one). */
  const [answered, setAnswered] = useState(false);

  useEffect(() => {
    setTable(null);
    setAnswered(false);
    if (!enabled || !visible) return;
    let alive = true;
    let reading = false;
    let again = false;
    let held = -1;
    /** When the last read an edit asked for began (ms, `Date.now()`), and the timer of the one waiting for the gap to pass. */
    let editReadAt = -Infinity;
    let waiting: ReturnType<typeof setTimeout> | undefined;
    const read = (): void => {
      if (reading) {
        again = true;
        return;
      }
      reading = true;
      sync.workspaceWordTimes(chapterId).then(
        (answer) => {
          reading = false;
          if (!alive) return;
          held = answer.available ? answer.changeCount : -1;
          setTable(answer.available ? answer : null);
          setAnswered(true);
          if (again) {
            again = false;
            read();
          }
        },
        () => {
          reading = false;
          again = false;
          if (alive) setAnswered(true);
        },
      );
    };
    read();
    const readForEdit = (): void => {
      if (waiting !== undefined) return;
      const wait = editReadAt + WORD_TIMES_MIN_GAP_MS - Date.now();
      if (wait <= 0) {
        editReadAt = Date.now();
        read();
        return;
      }
      waiting = setTimeout(() => {
        waiting = undefined;
        if (alive) readForEdit();
      }, wait);
    };
    const stop = sync.subscribeDawProjectEdited((edit) => {
      if (edit.changeCount !== held) readForEdit();
    });
    return () => {
      alive = false;
      clearTimeout(waiting);
      stop();
    };
  }, [sync, chapterId, enabled, visible]);

  const clock = useMemo(() => (table ? buildWordClock(table, doc, tokenOf) : null), [table, doc, tokenOf]);
  return { clock, pending: enabled && visible && !answered };
}
