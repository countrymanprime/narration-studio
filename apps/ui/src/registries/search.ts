import { useEffect } from 'react';

/** One result a search source offers the jump menu (ADR 0780 decision 5). `group` is its heading, `sub` the muted line under the title. */
export type SearchHit = {
  group: string;
  title: string;
  sub?: string;
  run: () => void;
};

/** Returns the hits for a typed term. It matches the term itself and ignores case; it may be called on every keystroke, so it answers from memory. */
export type SearchSource = (term: string) => SearchHit[];

/** A term shorter than this queries no source: one letter matches everything and says nothing. */
const MIN_TERM_LENGTH = 2;

export type SearchRegistry = {
  /** Adds a source and returns the function that removes it. */
  register: (source: SearchSource) => () => void;
  /** Every source's hits for `term` (trimmed), in registration order. A source that throws is skipped. */
  searchAll: (term: string) => SearchHit[];
};

export function createSearchRegistry(): SearchRegistry {
  const sources = new Set<SearchSource>();
  return {
    register: (source) => {
      // A wrapper keeps two registrations of one function distinct, so each unregister removes only its own.
      const entry: SearchSource = (term) => source(term);
      sources.add(entry);
      return () => void sources.delete(entry);
    },
    searchAll: (term) => {
      const trimmed = term.trim();
      if (trimmed.length < MIN_TERM_LENGTH) return [];
      const hits: SearchHit[] = [];
      for (const source of sources) {
        try {
          hits.push(...source(trimmed));
        } catch (error) {
          // One broken source must not blank the menu, so the others still answer; the failure is said, not swallowed.
          console.warn('A search source failed and was skipped.', error);
        }
      }
      return hits;
    },
  };
}

const registry = createSearchRegistry();

/** Registers a source for the whole app and returns the function that removes it. */
export const registerSearchSource = registry.register;

/** Every registered source's hits for `term`. */
export const searchAll = registry.searchAll;

/** Registers `source` while the component is mounted; a new function replaces the old one. */
export function useSearchSource(source: SearchSource): void {
  useEffect(() => registerSearchSource(source), [source]);
}
