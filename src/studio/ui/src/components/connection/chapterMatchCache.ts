import { useEffect, useReducer } from 'react';
import type { ChapterTrackMatch } from '../../api/contracts/chapterTrackMap';

/**
 * The DAW's tracks matched to one chapter, kept for the project that was open when it was read (#3669). The Booth reads it ahead, as soon as
 * it knows the chapter, so the dialog that links an unlinked chapter opens with the tracks to choose from instead of reading them while the
 * narrator waits. The dialog still reads again behind them: a cached match is a starting point, never the last word, and it keeps the time
 * it was read so "Last checked" never claims more than it knows.
 */
export interface CachedMatch {
  match: ChapterTrackMatch;
  /** When the host answered. */
  at: number;
}

/** A match read ahead is read again when it is older than this: the DAW's tracks change while the app is open. */
const MATCH_FRESH_MS = 30_000;
/** How long the not-linked dialog's automatic opening waits for the read ahead before it opens and reads for itself. */
const MATCH_WAIT_MS = 2_500;
/** How long a read ahead may take before it is given up. */
const MATCH_READ_MS = 8_000;

const matches = new Map<string, CachedMatch>();
const reading = new Map<string, Promise<unknown>>();
/** Keys whose read ahead has ended, answered or failed: nothing more is coming for them. */
const settled = new Set<string>();
const listeners = new Set<() => void>();
const tell = () => listeners.forEach((listener) => listener());

const keyOf = (project: string | null, chapterId: string) => (project ? `${project}\u0000${chapterId}` : null);

export function cachedMatch(project: string | null, chapterId: string): CachedMatch | undefined {
  const key = keyOf(project, chapterId);
  return key ? matches.get(key) : undefined;
}

/** Keeps an answer from the dialog's own read, unless a newer one is already in: `askedAt` is when this read was asked. */
export function rememberMatch(project: string | null, chapterId: string, match: ChapterTrackMatch, askedAt = Date.now(), at = Date.now()): void {
  const key = keyOf(project, chapterId);
  if (!key) return;
  const have = matches.get(key);
  if (have && have.at > askedAt) return;
  matches.set(key, { match, at });
  tell();
}

/** Reads the match in the background, once at a time per chapter and not again while it is fresh (unless `force`: the DAW has just come back); a failed read leaves nothing behind, so the dialog reads for itself. */
export function prefetchMatch(project: string | null, chapterId: string, read: () => Promise<ChapterTrackMatch>, force = false): void {
  const key = keyOf(project, chapterId);
  if (!key || reading.has(key)) return;
  const have = matches.get(key);
  if (!force && have && Date.now() - have.at < MATCH_FRESH_MS) return;
  settled.delete(key);
  const startedAt = Date.now();
  // A read the host never answers ends after MATCH_READ_MS, so it cannot block the next read ahead for the app's life.
  const bound = new Promise<never>((_, reject) => setTimeout(() => reject(new Error('no answer')), MATCH_READ_MS));
  const work = Promise.race([read(), bound]).then(
    (match) => {
      // A read that lands after the dialog's own newer read does not replace it.
      const now = matches.get(key);
      if (!now || now.at < startedAt) matches.set(key, { match, at: Date.now() });
    },
    () => undefined,
  );
  reading.set(key, work);
  void work.finally(() => {
    reading.delete(key);
    settled.add(key);
    tell();
  });
}

/**
 * Whether the not-linked dialog may open now: the tracks are in, or the read ahead ended without them (the dialog then reads for itself), or
 * `MATCH_WAIT_MS` has run out. Until then the notice's chip is on screen and the dialog is not, so it never opens on a list it cannot offer (#3669).
 */
export function useMatchAhead(project: string | null, chapterId: string): boolean {
  const [, wake] = useReducer((count: number) => count + 1, 0);
  const [waited, giveUp] = useReducer(() => true, false);
  useEffect(() => {
    listeners.add(wake);
    const timer = setTimeout(giveUp, MATCH_WAIT_MS);
    return () => {
      listeners.delete(wake);
      clearTimeout(timer);
    };
  }, [project, chapterId]);
  const key = keyOf(project, chapterId);
  if (key === null || waited || !reading.has(key)) return true;
  // A read is on its way: an older match is not a reason to open on it.
  const have = matches.get(key);
  return !!have && Date.now() - have.at < MATCH_FRESH_MS;
}

/** The cached match for a chapter, following the cache: an open dialog that is still reading takes the read ahead the moment it lands. */
export function useCachedMatch(project: string | null, chapterId: string): CachedMatch | undefined {
  const [, wake] = useReducer((count: number) => count + 1, 0);
  useEffect(() => {
    listeners.add(wake);
    return () => {
      listeners.delete(wake);
    };
  }, []);
  return cachedMatch(project, chapterId);
}

/** For tests: nothing carries over from one to the next. */
export function forgetMatches(): void {
  matches.clear();
  reading.clear();
  settled.clear();
  tell();
}
