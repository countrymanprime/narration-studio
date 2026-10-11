import { useCallback, useEffect, useRef, useState } from 'react';
import { describeApiError } from '../../../../api/errorMessage';
import type { ExtractionDecision, ExtractionScanJob, ExtractionSource, ExtractionSuggestion } from '../../../../api/contracts/extraction';
import { overlay } from '../../../../overlay/overlayService';
import { usePort } from '../../../../ports/usePort';
import { availableSourceIds } from './selectors';

/** How often a running scan is asked for its progress. Nothing is asked while the scan is idle or after it ended. */
const POLL_MS = 1000;

export type ExtractionScan = {
  /** The running or last scan; `null` until the host has answered. */
  job: ExtractionScanJob | null;
  /** Scan was pressed and the host has not answered yet. */
  starting: boolean;
  running: boolean;
  /** Starts a scan with the sources that can run now; while one runs this joins it (ADR 0077). */
  start: () => Promise<void>;
  /** Stops the running scan; what the sources that finished added stays. */
  cancel: () => Promise<void>;
};

export type Suggestions = {
  suggestions: readonly ExtractionSuggestion[];
  /** The host's source list, for the row's source marks. */
  sources: readonly ExtractionSource[];
  loaded: boolean;
  /** The sentence a first load failed with, for the page's load error. */
  error: string | null;
  reload: () => Promise<void>;
  /** Shows a decision, or the undo of one, in the list without asking the host again. */
  changed: (decision: ExtractionDecision) => void;
  scan: ExtractionScan;
};

/**
 * The suggestions the host lists and the extraction scan that makes more, over `usePort('extraction')` (ADR 0076: the scan is a host job
 * that ends with one `job:ended` event). A running scan is asked for its percent and message on a timer; when the event arrives the
 * list is read once and the timer stops, so nothing polls while idle or after the end.
 */
export function useSuggestions({ pollMs = POLL_MS }: { pollMs?: number } = {}): Suggestions {
  const port = usePort('extraction');
  const system = usePort('system');
  const [suggestions, setSuggestions] = useState<readonly ExtractionSuggestion[]>([]);
  const [sources, setSources] = useState<readonly ExtractionSource[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [job, setJob] = useState<ExtractionScanJob | null>(null);
  const [starting, setStarting] = useState(false);
  const alive = useRef(true);
  const everLoaded = useRef(false);
  const busy = useRef({ starting: false, cancelling: false });

  useEffect(() => {
    alive.current = true;
    return () => void (alive.current = false);
  }, []);

  const fail = useCallback((cause: unknown) => alive.current && overlay.toast(describeApiError(cause), { tone: 'error' }), []);

  const reload = useCallback(async () => {
    try {
      const list = await port.extractionList();
      if (!alive.current) return;
      setSuggestions(list);
      setError(null);
      everLoaded.current = true;
      setLoaded(true);
    } catch (cause) {
      if (!alive.current) return;
      if (everLoaded.current) fail(cause);
      else setError(describeApiError(cause));
    }
  }, [port, fail]);

  // The first load: the list, the sources and the scan left running when the narrator was elsewhere.
  useEffect(() => {
    void reload();
    port.extractionSources().then((all) => alive.current && setSources(all), fail);
    port.extractionScanState().then((state) => alive.current && setJob(state), fail);
  }, [port, reload, fail]);

  // The end of a scan: its last state (the sentences of what failed) and the list, once each.
  useEffect(
    () =>
      system.subscribeJobEnded((event) => {
        if (event.kind !== 'extraction_scan') return;
        port.extractionScanState().then((state) => alive.current && setJob(state), fail);
        void reload();
      }),
    [system, port, reload, fail],
  );

  const running = job?.phase === 'running';
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => {
      port.extractionScanState().then((state) => alive.current && setJob(state), fail);
    }, pollMs);
    return () => clearInterval(timer);
  }, [running, port, pollMs, fail]);

  const start = useCallback(async () => {
    if (busy.current.starting) return;
    busy.current.starting = true;
    setStarting(true);
    try {
      const ids = availableSourceIds(await port.extractionSources());
      const started = await port.extractionScan(ids);
      if (alive.current) setJob(started);
    } catch (cause) {
      fail(cause);
    } finally {
      busy.current.starting = false;
      if (alive.current) setStarting(false);
    }
  }, [port, fail]);

  const cancel = useCallback(async () => {
    if (busy.current.cancelling) return;
    busy.current.cancelling = true;
    try {
      const stopped = await port.extractionScanCancel();
      if (alive.current) setJob(stopped);
    } catch (cause) {
      fail(cause);
    } finally {
      busy.current.cancelling = false;
    }
  }, [port, fail]);

  const changed = useCallback((decision: ExtractionDecision) => {
    const now = new Map([decision.suggestion, ...decision.settled].map((s) => [s.id, s]));
    setSuggestions((list) => list.map((s) => now.get(s.id) ?? s));
  }, []);

  return { suggestions, sources, loaded, error, reload, changed, scan: { job, starting, running, start, cancel } };
}
