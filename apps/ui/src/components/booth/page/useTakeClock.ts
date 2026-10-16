import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

const whole = (ms: number): number => Math.max(0, Math.floor(ms / 1000));

/**
 * The running take's length, from the wall clock and not from a count of ticks: a machine that slept, or a window in the background whose
 * timers are throttled, shows the true time as soon as it is looked at (a tick, the window's focus, or the page turning visible). The DAW
 * records on its own clock whatever this window does, so nothing here pauses: a question that holds the reading does not hold the take.
 * A clock set back reads 0, never a negative time.
 *
 * `seconds` re-renders the page once a second; `read()` is the exact whole seconds now (or at the stop of a take that ended), for the
 * moments that need the length, such as a passage map's mark or a roll's position.
 */
export function useTakeClock(recording: boolean): { seconds: number; read: () => number } {
  const startedAt = useRef<number | null>(null);
  const ended = useRef(0);
  const read = useCallback(() => (startedAt.current === null ? ended.current : whole(Date.now() - startedAt.current)), []);
  const [seconds, setSeconds] = useState(0);
  // Before paint, so a take's first frame already reads 0 and its stop already holds the length.
  useLayoutEffect(() => {
    if (recording) {
      startedAt.current = Date.now();
      ended.current = 0;
    } else if (startedAt.current !== null) {
      ended.current = whole(Date.now() - startedAt.current);
      startedAt.current = null;
    }
    setSeconds(read());
  }, [recording, read]);
  useEffect(() => {
    if (!recording) return;
    const look = () => setSeconds(read());
    const timer = window.setInterval(look, 1000);
    const onVisible = () => document.visibilityState === 'visible' && look();
    window.addEventListener('focus', look);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', look);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [recording, read]);
  return { seconds, read };
}
