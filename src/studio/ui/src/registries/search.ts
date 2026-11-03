import { useEffect } from 'react';

/** One result a search source offers the jump menu (docs/architecture/studio-shell-and-registries.md#command-providers-and-go-to). `group` is its heading, `sub` the muted line under the title. */
export type SearchHit = {
  group: string;
  title: string;
  sub?: string;
  /** The title split around the matched term, so the menu can mark the match. `pre + hit + post` is the title. */
  snippet?: { pre: string; hit: string; post: string };
  run: () => void;
};

/** Returns the hits for a typed term. It matches the term itself and ignores case; it may be called on every keystroke, so it answers from memory. */
export type SearchSource = (term: string) => SearchHit[];

/**
 * Answers the hits for a typed term later, from the host. The menu asks it once the typing pauses, drops an answer to a term that is no
 * longer typed, and aborts `signal` when the term changes or the menu closes.
 */
export type AsyncSearchSource = (term: string, signal: AbortSignal) => Promise<SearchHit[]>;

/** A term shorter than this queries no source: one letter matches everything and says nothing. */
export const MIN_TERM_LENGTH = 2;

/** One source's hits, with the source's place in registration order, so a later answer lands where its source is. */
export type OrderedHits = { order: number; hits: SearchHit[] };
/** An asynchronous source asked for a term: its place, its group (for the menu's waiting row) and its answer. */
export type PendingHits = { order: number; group: string; answer: Promise<SearchHit[]> };

export type SearchRegistry = {
  /** Adds a source and returns the function that removes it. */
  register: (source: SearchSource) => () => void;
  /** Adds an asynchronous source whose hits come under `group`, and returns the function that removes it. */
  registerAsync: (source: AsyncSearchSource, group: string) => () => void;
  /** Every synchronous source's hits for `term` (trimmed), in registration order. A source that throws is skipped. */
  searchAll: (term: string) => SearchHit[];
  /** `searchAll`, each source's hits with its place. */
  searchNow: (term: string) => OrderedHits[];
  /** The asynchronous sources' places and groups, without asking them: what the menu waits for. Empty for a term too short to ask. */
  waitingFor: (term: string) => { order: number; group: string }[];
  /** Asks every asynchronous source for `term` (trimmed). A source that throws at once answers a rejected promise. */
  searchLater: (term: string, signal: AbortSignal) => PendingHits[];
};

type Registration = { order: number } & ({ kind: 'now'; source: SearchSource } | { kind: 'later'; source: AsyncSearchSource; group: string });

const askable = (term: string): string | null => {
  const trimmed = term.trim();
  return trimmed.length < MIN_TERM_LENGTH ? null : trimmed;
};

export function createSearchRegistry(): SearchRegistry {
  // A registration is its own object, so two registrations of one function stay distinct and each unregister removes only its own.
  const registrations = new Set<Registration>();
  let next = 0;
  const add = (registration: Registration) => {
    registrations.add(registration);
    return () => void registrations.delete(registration);
  };
  const later = () => [...registrations].filter((entry): entry is Extract<Registration, { kind: 'later' }> => entry.kind === 'later');
  const searchNow = (term: string): OrderedHits[] => {
    const trimmed = askable(term);
    if (trimmed === null) return [];
    const answers: OrderedHits[] = [];
    for (const entry of registrations) {
      if (entry.kind !== 'now') continue;
      try {
        answers.push({ order: entry.order, hits: entry.source(trimmed) });
      } catch (error) {
        // One broken source must not blank the menu, so the others still answer; the failure is said, not swallowed.
        console.warn('A search source failed and was skipped.', error);
      }
    }
    return answers;
  };
  return {
    register: (source) => add({ kind: 'now', source, order: next++ }),
    registerAsync: (source, group) => add({ kind: 'later', source, group, order: next++ }),
    searchAll: (term) => searchNow(term).flatMap((answer) => answer.hits),
    searchNow,
    waitingFor: (term) => (askable(term) === null ? [] : later().map(({ order, group }) => ({ order, group }))),
    searchLater: (term, signal) => {
      const trimmed = askable(term);
      if (trimmed === null) return [];
      return later().map(({ order, group, source }) => {
        let answer: Promise<SearchHit[]>;
        try {
          answer = source(trimmed, signal);
        } catch (error) {
          answer = Promise.reject(error instanceof Error ? error : new Error(String(error)));
        }
        return { order, group, answer };
      });
    },
  };
}

/** Hits from several sources in their sources' registration order. */
export const inSourceOrder = (answers: readonly OrderedHits[]): SearchHit[] => [...answers].sort((a, b) => a.order - b.order).flatMap((answer) => answer.hits);

const registry = createSearchRegistry();

/** Registers a source for the whole app and returns the function that removes it. */
export const registerSearchSource = registry.register;

/** Registers an asynchronous source for the whole app and returns the function that removes it. */
export const registerAsyncSearchSource = registry.registerAsync;

/** Every registered synchronous source's hits for `term`. */
export const searchAll = registry.searchAll;

/** The app registry's `searchNow`, `waitingFor` and `searchLater`, for the jump menu. */
export const searchNow = registry.searchNow;
export const waitingFor = registry.waitingFor;
export const searchLater = registry.searchLater;

/** Registers `source` while the component is mounted; a new function replaces the old one. */
export function useSearchSource(source: SearchSource): void {
  useEffect(() => registerSearchSource(source), [source]);
}

/** Registers an asynchronous `source` under `group` while the component is mounted; a new function replaces the old one. */
export function useAsyncSearchSource(source: AsyncSearchSource, group: string): void {
  useEffect(() => registerAsyncSearchSource(source, group), [source, group]);
}
