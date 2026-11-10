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
  /** True once `decide` answered yes for this take: the page is going and its stop (or the narrator's "Leave anyway") is already done. */
  const decided = useRef(false);
  const { recording } = session;

  // The question, the stop and its refusal: true once the take is over (or was never the app's) and the move may go, false when the narrator stayed.
  // One at a time: a second caller while it is open is the same question, and does not move.
  const decide = useCallback((): Promise<boolean> => {
    const now = sessionRef.current;
    if (asking.current) return asking.current.then(() => false);
    const run = async (): Promise<boolean> => {
      decided.current = false;
      const startedByApp = now.startedByApp ?? true;
      let spec = stopRecordingSpec(now.daw.name, startedByApp);
      let refusedOnce = false;
      for (;;) {
        if (!(await overlay.confirm(spec))) return false;
        // The stop was refused and the narrator chose to leave anyway: a DAW that does not answer must not hold them in the Booth.
        if (!startedByApp || refusedOnce) return (decided.current = true);
        const result = await sessionRef.current.stopRecording();
        if (result.ok) {
          await sessionRef.current.flush?.();
          return (decided.current = true);
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
    if (!recording) {
      guard.setLeaveGuard(null);
      return;
    }
    const { daw, startedByApp = true } = sessionRef.current;
    guard.setLeaveGuard(() => ({ ask: stopRecordingSpec(daw.name, startedByApp), decide }));
    return () => guard.setLeaveGuard(null);
  }, [recording, guard, decide]);

  const leave = useCallback(
    async (next: string, go: (next: string) => void): Promise<void> => {
      if (!sessionRef.current.recording) {
        go(next);
        return;
      }
      if (await decide()) go(next);
    },
    [decide],
  );

  return { leave, decided };
}
