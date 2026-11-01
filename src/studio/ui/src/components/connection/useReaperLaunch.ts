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

const POLL_MS = 1000;
const POLLS = 10;

/**
 * Starts the DAW with the host's launcher (`DawLaunch`) and then reads the capabilities until the bridge answers: the Start button of the
 * not-connected dialog. A REAPER already open runs the launcher in place. `onCaps` hands each read to the page so its picture follows, and the
 * dialog closes when the page stops drawing it. Leaving the dialog stops the waiting.
 */
export function useReaperLaunch({
  daw,
  name,
  onCaps,
  onLaunched,
  pollMs = POLL_MS,
  polls = POLLS,
}: {
  daw: DawKind;
  name: string;
  onCaps?: (caps: DawCapabilities) => void;
  onLaunched?: (path: string) => void;
  pollMs?: number;
  polls?: number;
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
        for (let attempt = 0; attempt < polls && alive.current; attempt++) {
          await new Promise((resolve) => setTimeout(resolve, pollMs));
          if (!alive.current) break;
          const next = await dawPort.capabilities();
          onCaps?.(next);
          if (next.reachable) {
            say({ phase: 'idle' });
            return;
          }
        }
        say({ phase: 'failed', message: `${name} was started and has not answered yet. Check again in a moment, or open it by hand.` });
      } catch (error) {
        say({ phase: 'failed', message: `${name} was started, but this app could not tell whether it answered: ${apiErrorMessage(error)}` });
      } finally {
        running.current = false;
      }
    })();
  }, [daw, name, onCaps, onLaunched, pollMs, polls, project, system, dawPort]);

  return { state, start };
}
