import { useCallback, useEffect, useState } from 'react';
import type { DawCapabilities } from '../../../api/contracts/daw';
import { apiErrorMessage } from '../../../api/errorMessage';
import { usePort } from '../../../ports/usePort';

export type Gate = { ok: true } | { ok: false; reason: string };

export type DawGates = {
  dawName: string;
  open: Gate;
  play: Gate;
  recheck: Gate;
  /** Set when the last read of the DAW's capabilities failed: the gates are shut with this sentence and say so, not "Checking". */
  readProblem?: string;
  /** Reads the capabilities again (the visible Check again). */
  checkAgain: () => void;
};

const CHECKING = 'Checking what the DAW can do…';
const NOT_OFFERED = 'Your DAW does not offer this.';

// Which capability each action rides on: showing a file in the DAW and playing a stretch of it are the DAW's file_reveal and
// file_preview (bindings_master_files.go); checking the files again reads the project's items. The host words the refusal; this
// file words none (except the two moments before it has answered).
const OPEN = 'file_reveal';
const PLAY = 'file_preview';
const RECHECK = 'project_read';

function gateOf(capabilities: DawCapabilities | undefined, name: string): Gate {
  if (!capabilities) return { ok: false, reason: CHECKING };
  const support = capabilities.capabilities[name];
  return support?.available ? { ok: true } : { ok: false, reason: support?.message ?? NOT_OFFERED };
}

/** The DAW's name as the capability report gives it, never a fixed one: "your DAW" when there is none. */
const dawNameOf = (capabilities: DawCapabilities | undefined): string => (capabilities && capabilities.daw !== 'none' ? capabilities.daw : 'your DAW');

/**
 * What the launch's DAW lets the files table do, from `usePort('daw').capabilities()`. The report is read again on every
 * `daw_capabilities_changed` event, when the window regains focus, and on `checkAgain`; a read that fails shuts the gates with a
 * sentence that says so (never "Checking" for ever) and keeps the last good report out of sight, since it may be stale.
 */
export function useDawGates(): DawGates {
  const daw = usePort('daw');
  const [capabilities, setCapabilities] = useState<DawCapabilities>();
  const [readProblem, setReadProblem] = useState<string>();
  const read = useCallback(() => {
    let current = true;
    daw.capabilities().then(
      (found) => {
        if (!current) return;
        setCapabilities(found);
        setReadProblem(undefined);
      },
      (error: unknown) => {
        if (!current) return;
        setCapabilities(undefined);
        setReadProblem(`Can't tell what your DAW can do right now: ${apiErrorMessage(error)}`);
      },
    );
    return () => {
      current = false;
    };
  }, [daw]);
  useEffect(() => {
    let stop = read();
    const again = () => {
      stop();
      stop = read();
    };
    window.addEventListener('focus', again);
    const unsubscribe = daw.subscribeCapabilities?.((next) => {
      setCapabilities(next);
      setReadProblem(undefined);
    });
    return () => {
      stop();
      window.removeEventListener('focus', again);
      unsubscribe?.();
    };
  }, [daw, read]);
  const unreadable = (gate: Gate): Gate => (readProblem && !gate.ok ? { ok: false, reason: readProblem } : gate);
  return {
    dawName: dawNameOf(capabilities),
    open: unreadable(gateOf(capabilities, OPEN)),
    play: unreadable(gateOf(capabilities, PLAY)),
    recheck: unreadable(gateOf(capabilities, RECHECK)),
    readProblem,
    checkAgain: () => void read(),
  };
}
