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
 * announces it; nothing here asks every second), up to `waitMs`, with one read at the end: the Start button of the not-connected dialog. A REAPER already open runs the launcher in place. `onCaps` hands each read to the page so its picture follows, and the
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
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const start = useCallback(() => {
    if (running.current) return;
    running.current = true;
    const say = (next: LaunchState) => alive.current && setState(next);
    const readOnce = async () => {
      const next = await dawPort.capabilities();
      onCaps?.(next);
      return next.reachable;
    };
    void (async () => {
      say({ phase: 'starting' });
      const started = await startDaw({ project, system }, daw);
      if (!started.ok) {
        say({ phase: 'refused', message: started.message });
        running.current = false;
        return;
      }
      onLaunched?.(started.path);
      say({ phase: 'waiting' });
      try {
        // The host announces the DAW answering (`subscribeCapabilities`); the wait ends on that, or at the deadline with one read of its own.
        const answered = await new Promise<boolean>((resolve) => {
          const stop: { off?: () => void } = {};
          let done = false;
          const timer = setTimeout(() => finish(false), waitMs);
          const finish = (reached: boolean) => {
            done = true;
            clearTimeout(timer);
            stop.off?.();
            resolve(reached);
          };
          stop.off = dawPort.subscribeCapabilities?.((next) => {
            if (done) return;
            if (!alive.current) return finish(false);
            onCaps?.(next);
            if (next.reachable) finish(true);
          });
        });
        if (!alive.current) return;
        const reached = answered || (await readOnce());
        if (reached) {
          say({ phase: 'idle' });
          return;
        }
        say({ phase: 'failed', message: `${name} was started and has not answered yet. Check again in a moment, or open it by hand.` });
      } catch (error) {
        say({ phase: 'failed', message: `${name} was started, but this app could not tell whether it answered: ${apiErrorMessage(error)}` });
      } finally {
        running.current = false;
      }
    })();
  }, [daw, name, onCaps, onLaunched, waitMs, project, system, dawPort]);

  return { state, start };
}
