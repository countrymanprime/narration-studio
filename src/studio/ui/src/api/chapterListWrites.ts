import type { NarrationApi } from '../types';

/**
 * The calls that change what the chapter list holds beyond the chapter's own fields: its recorded length, its link state and what it is recorded
 * through come from the chapter's track link and the saved project, so a link written, a project's data cleared, a layout chosen, a DAW chosen or
 * linked, or a chapter sync changes them (#3658). Each, once it settles, says so with `announceChapterListWritten`, and the `chapters` slot reads again.
 * A call that changes a chapter's status or kind already says so (`MANUSCRIPT_CHANGED`, published by the page that made the change). The list is pinned by
 * a test, so a new writer is a deliberate edit.
 */
export const CHAPTER_LIST_WRITERS: ReadonlySet<string> = new Set([
  'chapterTrackSet',
  'chapterTrackUnlink',
  'chapterTrackCreate',
  'chapterSyncSetEnabled',
  'chapterSyncUndo',
  'chapterFoldersRepair',
  'clearProjectData',
  'voiceTracksSetLayout',
  'voiceTracksSetNarrator',
  'voiceTracksSetCharacters',
  'tracksSelect',
  'dawChoose',
  'dawLinkFound',
  'linkDawFile',
]);

const listeners = new Set<() => void>();

/** Hears every settled call of `CHAPTER_LIST_WRITERS`; returns the unsubscribe. */
export function onChapterListWritten(listener: () => void): () => void {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

export function announceChapterListWritten(): void {
  for (const listener of [...listeners]) listener();
}

function isThenable(value: unknown): value is PromiseLike<unknown> {
  return typeof value === 'object' && value !== null && 'then' in value && typeof value.then === 'function';
}

/** The api with each call of `CHAPTER_LIST_WRITERS` announcing itself when it settles, answered or refused (a refusal may have written part of it). */
export function withChapterListWrites(api: NarrationApi): NarrationApi {
  const wrappers = new Map<string, unknown>();
  return new Proxy(api, {
    get(target, property, receiver) {
      const value: unknown = Reflect.get(target, property, receiver);
      if (typeof property !== 'string' || typeof value !== 'function' || !CHAPTER_LIST_WRITERS.has(property)) return value;
      const known = wrappers.get(property);
      if (known) return known;
      const wrapper = (...args: unknown[]) => {
        let outcome: unknown;
        try {
          outcome = Reflect.apply(value, target, args);
        } catch (failure) {
          announceChapterListWritten();
          throw failure;
        }
        if (isThenable(outcome)) outcome.then(announceChapterListWritten, announceChapterListWritten);
        else announceChapterListWritten();
        return outcome;
      };
      wrappers.set(property, wrapper);
      return wrapper;
    },
  });
}
