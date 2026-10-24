import { useCallback, useEffect, useRef, useState } from 'react';
import type { DawPunchPreroll } from '../../../api/contracts/daw';
import { apiErrorMessage } from '../../../api/errorMessage';
import { usePort } from '../../../ports/usePort';

export type DawPrerollState =
  /** The DAW has not answered the first read. */
  | { kind: 'loading' }
  /** What the DAW holds. */
  | { kind: 'ready'; preroll: DawPunchPreroll }
  /** The DAW refused the read, in its own sentence. */
  | { kind: 'off'; message: string }
  /** The read did not reach the DAW. */
  | { kind: 'failed'; message: string };

/**
 * The DAW's own pre-roll before a punched take (`punch_preroll`), which the Booth punches with: read when the Levels menu opens (it mounts then)
 * and again when the window is looked at, since the narrator sets it in the DAW. It is never set from here.
 */
export function useDawPreroll(): DawPrerollState {
  const levels = usePort('dawLevels');
  const [state, setState] = useState<DawPrerollState>({ kind: 'loading' });
  const live = useRef(true);

  const read = useCallback(() => {
    levels.dawPunchPreroll().then(
      (answer) => live.current && setState(answer.ok ? { kind: 'ready', preroll: answer } : { kind: 'off', message: answer.message }),
      (error: unknown) => live.current && setState({ kind: 'failed', message: `Could not read the DAW's pre-roll: ${apiErrorMessage(error)}` }),
    );
  }, [levels]);

  useEffect(() => {
    live.current = true;
    read();
    window.addEventListener('focus', read);
    return () => {
      live.current = false;
      window.removeEventListener('focus', read);
    };
  }, [read]);
  return state;
}
