import { useCallback, useEffect, useRef } from 'react';
import type { DawResult } from '../../../api/contracts/daw';
import type { LeaveGuardStore } from '../../../studio/journal/leaveGuard';
import type { OverlayService } from '../../../overlay/overlayService';
import { stopRecordingSpec } from './stopRecordingSpec';

/** The seam the Booth gives the guard: not a `DawClient`, only what leaving needs to know and do. */
export type BoothLeaveSession = {
  recording: boolean;
  /** False when the DAW was already recording and the app did not start the take. Default true. */
  startedByApp?: boolean;
  daw: { name: string };
  stopRecording: () => Promise<DawResult>;
  /** Resolves when a start that is still out lands or fails, with whether a take is running then. The narrator's yes waits for it, so what it stops is a take. */
  settle?: () => Promise<boolean>;
  /** Writes what the take left behind (the passage map's run); called once the stop is confirmed and before `go`. Must not reject. */
  flush?: () => Promise<void>;
};

/** How long the refusal's "Leave anyway" ignores a press after it appears: the second click of a double-click on the button it replaced. */
const LEAVE_ANYWAY_ARM_MS = 400;

type Deps = {
  guard: Pick<LeaveGuardStore, 'setLeaveGuard'>;
  overlay: Pick<OverlayService, 'confirm'>;
};

/**
 * Registers the Booth's leave guard while a take records and returns `leave`, the one way out the Booth's own exits take
 * (Escape, the setup chip, a chapter opened in Script) and, as the verdict's `decide`, the one the app shell uses for the nav, Back and Forward. `leave(next, go)` asks "Stop recording?" once, holds the take until
 * the narrator answers, stops the recording the app started, flushes the passage map's run, and only then calls `go` with the same destination. Keep
 * recording changes nothing. A refused stop keeps the question open with the host's sentence and offers "Leave anyway". The guard is removed when
 * the recording ends or the Booth unmounts.
 */
export function useBoothLeaveGuard(session: BoothLeaveSession, { guard, overlay }: Deps) {
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const asking = useRef<Promise<boolean> | null>(null);
  // Which take the narrator was asked about and answered yes for. A take that starts after that stop and before the page goes is a different take,
  // and the page's own stop must still end it: `take` counts the takes, `answeredFor` is the one the yes was for.
  const take = useRef(0);
  const answeredFor = useRef(-1);
  const answered = useRef(false);
  const { recording } = session;

  // The question, the stop and its refusal: true once the take is over (or was never the app's) and the move may go, false when the narrator stayed.
  // One at a time: a second caller while it is open is the same question, and does not move.
  const decide = useCallback((): Promise<boolean> => {
    const now = sessionRef.current;
    if (asking.current) return asking.current.then(() => false);
    const run = async (): Promise<boolean> => {
      const mine = take.current;
      const startedByApp = now.startedByApp ?? true;
      let spec = stopRecordingSpec(now.daw.name, startedByApp);
      let refusedOnce = false;
      for (;;) {
        if (!(await overlay.confirm(spec))) return false;
        // The stop was refused and the narrator chose to leave anyway: a DAW that does not answer must not hold them in the Booth.
        if (!startedByApp || refusedOnce) {
          answeredFor.current = mine;
          answered.current = true;
          return true;
        }
        // A start still out when the question was answered lands first; if it did not start a take there is nothing to stop.
        if (sessionRef.current.settle && !(await sessionRef.current.settle())) {
          answeredFor.current = mine;
          answered.current = true;
          return true;
        }
        const result = await sessionRef.current.stopRecording();
        if (result.ok) {
          await sessionRef.current.flush?.();
          answeredFor.current = mine;
          answered.current = true;
          return true;
        }
        // The stop was refused: nothing changed, so the take still runs. The question stays, now with the host's sentence and a way out.
        refusedOnce = true;
        const sentence = result.refused ?? (result.message || '');
        spec = {
          ...spec,
          title: 'Could not stop the take',
          body: `${sentence} You can leave anyway, but it may keep recording.`.trim(),
          confirmLabel: 'Leave anyway',
          // A double-click on "Stop and leave" must not land on the "Leave anyway" that replaces it before the sentence can be read.
          armAfterMs: LEAVE_ANYWAY_ARM_MS,
        };
      }
    };
    const pending = run().finally(() => {
      asking.current = null;
    });
    asking.current = pending;
    return pending;
  }, [overlay]);

  useEffect(() => {
    if (recording) take.current += 1;
  }, [recording]);

  // Registered while the Booth is up, not only while a take records: from the narrator's yes until the move happens (the stop, then the passage map's
  // run) the question is still answered, so a second exit in that time asks nothing new and moves nowhere.
  useEffect(() => {
    guard.setLeaveGuard(() => {
      const now = sessionRef.current;
      if (!now.recording && !asking.current) return 'allow';
      return { ask: stopRecordingSpec(now.daw.name, now.startedByApp ?? true), decide };
    });
    return () => guard.setLeaveGuard(null);
  }, [guard, decide]);

  const leave = useCallback(
    async (next: string, go: (next: string) => void): Promise<void> => {
      // A move already decided is on its way (the question is open, or the stop and the run are being written): this exit is the same one, and does not go twice.
      if (asking.current) {
        await asking.current;
        return;
      }
      if (!sessionRef.current.recording) {
        go(next);
        return;
      }
      if (await decide()) go(next);
    },
    [decide],
  );

  // Stable: the page's unmount effect depends on them and must not re-run (and stop a take) on every render.
  const handled = useCallback(() => answeredFor.current === take.current, []);
  const leaving = useCallback(() => answered.current, []);

  return {
    leave,
    decide,
    /** True while the take now running is the one `decide` answered yes for: its stop, or the narrator's "Leave anyway", is already done. */
    handled,
    /** True once the narrator answered yes to leaving: the page is going, so a take started since is stopped as it goes. */
    leaving,
  };
}
