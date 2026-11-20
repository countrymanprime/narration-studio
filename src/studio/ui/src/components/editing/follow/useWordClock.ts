import { useEffect, useMemo, useRef, useState } from 'react';
import type { DawCapabilities, WordTimes } from '../../../api/contracts/daw';
import { usePort } from '../../../ports/usePort';
import type { ChapterDoc } from '../model';
import { buildWordClock, type WordClock } from './wordClock';
import { useVisible } from './useDawPlayPosition';

/** The word-table reads of one chapter: see `flight` in `useWordClock`. */
type Flight = {
  generation: number;
  reading: boolean;
  /** When the read in flight began (`performance.now()`, which a changed system clock does not move), and which read it is. */
  startedAt: number;
  token: number;
  /** The newest read whose answer the page took: an answer of an older read, even a late one, is never taken over it. */
  applied: number;
  again: boolean;
  held: number;
  active: boolean;
  read: () => void;
};

/** How long a read may be out before a later one is made anyway (the host bounds its own read at 5 s; a binding that never settles must not stop every later read). */
export const WORD_TIMES_READ_LIMIT_MS = 20_000;

const freshFlight = (generation: number): Flight => ({
  generation,
  reading: false,
  startedAt: 0,
  token: 0,
  applied: 0,
  again: false,
  held: -1,
  active: false,
  read: () => undefined,
});

/**
 * The Editing page's map between its words and the DAW's project seconds: the host's word table (`WorkspaceWordTimes`) laid over the page's words. The
 * table is asked for on opening, when the window is shown, and each time the DAW reports an edit of the project (`daw_project_edited`, REAPER's change
 * counter), so a move, a trim, a rate change, a split or a deleted section is in it as soon as the host reads it. A read that fails keeps the table
 * the page has; a DAW that cannot make one (not answering, `track_state` off, no linked track) leaves the page with no map, and the DAW is not followed.
 */
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

  /**
   * The read in flight and what waits behind it, kept across the window being hidden and shown (each flip re-runs the reading effect below: a
   * flag of its own per run let a run of flips start a read each, many in flight together) and replaced when the chapter or the DAW's answer
   * changes (`generation`), so a late answer of the old one is dropped.
   */
  const flight = useRef<Flight>(freshFlight(0));

  // A new chapter, or a DAW that can or cannot make a table: nothing known, and any read still out is the old one's.
  useEffect(() => {
    flight.current = freshFlight(flight.current.generation + 1);
    setTable(null);
    setAnswered(false);
  }, [sync, chapterId, enabled]);

  useEffect(() => {
    if (!enabled || !visible) return;
    const run = flight.current;
    const read = (): void => {
      if (run.reading) {
        if (performance.now() - run.startedAt < WORD_TIMES_READ_LIMIT_MS) {
          run.again = true;
          return;
        }
        // Out longer than the limit: given up on, and replaced by this one (what waited behind it is this read's to answer).
        run.again = false;
      }
      run.reading = true;
      run.startedAt = performance.now();
      const token = ++run.token;
      // A read still out at the limit with something waiting behind it is replaced then, with no further event needed.
      const limit = window.setTimeout(() => {
        if (flight.current === run && run.token === token && run.reading && run.again && run.active) run.read();
      }, WORD_TIMES_READ_LIMIT_MS);
      // A read that fails and one that answers both end the read in flight; an edit that came meanwhile is read next either way, once (a read
      // that fails with nothing waiting is not repeated: that would be a hot loop on a DAW that cannot answer).
      const followUp = (): void => {
        run.reading = false;
        // What waited behind the read is read now by whichever run of the effect is on (the one that started this read may be a hidden
        // window's, long gone); with the window hidden it is dropped, the next show reads anyway.
        if (run.again) {
          run.again = false;
          if (run.active) run.read();
        }
      };
      sync.workspaceWordTimes(chapterId).then(
        (answer) => {
          window.clearTimeout(limit);
          if (flight.current !== run) return;
          // An answer newer than what the page has is taken, even from a read given up on (the one that replaced it may fail or be slower); an
          // older one never replaces a newer.
          if (token > run.applied) {
            run.applied = token;
            run.held = answer.available ? answer.changeCount : -1;
            setTable(answer.available ? answer : null);
            setAnswered(true);
          }
          if (token === run.token) followUp();
        },
        () => {
          window.clearTimeout(limit);
          if (flight.current !== run || token !== run.token) return;
          setAnswered(true);
          followUp();
        },
      );
    };
    run.active = true;
    run.read = read;
    // Shown again, or first shown: the DAW may have been edited meanwhile, so the table is asked for whatever the last count was.
    read();
    const stop = sync.subscribeDawProjectEdited((edit) => {
      if (edit.changeCount !== run.held) read();
    });
    return () => {
      run.active = false;
      stop();
    };
  }, [sync, chapterId, enabled, visible]);

  const clock = useMemo(() => (table ? buildWordClock(table, doc, tokenOf) : null), [table, doc, tokenOf]);
  return { clock, pending: enabled && visible && !answered };
}
