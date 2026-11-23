// Where the narrator left the Booth, per project: the chapter and the place in it. Opening the Booth with no chapter asked for returns to it.
// Every chapter's own place is kept beside it (`loadChapterPlace`), so a chapter the narrator comes back to opens where they left that
// chapter, not at its top, when nothing recorded says further (resume/resumeStart.ts).
// A per-viewer convenience in browser storage, never a host field (docs/reference/data-files.md has no row for it, as for the Script reader's
// position and Proof's last chapter). Storage can be missing, full or blocked, so every access is guarded and the Booth then opens as it
// would have without it.

import { readProjectStorage, writeProjectStorage, type LegacyEntry } from '../../../projectFolder';

export type LastPlace = { chapterId: string; paragraphId: string; word: number };

const PROJECT_KEY_LAST_PLACE = 'booth.lastPlace';
const PROJECT_KEY_CHAPTER_PLACES = 'booth.chapterPlaces';

const parseObject = (raw: string | null): Record<string, unknown> | null => {
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
};
const atOf = (value: unknown): number => {
  const at = (value as { at?: unknown } | null)?.at;
  return typeof at === 'number' && Number.isFinite(at) ? at : 0;
};

/** Two old spellings both hold a last place: the one whose chapter was left most recently wins, by the `at` its own chapter places carry; no `at` to tell them apart, the first. */
function newestLastPlace(entries: LegacyEntry[]): string {
  let best = entries[0]!;
  let bestAt = -1;
  for (const entry of entries) {
    const chapterId = parseObject(entry.value)?.chapterId;
    if (typeof chapterId !== 'string') continue;
    const sibling = entry.key.replace(`narration.${PROJECT_KEY_LAST_PLACE}.`, `narration.${PROJECT_KEY_CHAPTER_PLACES}.`);
    let at = -1;
    try {
      at = atOf(parseObject(window.localStorage.getItem(sibling))?.[chapterId]);
    } catch {
      /* storage unreadable: this one has no `at` */
    }
    if (at > bestAt) {
      best = entry;
      bestAt = at;
    }
  }
  return best.value;
}

/** Two old spellings both hold chapter places: merged chapter by chapter, the place left most recently (the larger `at`) winning, the first spelling on a tie. */
function mergedChapterPlaces(entries: LegacyEntry[]): string {
  const merged: Record<string, unknown> = {};
  for (const entry of entries) {
    for (const [chapterId, value] of Object.entries(parseObject(entry.value) ?? {})) {
      if (!(chapterId in merged) || atOf(value) > atOf(merged[chapterId])) merged[chapterId] = value;
    }
  }
  return Object.keys(merged).length > 0 ? JSON.stringify(merged) : entries[0]!.value;
}

export function loadLastPlace(projectFolder: string): LastPlace | null {
  try {
    const raw = readProjectStorage(PROJECT_KEY_LAST_PLACE, projectFolder, newestLastPlace);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const { chapterId, paragraphId, word } = parsed as Record<string, unknown>;
    if (typeof chapterId !== 'string' || chapterId === '') return null;
    return {
      chapterId,
      paragraphId: typeof paragraphId === 'string' ? paragraphId : '',
      word: typeof word === 'number' && Number.isFinite(word) && word > 0 ? Math.floor(word) : 0,
    };
  } catch {
    return null;
  }
}

export function saveLastPlace(projectFolder: string, place: LastPlace): void {
  writeProjectStorage(PROJECT_KEY_LAST_PLACE, projectFolder, JSON.stringify(place)); // unavailable storage: the Booth then opens on the DAW's chapter or the first, as it did
  saveChapterPlace(projectFolder, place);
}

/** A place in one chapter: the paragraph and the word in it. */
export type ChapterPlace = { paragraphId: string; word: number };

/** How many chapters' places a project keeps; the ones left longest ago go first. */
export const CHAPTER_PLACES_KEPT = 400;

type KeptPlaces = Record<string, ChapterPlace & { at: number }>;

function readChapterPlaces(projectFolder: string): KeptPlaces {
  try {
    const raw = readProjectStorage(PROJECT_KEY_CHAPTER_PLACES, projectFolder, mergedChapterPlaces);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
    const places: KeptPlaces = {};
    for (const [chapterId, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value !== 'object' || value === null) continue;
      const { paragraphId, word, at } = value as Record<string, unknown>;
      if (typeof paragraphId !== 'string' || paragraphId === '') continue;
      places[chapterId] = {
        paragraphId,
        word: typeof word === 'number' && Number.isFinite(word) && word > 0 ? Math.floor(word) : 0,
        at: typeof at === 'number' && Number.isFinite(at) ? at : 0,
      };
    }
    return places;
  } catch {
    return {};
  }
}

function saveChapterPlace(projectFolder: string, place: LastPlace): void {
  if (!place.paragraphId) return;
  const places = readChapterPlaces(projectFolder);
  const latest = Math.max(0, ...Object.values(places).map((kept) => kept.at)) + 1;
  places[place.chapterId] = { paragraphId: place.paragraphId, word: place.word, at: latest };
  const kept = Object.entries(places)
    .sort(([, a], [, b]) => b.at - a.at)
    .slice(0, CHAPTER_PLACES_KEPT);
  writeProjectStorage(PROJECT_KEY_CHAPTER_PLACES, projectFolder, JSON.stringify(Object.fromEntries(kept))); // unavailable storage: a chapter then opens where its recording ends, or at its top
}

/** Where the narrator last was in `chapterId` of this project, or null when the Booth keeps nothing for it. */
export function loadChapterPlace(projectFolder: string, chapterId: string): ChapterPlace | null {
  const kept = readChapterPlaces(projectFolder)[chapterId];
  if (kept) return { paragraphId: kept.paragraphId, word: kept.word };
  // A place saved before every chapter kept its own is the last chapter's.
  const last = loadLastPlace(projectFolder);
  return last && last.chapterId === chapterId && last.paragraphId ? { paragraphId: last.paragraphId, word: last.word } : null;
}
