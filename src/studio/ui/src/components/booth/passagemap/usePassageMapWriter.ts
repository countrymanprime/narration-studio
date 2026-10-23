import { useMemo, useRef } from 'react';
import { apiErrorMessage } from '../../../api/errorMessage';
import { PASSAGE_MAP_MAX_SECONDS, type PassageMarkInput, type PassagePlace } from '../../../api/contracts/passageMap';
import { usePort } from '../../../ports/usePort';
import type { Notify } from '../../primitives/Toast';

export type PassageMapWriterDeps = {
  chapterId: string;
  /** Where the reading stands now and the seconds into the take, for a run `flush()` has to stop. Read when called, not when rendered. */
  current: () => { at: PassagePlace; elapsed: number };
  notify: Notify;
};

type Run = { chapterId: string; marks: PassageMarkInput[]; offset: number };

/** What the Booth calls as a take runs; SN-O102 wires the calls. */
export type PassageMapWriter = {
  /** A take begins at `at`, `startOffset` seconds into the chapter recording (the end of the last item). A run still open is dropped. */
  begin: (at: PassagePlace, startOffset: number) => void;
  /** The narrator rolled again and the roll was made: a new take begins at `at`, the one before it ended at `prev`. Call it only after a refused or declined roll did not happen. */
  roll: (at: PassagePlace, prev: PassagePlace, elapsed: number) => void;
  /** The recording stopped with the reading at `prev`: closes the run and sends it, with any run an earlier stop could not write. */
  stop: (prev: PassagePlace, elapsed: number) => Promise<void>;
  /** Stops a run still open at `current()` and sends what is waiting. For leaving mid-take; never rejects. */
  flush: () => Promise<void>;
};

/**
 * The Booth's side of the passage map (docs/architecture/manuscript-teleprompter.md#the-passage-map). A take keeps its marks
 * in memory (start, rolls, stop) and sends them once, at stop, through `passageMapRecordRun`; the host stamps the DAW's ids.
 * `sec` is the take's start offset plus the elapsed seconds the caller passes, never wall clock. A refused run is kept and
 * sent again, in order, at the next stop or flush, and its sentence is toasted once; the take itself is already saved.
 */
export function usePassageMapWriter(deps: PassageMapWriterDeps): PassageMapWriter {
  const port = usePort('passageMap');
  const latest = useRef({ ...deps, port });
  latest.current = { ...deps, port };

  return useMemo(() => {
    let open: Run | null = null;
    const waiting: Run[] = [];
    let sending: Promise<void> = Promise.resolve();

    // Never earlier than the mark before it, never past the day the host accepts: a clock hiccup must not get a whole run refused.
    const secAt = (run: Run, elapsed: number): number => {
      const last = run.marks[run.marks.length - 1].sec;
      return Math.min(PASSAGE_MAP_MAX_SECONDS, Math.max(last, run.offset + elapsed));
    };

    const drain = async (): Promise<void> => {
      while (waiting.length > 0) {
        const run = waiting[0];
        try {
          await latest.current.port.passageMapRecordRun(run.chapterId, run.marks);
        } catch (error) {
          latest.current.notify(apiErrorMessage(error), 'error');
          return;
        }
        waiting.shift();
      }
    };
    const send = (): Promise<void> => (sending = sending.then(drain));

    const close = (prev: PassagePlace, elapsed: number): void => {
      if (!open) return;
      const run = open;
      open = null;
      run.marks.push({ kind: 'stop', ...prev, sec: secAt(run, elapsed), prev });
      waiting.push(run);
    };

    return {
      begin: (at, startOffset) => {
        const offset = Math.max(0, startOffset);
        open = { chapterId: latest.current.chapterId, offset, marks: [{ kind: 'start', ...at, sec: Math.min(PASSAGE_MAP_MAX_SECONDS, offset) }] };
      },
      roll: (at, prev, elapsed) => {
        if (open) open.marks.push({ kind: 'roll', ...at, sec: secAt(open, elapsed), prev });
      },
      stop: (prev, elapsed) => {
        close(prev, elapsed);
        return send();
      },
      flush: () => {
        const now = open ? latest.current.current() : null;
        if (now) close(now.at, now.elapsed);
        return send();
      },
    };
  }, []);
}
