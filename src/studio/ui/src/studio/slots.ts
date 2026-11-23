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
 * The chapter list: stale when a job ends (an import, a re-split), a call that changes a recorded field settles (`chapters:written`), a DAW record ends,
 * a chapter sync updates, or a page publishes `MANUSCRIPT_CHANGED`, and reloaded when the window regains focus. The bookmarks:
 * every bookmark in reading order, reloaded on focus and by the bookmark commands after each change and each undo.
 */
export function createSlots(api: Pick<ManuscriptApi, 'manuscriptChapters'>, bookmarks: Pick<BookmarksApi, 'bookmarksList'>) {
  return {
    chapters: {
      schema: chaptersSchema,
      // The host names the project it read the list from, and the store holds the list under that project (#4040).
      read: async () => {
        const answer = await api.manuscriptChapters();
        return { project: answer.project, payload: answer.chapters };
      },
      events: ['job:ended', 'chapters:written', 'daw:record-ended', 'chapter-sync'],
      topics: [MANUSCRIPT_CHANGED],
      refreshOnFocus: true,
    },
    bookmarks: { schema: bookmarksSchema, load: () => bookmarks.bookmarksList(), refreshOnFocus: true },
  };
}

/**
 * The most chapter text the store holds, in characters of JSON (UTF-16 units, so about twice that in bytes of heap): 8,000,000 holds roughly 100 hours of narration
 * text at about 9,300 words an hour, so a long book is held whole and the budget only bites on an extreme one. The least recently used chapters beyond it are dropped,
 * except those a reader is showing. Titles are never budgeted: the chapter list is one slot of all of them. The owner can set this (#3658).
 */
const CHAPTER_TEXT_BUDGET = 8_000_000;

/**
 * The text of each chapter, keyed by chapter id, in the same store as the chapter list: stale when a job ends (an import or a re-split replaced the
 * manuscript) or a page publishes `MANUSCRIPT_CHANGED`, and emptied by a project switch. `useChapterText` reads it; the Script page, the Booth and Proof
 * each still keep a copy of their own until their readers move onto it (#3658).
 */
export function createKeyedSlots(api: Pick<ManuscriptApi, 'manuscriptParagraphs'>) {
  return {
    chapterText: {
      schema: paragraphsSchema,
      load: (chapterId: string) => api.manuscriptParagraphs(chapterId),
      budget: CHAPTER_TEXT_BUDGET,
      events: ['job:ended'],
      topics: [MANUSCRIPT_CHANGED],
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
