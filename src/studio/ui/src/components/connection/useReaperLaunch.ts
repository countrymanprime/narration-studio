import { useCallback, useEffect, useRef, useState } from 'react';
import type { DawCapabilities, DawKind } from '../../api/contracts/daw';
import { apiErrorMessage } from '../../api/errorMessage';
import { usePort } from '../../ports/usePort';
import { startDaw } from './startDaw';

/** How the last Start went: nothing yet, the launcher is running, the app is waiting for the bridge, or it did not work. */
export type LaunchState =
  | { phase: 'idle' }
  | { phase: 'starting' }
  | { phase: 'waiting' }
  /** The host said no (no project open, no project file linked, REAPER not found): nothing started. */
  | { phase: 'refused'; message: string }
  /** The host started it and the bridge never answered in time. */
  | { phase: 'failed'; message: string };

/** How long the app waits for the DAW to answer after the launcher ran, then reads it once more before saying it did not. */
const WAIT_MS = 10_000;

/**
 * Starts the DAW with the host's launcher (`DawLaunch`) and then waits for the capabilities event that says the bridge answers (the host
 * announces it; nothing here asks every second), up to `waitMs`, with one read at the end: the Start button of the not-connected dialog. A REAPER already open runs the launcher in place. `onCaps` hands each read this hook makes to the page so its picture follows, and the
 * dialog closes when the page stops drawing it. Leaving the dialog stops the waiting.
 */
export function useReaperLaunch({
  daw,
  name,
  onCaps,
  onLaunched,
  waitMs = WAIT_MS,
}: {
  daw: DawKind;
  name: string;
  onCaps?: (caps: DawCapabilities) => void;
  onLaunched?: (path: string) => void;
  waitMs?: number;
}): { state: LaunchState; start: () => void } {
  const project = usePort('project');
  const system = usePort('system');
  const dawPort = usePort('daw');
  const [state, setState] = useState<LaunchState>({ phase: 'idle' });
  const alive = useRef(true);
  const running = useRef(false);
  // Ends a wait in progress when the dialog goes away, so its timer and subscription are not held to the deadline.
  const leave = useRef<() => void>(() => {});
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      leave.current();
    };
  }, []);

  const start = useCallback(() => {
    if (running.current) return;
    running.current = true;
    const say = (next: LaunchState) => alive.current && setState(next);
    const readOnce = async () => {
      const next = await dawPort.capabilities();
      if (!alive.current) return false;
      onCaps?.(next);
      return next.reachable;
    };
    void (async () => {
      say({ phase: 'starting' });
      // Listening starts before the launcher runs: the host announces the DAW answering (`subscribeCapabilities`) and a REAPER already open can
      // answer before the launcher returns, with no later event for a picture that has not changed.
      let heard = false;
      let wake: (reached: boolean) => void = () => {};
      const stop: { off?: () => void } = {};
      stop.off = dawPort.subscribeCapabilities?.((next) => {
        // The picture comes from the app's own session (it is what the page already shows), so it is not handed back through `onCaps`: that is the session taking its own picture, which announces it again.
        if (!alive.current || heard) return;
        if (next.reachable) {
          heard = true;
          wake(true);
        }
      });
      const release = () => {
        stop.off?.();
        stop.off = undefined;
      };
      // A subscription that answered before it returned is released here; otherwise `finally` releases it.
      if (heard) release();
      try {
        const started = await startDaw({ project, system }, daw);
        if (!started.ok) {
          say({ phase: 'refused', message: started.message });
          return;
        }
        onLaunched?.(started.path);
        say({ phase: 'waiting' });
        // One read now, for a change the event did not carry; then the event, up to `waitMs`; then one read at the deadline.
        let reached = heard || (await readOnce());
        if (!reached && alive.current) {
          reached = await new Promise<boolean>((resolve) => {
            const timer = setTimeout(() => resolve(false), waitMs);
            wake = (answered) => {
              clearTimeout(timer);
              resolve(answered);
            };
            leave.current = () => wake(false);
            if (heard) wake(true);
          });
          reached = reached || (alive.current && (await readOnce()));
        }
        if (!alive.current) return;
        if (reached) {
          say({ phase: 'idle' });
          return;
        }
        say({ phase: 'failed', message: `${name} was started and has not answered yet. Check again in a moment, or open it by hand.` });
      } catch (error) {
        say({ phase: 'failed', message: `${name} was started, but this app could not tell whether it answered: ${apiErrorMessage(error)}` });
      } finally {
        release();
        leave.current = () => {};
        running.current = false;
      }
    })();
  }, [daw, name, onCaps, onLaunched, waitMs, project, system, dawPort]);

  return { state, start };
}
