import { useCallback, useEffect, useState } from 'react';
import type { WorkspaceProjectFxResult } from '../../../api/contracts/workspace';
import { apiErrorMessage } from '../../../api/errorMessage';
import { usePort } from '../../../ports/usePort';

export interface ProjectFxState {
  /** What the DAW answered last, or null before its first answer and while the read failed. */
  chain: WorkspaceProjectFxResult | null;
  /** True while a read is on its way. */
  reading: boolean;
  /** Why the last read failed, or ''. */
  error: string;
  /** When the DAW last answered (ms since the epoch), null before it has. */
  readAt: number | null;
  /** Reads the DAW's FX again (the visible Check again). */
  checkAgain: () => void;
}

/**
 * The FX on the linked DAW's tracks and master track (`workspaceProjectFx`, #2251 item 36). Read when the tab opens, when the window is
 * focused again and on Check again, since the narrator adds and removes plug-ins in the DAW while the app is open. A failed read keeps
 * its sentence and no stale list: the DAW's chain is a fact about now, not something to show as it was.
 */
export function useProjectFx(): ProjectFxState {
  const workspace = usePort('workspace');
  const [chain, setChain] = useState<WorkspaceProjectFxResult | null>(null);
  const [reading, setReading] = useState(true);
  const [error, setError] = useState('');
  const [readAt, setReadAt] = useState<number | null>(null);
  const [asked, setAsked] = useState(0);
  const checkAgain = useCallback(() => setAsked((n) => n + 1), []);

  useEffect(() => {
    let live = true;
    setReading(true);
    workspace.workspaceProjectFx().then(
      (next) => {
        if (!live) return;
        setChain(next);
        setError('');
        setReadAt(Date.now());
        setReading(false);
      },
      (problem: unknown) => {
        if (!live) return;
        setChain(null);
        setError(apiErrorMessage(problem));
        setReading(false);
      },
    );
    return () => {
      live = false;
    };
  }, [workspace, asked]);

  useEffect(() => {
    window.addEventListener('focus', checkAgain);
    return () => window.removeEventListener('focus', checkAgain);
  }, [checkAgain]);

  return { chain, reading, error, readAt, checkAgain };
}
