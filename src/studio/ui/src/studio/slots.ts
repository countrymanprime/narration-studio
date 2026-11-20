// The slot registry of the read-model store and the hooks typed over it. The chapter list is the first slot; the
// bookmarks list is the second. A slot reads through a port, so this file names no `useApi()`.

import { onChapterListWritten } from '../api/chapterListWrites';
import type { BookmarksApi } from '../api/contracts/bookmarks';
import type { ChapterSyncApi } from '../api/contracts/chapterSync';
import type { ManuscriptApi } from '../api/contracts/manuscript';
import type { SystemApi } from '../api/contracts/system';
import { bookmarksSchema } from '../api/schemas/bookmarks';
import { chaptersSchema, paragraphsSchema } from '../api/schemas/manuscript';
import { bindStudio } from './store/react';

/**
 * The in-app topic for a change to the manuscript's chapters that is not a job (a chapter's status or kind). The page that makes the
 * change calls `publish(MANUSCRIPT_CHANGED)`; the chapter list every other page reads is read again. An import is a job, and
 * `job:ended` already covers it.
 */
export const MANUSCRIPT_CHANGED = 'manuscript:changed';

export type HostEventApi = Pick<SystemApi, 'subscribeJobEnded'> & { subscribeRecordEnded?: (onEnded: () => void) => () => void } & Pick<
    ChapterSyncApi,
    'subscribeChapterSync'
  >;

/**
 * The chapter list: stale when a job ends (an import, a re-split) or a page publishes `MANUSCRIPT_CHANGED`, and reloaded when the window regains focus. The bookmarks:
 * every bookmark in reading order, reloaded on focus and by the bookmark commands after each change and each undo.
 */
export function createSlots(api: Pick<ManuscriptApi, 'manuscriptChapters'>, bookmarks: Pick<BookmarksApi, 'bookmarksList'>) {
  return {
    chapters: {
      schema: chaptersSchema,
      load: () => api.manuscriptChapters(),
      events: ['job:ended', 'chapters:written', 'daw:record-ended', 'chapter-sync'],
      topics: [MANUSCRIPT_CHANGED],
      refreshOnFocus: true,
    },
    bookmarks: { schema: bookmarksSchema, load: () => bookmarks.bookmarksList(), refreshOnFocus: true },
  };
}

/**
 * The most chapter text the store holds, in characters of JSON (about 8 MB: a 10 hour book's text), beyond which the least recently used chapters are dropped. Titles are
 * never budgeted: the chapter list is one slot of all of them. The owner can set this (#3658).
 */
const CHAPTER_TEXT_BUDGET = 8_000_000;

/**
 * The text of each chapter, keyed by chapter id, in the same store as the chapter list: stale when a job ends (an import or a re-split replaced the
 * manuscript) and emptied by a project switch. A page reads it with `useChapterText`; the Script page, the Booth and Proof used to keep a copy each.
 */
export function createKeyedSlots(api: Pick<ManuscriptApi, 'manuscriptParagraphs'>) {
  return {
    chapterText: {
      schema: paragraphsSchema,
      load: (chapterId: string) => api.manuscriptParagraphs(chapterId),
      budget: CHAPTER_TEXT_BUDGET,
      events: ['job:ended'],
    },
  };
}

export type StudioRegistry = ReturnType<typeof createSlots>;

/** The store's `subscribe(event, handler)` over the host's typed subscriptions. An event the host has no subscription for gets a no-op. */
export function createHostEvents(api: HostEventApi): (event: string, handler: () => void) => () => void {
  const warned = new Set<string>();
  return (event, handler) => {
    if (event === 'job:ended') return api.subscribeJobEnded(() => handler());
    if (event === 'chapters:written') return onChapterListWritten(handler);
    if (event === 'daw:record-ended') return api.subscribeRecordEnded?.(() => handler()) ?? (() => undefined);
    if (event === 'chapter-sync') return api.subscribeChapterSync(() => handler());
    if (import.meta.env.DEV && !warned.has(event)) {
      warned.add(event);
      console.warn(`studio: no host subscription for the event "${event}"`);
    }
    return () => undefined;
  };
}

export const { StudioProvider: StudioStoreProvider, useStudio } = bindStudio<StudioRegistry>();
