// The jump menu's search hits for the typed term: the synchronous sources' at once, as they always were, and the asynchronous
// sources' once the typing pauses. Only the answer to the term still typed is shown; a source that does not answer in time, or fails,
// is said in a toast and leaves the rest listed. Typing the term again asks again, so a source that timed out is retried.
import { useEffect, useMemo, useRef, useState } from 'react';
import { searchLater, searchNow, waitingFor, type OrderedHits, type SearchHit } from '../../registries/search';

/** How long the typing must pause before an asynchronous source is asked. */
export const SEARCH_DEBOUNCE_MS = 150;
/** How long an asynchronous source may take before the menu stops waiting for it. */
export const SEARCH_WAIT_MS = 8000;

/** One source's place in the menu, in registration order: its hits, or the group of an asynchronous source still waited for. */
export type SearchSlot = { order: number; hits: SearchHit[] } | { order: number; waiting: string };

/** Why an asynchronous source gave no hits: it took longer than SEARCH_WAIT_MS, or it failed with `reason`. */
export type SearchFailure = { group: string } & ({ kind: 'slow' } | { kind: 'failed'; reason: string });

/**
 * The answers to one ask: one typing of a term. A term typed again is a new ask, so the answers (or the sources given up on) of an
 * earlier typing are not shown for it.
 */
type Answers = { ask: object | null; answered: OrderedHits[]; settled: ReadonlySet<number> };

const timeout = (ms: number, signal: AbortSignal) =>
  new Promise<'slow'>((resolve) => {
    const timer = setTimeout(() => resolve('slow'), ms);
    signal.addEventListener('abort', () => clearTimeout(timer));
  });

/** Each source's place for `term` (empty when `enabled` is false: a `>` command search). `onFailure` hears each source that did not answer. */
export function useJumpSearch(term: string, enabled: boolean, onFailure: (failure: SearchFailure) => void): SearchSlot[] {
  const now = useMemo(() => (enabled ? searchNow(term) : []), [enabled, term]);
  const expected = useMemo(() => (enabled ? waitingFor(term) : []), [enabled, term]);
  // A new object for each change of the term: the token an answer must carry to be shown.
  const ask = useMemo(() => ({ term }), [term]);
  const [answers, setAnswers] = useState<Answers>({ ask: null, answered: [], settled: new Set() });
  // Read when an answer settles, so a new function each render does not ask the sources again.
  const failed = useRef(onFailure);
  useEffect(() => {
    failed.current = onFailure;
  }, [onFailure]);

  useEffect(() => {
    if (!expected.length) return;
    const controller = new AbortController();
    const settle = (order: number, hits: SearchHit[]) =>
      setAnswers((current) => {
        const base = current.ask === ask ? current : { ask, answered: [], settled: new Set<number>() };
        return { ask, answered: [...base.answered, { order, hits }], settled: new Set([...base.settled, order]) };
      });
    const debounce = setTimeout(() => {
      // Each source has its own signal, aborted with the term's or when the menu stops waiting for it, so a source that keeps its
      // answers can drop one that never came.
      const own = new Map<number, AbortController>();
      const signalFor = (order: number): AbortSignal => {
        const one = new AbortController();
        controller.signal.addEventListener('abort', () => one.abort(), { once: true });
        own.set(order, one);
        return one.signal;
      };
      for (const { order, group, answer } of searchLater(term, signalFor)) {
        void Promise.race([answer, timeout(SEARCH_WAIT_MS, controller.signal)]).then(
          (result) => {
            if (controller.signal.aborted) return;
            if (result === 'slow') {
              own.get(order)?.abort();
              failed.current({ group, kind: 'slow' });
            }
            settle(order, result === 'slow' ? [] : result);
          },
          (error: unknown) => {
            if (controller.signal.aborted) return;
            failed.current({ group, kind: 'failed', reason: error instanceof Error ? error.message : String(error) });
            settle(order, []);
          },
        );
      }
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      clearTimeout(debounce);
      controller.abort();
    };
  }, [ask, expected, term]);

  // Answers to an earlier ask are not shown: until this ask's answers arrive, its sources are waited for.
  const current = answers.ask === ask ? answers : { answered: [], settled: new Set<number>() };
  const waiting = expected.filter(({ order }) => !current.settled.has(order)).map(({ order, group }) => ({ order, waiting: group }));
  return [...now, ...current.answered, ...waiting].sort((a, b) => a.order - b.order);
}
