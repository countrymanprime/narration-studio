import { useCallback, useEffect, useRef, useState } from 'react';
import { apiErrorMessage } from '../../../api/errorMessage';

/** How often a read of something that is still running is repeated. */
const POLL_MS = 500;
/** How often a read that failed is tried again, for as long as its notice is up. */
const RETRY_MS = 2000;

type HostRead<T> = {
  /** What the host last answered; kept (not emptied) when a later read fails, so the page can say it is out of date. */
  value: T | undefined;
  /** Why the latest read failed, or nothing once one has succeeded. */
  error: string | undefined;
  /** When the host last answered, in ms since the epoch. */
  lastHeard: number | undefined;
  /** When the host was last asked, answered or not, in ms since the epoch: what tells a narrator a fresh read was made. */
  lastAsked: number | undefined;
  /** Reads now. The one function behind Check again, the window regaining focus and the host's own events. */
  again: () => void;
  /** Shows an answer a start or a cancel brought back, numbered like a read so a slower read cannot undo it. */
  set: (next: T) => void;
};

/**
 * One thing the host holds, read when the page opens, when the window regains focus and on `again`, repeated every half second while
 * `running(value)` says it is going, and repeated every two seconds while a read has failed so a lost answer does not freeze the page.
 * Every read and every `set` takes a number when it is sent: an answer older than the one on screen is dropped (the host answered late, or
 * out of order), and an answer after the page was left writes nothing.
 */
export function useHostRead<T>(read: () => Promise<T>, running: (value: T) => boolean): HostRead<T> {
  const [value, setValue] = useState<T>();
  const [error, setError] = useState<string>();
  const [lastHeard, setLastHeard] = useState<number>();
  const [lastAsked, setLastAsked] = useState<number>();
  // A counter, not the message: two failures with the same words must still schedule the next try.
  const [failures, setFailures] = useState(0);
  const sent = useRef(0);
  const shown = useRef(0);
  const live = useRef(true);
  const readRef = useRef(read);
  readRef.current = read;
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);

  const accept = useCallback((seq: number, next: T) => {
    if (!live.current || seq < shown.current) return;
    shown.current = seq;
    setValue(next);
    setError(undefined);
    setLastHeard(Date.now());
    setLastAsked(Date.now());
  }, []);
  const again = useCallback(() => {
    const seq = ++sent.current;
    readRef.current().then(
      (next) => accept(seq, next),
      (failure) => {
        if (!live.current || seq < shown.current) return;
        setError(apiErrorMessage(failure));
        setLastAsked(Date.now());
        setFailures((count) => count + 1);
      },
    );
  }, [accept]);
  const set = useCallback((next: T) => accept(++sent.current, next), [accept]);

  useEffect(() => {
    again();
    window.addEventListener('focus', again);
    return () => window.removeEventListener('focus', again);
  }, [again]);

  const going = error !== undefined || (value !== undefined && running(value));
  useEffect(() => {
    if (!going) return;
    const timer = setTimeout(again, error === undefined ? POLL_MS : RETRY_MS);
    return () => clearTimeout(timer);
  }, [going, error, again, value, failures, lastHeard]);

  return { value, error, lastHeard, lastAsked, again, set };
}

/** "last heard 12 s ago", or "not heard yet". */
export function heardText(lastHeard: number | undefined, now = Date.now()): string {
  return lastHeard === undefined ? 'not heard yet' : `last heard ${Math.max(0, Math.round((now - lastHeard) / 1000))} s ago`;
}

/** "asked again just now" or "asked again 4 s ago": the answer to a press of Check again that found the host still quiet. */
export function askedText(lastAsked: number | undefined, now = Date.now()): string {
  const seconds = lastAsked === undefined ? undefined : Math.max(0, Math.round((now - lastAsked) / 1000));
  return seconds === undefined ? 'not asked yet' : seconds === 0 ? 'asked again just now' : `asked again ${seconds} s ago`;
}

/** "You checked again just now" or "You checked again 4 s ago": what a press of Check again says it did. */
export function checkedText(pressedAt: number, now = Date.now()): string {
  const seconds = Math.max(0, Math.round((now - pressedAt) / 1000));
  return seconds === 0 ? 'You checked again just now' : `You checked again ${seconds} s ago`;
}
