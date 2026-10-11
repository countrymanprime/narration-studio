import { useCallback, useEffect, useRef } from 'react';
import type { DawResult } from '../../../api/contracts/daw';
import type { LeaveGuardStore } from '../../../studio/journal/leaveGuard';
import type { OverlayService } from '../../../overlay/overlayService';
import { stopRecordingSpec } from './stopRecordingSpec';

/** The seam the Booth gives the guard: not a `DawClient`, only what leaving needs to know and do. */
export type BoothLeaveSession = {
  recording: boolean;
  /** False when the DAW was already recording and the app did not start the take (ADR 0232). Default true. */
  startedByApp?: boolean;
  daw: { name: string };
  stopRecording: () => Promise<DawResult>;
};

type Deps = {
  guard: Pick<LeaveGuardStore, 'setLeaveGuard'>;
  overlay: Pick<OverlayService, 'confirm'>;
};

/**
 * Registers the Booth's leave guard while a take records and returns `leave`, the one way out the Booth's own exits take
 * (Escape, the setup chip, a chapter opened in Script). `leave(next, go)` asks "Stop recording?" once, holds the take until
 * the narrator answers, stops the recording the app started, and only then calls `go` with the same destination. Keep
 * recording changes nothing. A refused stop keeps the question open with the host's sentence. The guard is removed when
 * the recording ends or the Booth unmounts.
 */
export function useBoothLeaveGuard(session: BoothLeaveSession, { guard, overlay }: Deps) {
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const asking = useRef<Promise<void> | null>(null);
  const { recording } = session;

  useEffect(() => {
    if (!recording) {
      guard.setLeaveGuard(null);
      return;
    }
    const { daw, startedByApp = true } = sessionRef.current;
    guard.setLeaveGuard(() => ({ ask: stopRecordingSpec(daw.name, startedByApp) }));
    return () => guard.setLeaveGuard(null);
  }, [recording, guard]);

  const leave = useCallback(
    (next: string, go: (next: string) => void): Promise<void> => {
      const now = sessionRef.current;
      if (!now.recording) {
        go(next);
        return Promise.resolve();
      }
      if (asking.current) return asking.current;
      const run = async () => {
        const startedByApp = now.startedByApp ?? true;
        let spec = stopRecordingSpec(now.daw.name, startedByApp);
        for (;;) {
          if (!(await overlay.confirm({ title: spec.title, body: spec.body, confirmLabel: spec.confirmLabel }))) return;
          if (!startedByApp) break;
          const result = await sessionRef.current.stopRecording();
          if (result.ok) break;
          // The stop was refused: nothing changed, so the take still runs and the question stays, now with the host's sentence.
          spec = { ...spec, body: result.refused ?? (result.message || spec.body) };
        }
        go(next);
      };
      const pending = run().finally(() => {
        asking.current = null;
      });
      asking.current = pending;
      return pending;
    },
    [overlay],
  );

  return { leave };
}
