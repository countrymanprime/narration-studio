import { useCallback, useMemo, useRef } from 'react';
import { usePort } from '../../../ports/usePort';
import { playStopLine, type PlayedWord, type PlayPath } from './playStopLine';

export interface PlayStopReport {
  /** A play of words that ends on `word` at `planned` seconds has started; its path is not known until a provider takes it. */
  begin: (word: PlayedWord, planned: number) => void;
  /** A play that ends nowhere in particular has started (or a halt dropped the one being tracked): nothing is reported for it. */
  clear: () => void;
  /** Which player took the play being tracked; no effect when none is tracked. */
  setPath: (path: PlayPath) => void;
  /** Writes one line in the host log (host.log) about how the tracked play ended, once; `actual` is where it was stopped, or null when unknown. */
  reportStop: (actual: number | null) => void;
}

/** Tracks the play of words that is running so its end can be traced to the time it was stopped at (a clipped word shows as a small `tail`). */
/** The returned object is stable while the `system` port is, so a callback may depend on it. */
export function usePlayStopReport(): PlayStopReport {
  const system = usePort('system');
  const played = useRef<{ word: PlayedWord; planned: number; path: PlayPath } | null>(null);
  const begin = useCallback((word: PlayedWord, planned: number) => {
    played.current = { word, planned, path: 'unknown' };
  }, []);
  const clear = useCallback(() => {
    played.current = null;
  }, []);
  const setPath = useCallback((path: PlayPath) => {
    if (played.current) played.current.path = path;
  }, []);
  const reportStop = useCallback(
    (actual: number | null): void => {
      const p = played.current;
      played.current = null;
      if (!p) return;
      void system.reportClientDiagnostic('play_stop', playStopLine({ word: p.word, planned: p.planned, actual, path: p.path })).catch(() => undefined);
    },
    [system],
  );
  return useMemo(() => ({ begin, clear, setPath, reportStop }), [begin, clear, setPath, reportStop]);
}
