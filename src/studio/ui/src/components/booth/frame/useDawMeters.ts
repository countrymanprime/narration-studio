import { useEffect, useRef, useState } from 'react';
import { apiErrorMessage } from '../../../api/errorMessage';
import type { DawMeters } from '../../../api/contracts/daw';
import { usePort } from '../../../ports/usePort';

/** How often the menu reads the DAW's meters while it is open: often enough to follow a voice, one read at a time. */
export const DAW_METERS_EVERY_MS = 250;

/** How long without an answer before the meters say they cannot tell instead of showing the last reading as now. */
export const DAW_METERS_QUIET_MS = 2_000;

export type DawMetersState =
  /** No answer yet. */
  | { kind: 'loading' }
  /** The DAW's meters as last read. */
  | { kind: 'ready'; meters: Extract<DawMeters, { ok: true }> }
  /** The DAW refused or cannot be asked, in its own sentence. */
  | { kind: 'off'; message: string }
  /** The last answer is older than DAW_METERS_QUIET_MS: how long ago it was heard. */
  | { kind: 'quiet'; seconds: number; message: string };

/**
 * The DAW's own meters behind the Levels menu: read every DAW_METERS_EVERY_MS while `enabled` (the menu is open and the DAW declares
 * `daw_meters` available), one read at a time, so a slow DAW is asked again only after it answers. A reading that goes quiet is shown
 * as quiet, never as the level now. Nothing is read once the menu closes.
 */
export function useDawMeters(enabled: boolean): DawMetersState {
  const levels = usePort('dawLevels');
  const [state, setState] = useState<DawMetersState>({ kind: 'loading' });
  const heardAt = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled) {
      heardAt.current = null;
      setState({ kind: 'loading' });
      return;
    }
    let live = true;
    let asking = false;
    const ask = () => {
      const now = Date.now();
      if (heardAt.current !== null && now - heardAt.current > DAW_METERS_QUIET_MS) {
        const seconds = Math.floor((now - heardAt.current) / 1000);
        setState({ kind: 'quiet', seconds, message: `Can't tell: the DAW's levels were last heard ${seconds} s ago.` });
      }
      if (asking) return;
      asking = true;
      levels
        .dawMeters()
        .then((answer) => {
          if (!live) return;
          if (!answer.ok) {
            heardAt.current = null;
            setState({ kind: 'off', message: answer.message });
            return;
          }
          heardAt.current = Date.now();
          setState({ kind: 'ready', meters: answer });
        })
        .catch((error: unknown) => {
          if (live && heardAt.current === null) setState({ kind: 'off', message: `Could not read the DAW's levels: ${apiErrorMessage(error)}` });
        })
        .finally(() => {
          asking = false;
        });
    };
    ask();
    const timer = setInterval(ask, DAW_METERS_EVERY_MS);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [levels, enabled]);

  return state;
}
