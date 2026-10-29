import type { WordTimes } from '../../../api/contracts/daw';
import type { ChapterDoc } from '../model';

/**
 * The two clocks of the Editing page, as a two-way map over one table: where each word plays in the DAW project (`WordTimes`, made by the host from the
 * alignment's source times and the items the DAW has now). The document's clock (`state.playT`, the ribbon, every word's `t0`/`t1`) is the page's own;
 * the project's is the DAW's. A second on one is found by the word it falls in and put on the other by how far through the word it is.
 *
 * Nothing is guessed. A second no placed word covers (the gap between words, a word cut out of the project, a word the check did not hear) maps to
 * null; it never takes a neighbour's time. Every consumer of the DAW's time (the follow-along, play-from-a-word, play-a-range, the cursor sync) reads
 * this one map (wordClock.guard.test.ts).
 */
export interface WordClock {
  /** The table this map was made from: its version says which project state it holds. */
  readonly version: string;
  /** The document second at project second `projectT`, or null when no placed word plays then. */
  docAt(projectT: number): number | null;
  /** The word that plays at project second `projectT` and the document second in it, or null when no placed word plays then. */
  wordAt(projectT: number): { key: string; t: number } | null;
  /** The project second at document second `docT`, or null when no placed word covers it. */
  projectAt(docT: number): number | null;
  /** The project second a play that ends at document second `docT` ends at: the end of the word it ends in, carried on for the tail of its sound. */
  projectEndAt(docT: number): number | null;
  /** The project second the chapter's last placed word ends, or null when no word is placed. */
  end(): number | null;
  /** Why `projectAt` has no project second for `docT`, in the narrator's words, so a play that falls back to the app can say which check failed. `daw` is the DAW's name. */
  whyNotPlaced(docT: number, daw: string): string;
}

/** One placed word on both clocks. */
interface Entry {
  key: string;
  /** Project seconds. */
  start: number;
  end: number;
  /** Document seconds. */
  t0: number;
  t1: number;
}

const EPS = 1e-6;
/** How many words before the one that starts last are looked at for one that still covers a project second (words of overlapping items). */
const OVERLAP_LOOKBACK = 16;
/** The most a play's end may run past the last word it ends after, for the tail of the word's sound. */
const MAX_PAST_WORD_SECONDS = 1;

/**
 * The map for `doc`'s words over `table`. `tokenOf` says which alignment token a word of the page is (the page's locator); a word with no token, or whose
 * token is not placed, or whose time on the page is not a stretch, is not in the map.
 */
export function buildWordClock(table: WordTimes, doc: ChapterDoc, tokenOf: (key: string) => number | undefined): WordClock {
  const rows = new Map(table.words.filter((w) => w.state === 'placed').map((w) => [w.i, w]));
  const states = new Map(table.words.map((w) => [w.i, w.state]));
  const entries: Entry[] = [];
  /** Every word the page times, placed or not, with what the table says of it: for saying why a second has no place. */
  const timed: Array<{ t0: number; t1: number; token: number | undefined }> = [];
  for (const item of doc.items) {
    if (item.kind !== 'w' || item.cut || item.t0 == null || item.t1 == null || !(item.t1 > item.t0)) continue;
    const token = tokenOf(item.key);
    timed.push({ t0: item.t0, t1: item.t1, token });
    const row = token === undefined ? undefined : rows.get(token);
    if (row && row.end >= row.start) entries.push({ key: item.key, start: row.start, end: row.end, t0: item.t0, t1: item.t1 });
  }
  const byProject = [...entries].sort((a, b) => a.start - b.start);
  const byDoc = [...entries].sort((a, b) => a.t0 - b.t0);

  const lastAtOrBefore = (list: readonly Entry[], at: (e: Entry) => number, t: number): number => {
    let lo = 0;
    let hi = list.length - 1;
    let hit = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (at(list[mid]) <= t + EPS) {
        hit = mid;
        lo = mid + 1;
      } else hi = mid - 1;
    }
    return hit;
  };
  const along = (e: Entry, projectT: number): number => (e.end > e.start ? e.t0 + ((projectT - e.start) / (e.end - e.start)) * (e.t1 - e.t0) : e.t0);
  /** The word that plays at `projectT`: of those covering it, the one that starts latest (REAPER's rule for overlapping items). */
  const covering = (projectT: number): Entry | null => {
    for (let i = lastAtOrBefore(byProject, (e) => e.start, projectT), n = 0; i >= 0 && n < OVERLAP_LOOKBACK; i--, n++) {
      if (projectT < byProject[i].end - EPS || (byProject[i].end === byProject[i].start && Math.abs(projectT - byProject[i].start) <= EPS)) return byProject[i];
    }
    return null;
  };
  const containing = (docT: number): Entry | null => {
    const i = lastAtOrBefore(byDoc, (e) => e.t0, docT);
    return i >= 0 && docT < byDoc[i].t1 - EPS ? byDoc[i] : null;
  };
  const last = byProject.reduce((a, e) => Math.max(a, e.end), -Infinity);
  const ok = (t: number): boolean => Number.isFinite(t) && t >= 0;

  return {
    version: table.version,
    docAt: (projectT) => {
      const word = ok(projectT) ? covering(projectT) : null;
      return word ? along(word, projectT) : null;
    },
    wordAt: (projectT) => {
      const word = ok(projectT) ? covering(projectT) : null;
      return word ? { key: word.key, t: along(word, projectT) } : null;
    },
    projectAt: (docT) => {
      const word = ok(docT) ? containing(docT) : null;
      if (!word) return null;
      return word.start + ((docT - word.t0) / (word.t1 - word.t0)) * (word.end - word.start);
    },
    projectEndAt: (docT) => {
      if (!ok(docT)) return null;
      const i = lastAtOrBefore(byDoc, (e) => e.t0, docT - 1e-3);
      if (i < 0) return null;
      const word = byDoc[i];
      if (docT <= word.t1 + EPS) return word.start + ((Math.min(docT, word.t1) - word.t0) / (word.t1 - word.t0)) * (word.end - word.start);
      if (docT - word.t1 > MAX_PAST_WORD_SECONDS) return null;
      const rate = (word.end - word.start) / (word.t1 - word.t0);
      return word.end + (docT - word.t1) * rate;
    },
    end: () => (byProject.length ? last : null),
    whyNotPlaced: (docT, daw) => {
      const word = ok(docT) ? timed.find((w) => docT >= w.t0 - EPS && docT < w.t1 - EPS) : undefined;
      if (!word) return 'There is no recorded word at that time in this chapter.';
      const state = word.token === undefined ? undefined : states.get(word.token);
      if (state === 'not_in_project')
        return `That word's audio is not in ${daw}'s project now: it was cut out, trimmed off or muted there, or moved off the chapter's track.`;
      if (state === 'not_heard') return 'The recording check heard nothing for that word.';
      if (state === undefined) return `That word is not in the recording check's alignment, so ${daw} has no place for it.`;
      return `${daw} has no place for that word.`;
    },
  };
}
