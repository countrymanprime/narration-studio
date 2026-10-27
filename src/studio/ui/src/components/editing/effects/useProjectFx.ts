import { useCallback } from 'react';
import type { DawFxState } from '../../../daw/dawSession';
import { useDawSession, useDawState } from '../../../daw/useDawSession';

export interface ProjectFxState extends DawFxState {
  /** Reads the DAW's FX again (the visible Check again). */
  checkAgain: () => void;
}

/**
 * The FX on the linked DAW's tracks and master track (`workspaceProjectFx`, #2251 item 36), from the app's DAW session: read at app
 * start, when the DAW's capabilities change, when the window is focused again and on Check again, so the list is there before this tab
 * opens. A failed read keeps its sentence and no stale list: the DAW's chain is a fact about now, not something to show as it was.
 */
export function useProjectFx(): ProjectFxState {
  const session = useDawSession();
  const fx = useDawState((state) => state.fx);
  const checkAgain = useCallback(() => void session.refreshFx(), [session]);
  return { ...fx, checkAgain };
}
