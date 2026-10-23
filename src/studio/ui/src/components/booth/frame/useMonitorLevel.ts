import { useCallback, useEffect, useRef, useState } from 'react';
import { apiErrorMessage } from '../../../api/errorMessage';
import { usePort } from '../../../ports/usePort';

/** How long a drag rests before its level is sent: a drag is many values a second, the DAW needs the one it stops on (and one on the way). */
const SEND_AFTER_MS = 120;

export type MonitorLevelState =
  /** The DAW has not answered the first read. */
  | { kind: 'loading' }
  /** The DAW's level; `saving` while a change is on its way; `problem` is why the last change did not take (the slider stays usable). */
  | { kind: 'ready'; level: number; saving: boolean; problem?: string }
  /** The DAW refused or cannot be asked, with its own sentence; the last level it held is kept when there was one. */
  | { kind: 'off'; message: string; level: number | null }
  /** A read or a change failed to reach the DAW: the last level it confirmed, and why. */
  | { kind: 'failed'; message: string; level: number | null };

/**
 * The DAW's monitor (output) level behind the Levels menu's slider. It reads the level when the menu opens (it mounts then) and when the window is
 * looked at, since the narrator can move it in the DAW. A drag is sent after it rests, one call at a time with only the newest value waiting
 * behind it, and what the DAW answers is what the slider shows (it may round); a change the DAW refuses puts the slider back on the level it
 * confirmed and says why. Nothing is sent after the menu is closed.
 */
export function useMonitorLevel(): { state: MonitorLevelState; set: (level: number) => void } {
  const levels = usePort('dawLevels');
  const [state, setState] = useState<MonitorLevelState>({ kind: 'loading' });
  const confirmed = useRef<number | null>(null);
  const wanted = useRef<number | null>(null);
  const inFlight = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const live = useRef(true);
  const reads = useRef(0);

  const failWith = useCallback((kind: 'off' | 'failed', message: string) => {
    wanted.current = null;
    // A change that did not take leaves the slider where the DAW confirmed it, usable again, with the reason beside it. Only a level the DAW never
    // gave (a first read that failed) leaves nothing to show.
    if (confirmed.current !== null) setState({ kind: 'ready', level: confirmed.current, saving: false, problem: message });
    else setState({ kind, message, level: null });
  }, []);

  const read = useCallback(() => {
    const mine = ++reads.current;
    levels
      .dawMonitorLevel()
      .then((answer) => {
        // A newer read or a change in flight is the later word.
        if (!live.current || mine !== reads.current || inFlight.current || wanted.current !== null) return;
        if (!answer.ok) return failWith('off', answer.message);
        confirmed.current = answer.level;
        setState({ kind: 'ready', level: answer.level, saving: false });
      })
      .catch((error: unknown) => {
        if (!live.current || mine !== reads.current || inFlight.current) return;
        failWith('failed', `Could not read the monitor level: ${apiErrorMessage(error)}`);
      });
  }, [levels, failWith]);

  const send = useCallback(() => {
    if (inFlight.current || wanted.current === null) return;
    const level = wanted.current;
    inFlight.current = true;
    levels
      .dawSetMonitorLevel(level)
      .then((answer) => {
        inFlight.current = false;
        if (!live.current) return;
        if (!answer.ok) return failWith('off', answer.message);
        confirmed.current = answer.level;
        if (wanted.current !== null && wanted.current !== level) {
          // The narrator moved on while this went: the newest value goes next, and the slider stays where their hand is.
          send();
          return;
        }
        wanted.current = null;
        setState({ kind: 'ready', level: answer.level, saving: false });
      })
      .catch((error: unknown) => {
        inFlight.current = false;
        if (!live.current) return;
        failWith('failed', `The monitor level could not be changed: ${apiErrorMessage(error)}`);
      });
  }, [levels, failWith]);

  const set = useCallback(
    (level: number) => {
      wanted.current = level;
      setState({ kind: 'ready', level, saving: true });
      clearTimeout(timer.current);
      timer.current = setTimeout(send, SEND_AFTER_MS);
    },
    [send],
  );

  useEffect(() => {
    live.current = true;
    read();
    const look = () => document.visibilityState !== 'hidden' && read();
    window.addEventListener('focus', look);
    return () => {
      live.current = false;
      clearTimeout(timer.current);
      window.removeEventListener('focus', look);
    };
  }, [read]);

  return { state, set };
}
