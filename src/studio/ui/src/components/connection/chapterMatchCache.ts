import type { ChapterTrackMatch } from '../../api/contracts/chapterTrackMap';

/**
 * The DAW's tracks matched to one chapter, kept for the project that was open when it was read (#3669). The Booth reads it ahead, as soon as
 * it knows the chapter, so the dialog that links an unlinked chapter opens with the tracks to choose from instead of reading them while the
 * narrator waits. The dialog still reads again behind what it shows; a cached match is a starting point, never the last word.
 */
const matches = new Map<string, ChapterTrackMatch>();
const reading = new Map<string, Promise<unknown>>();

const keyOf = (project: string | null, chapterId: string) => (project ? `${project}\u0000${chapterId}` : null);

export function cachedMatch(project: string | null, chapterId: string): ChapterTrackMatch | undefined {
  const key = keyOf(project, chapterId);
  return key ? matches.get(key) : undefined;
}

export function rememberMatch(project: string | null, chapterId: string, match: ChapterTrackMatch): void {
  const key = keyOf(project, chapterId);
  if (key) matches.set(key, match);
}

/** Reads the match in the background, once at a time per chapter; a failed read leaves nothing behind, so the dialog reads for itself. */
export function prefetchMatch(project: string | null, chapterId: string, read: () => Promise<ChapterTrackMatch>): void {
  const key = keyOf(project, chapterId);
  if (!key || matches.has(key) || reading.has(key)) return;
  const work = read().then(
    (match) => {
      matches.set(key, match);
    },
    () => undefined,
  );
  reading.set(key, work);
  void work.finally(() => reading.delete(key));
}

/** For tests: nothing carries over from one to the next. */
export function forgetMatches(): void {
  matches.clear();
  reading.clear();
}
