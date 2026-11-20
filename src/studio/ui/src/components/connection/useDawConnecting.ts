import { useEffect, useState } from 'react';
import { useDawState } from '../../daw/useDawSession';

/** How long a DAW that is not answering is left alone, counted from when it stopped answering (or the project's DAW changed), before the app asks the narrator about it. */
export const DAW_CONNECT_GRACE_MS = 10_000;

export interface DawConnecting {
  /** The DAW is off but the app is still connecting to it: nothing asks the narrator yet. */
  connecting: boolean;
  /** The host is starting the DAW (a start the app made that has not answered yet): the part of `connecting` the host says outright. */
  starting: boolean;
  /** The one sentence for the chip while `connecting`: "Starting REAPER…" or "Connecting to REAPER…". */
  label: (dawName: string) => string;
}

/**
 * The one "connecting" state of the app (#3668), read from the DAW session. A DAW that is not answering is connecting, not failed, while
 * the host has not said yet (the first read), while the host says it is starting it (`DawChoice.state === 'starting'`, which the host holds
 * for up to 90 s and then reports as a bridge problem), and for `graceMs` after it stopped answering. Only then does the page's dialog ask.
 * The clock starts when the DAW stops answering, never at app start, so a project opened a minute after the app is given its time too.
 */
export function useDawConnecting(off: boolean, graceMs = DAW_CONNECT_GRACE_MS): DawConnecting {
  const choice = useDawState((state) => state.choice);
  const offSince = useDawState((state) => state.offSince);
  const [now, setNow] = useState(() => Date.now());
  const left = off && offSince !== null ? Math.max(0, offSince + graceMs - now) : 0;
  useEffect(() => {
    if (left <= 0) return;
    const timer = setTimeout(() => setNow(Date.now()), left);
    return () => clearTimeout(timer);
  }, [left]);
  const starting = off && choice?.state === 'starting';
  const connecting = off && (choice === undefined || starting || left > 0);
  return { connecting, starting, label: (dawName) => (starting ? `Starting ${dawName}…` : `Connecting to ${dawName}…`) };
}
