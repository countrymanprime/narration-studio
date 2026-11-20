import { useEffect, useState, useSyncExternalStore } from 'react';
import type { ManuscriptParagraph } from '../types';
import { usePort } from '../ports/usePort';
import { useOptionalStoreHandle } from './StudioProvider';

const noSubscribe = () => () => undefined;

/**
 * The text of one chapter, from the store's keyed `chapterText` cache (#3658): read once however many pages ask, shown at once when held (a stale copy
 * is shown while it is read again), kept under the cache's budget and dropped by a project switch. `undefined` until the first read answers; a failed read
 * keeps a held copy and sets `error`. A page that asks for no chapter (`chapterId` undefined) reads nothing.
 *
 * Without a <StudioProvider> (a component rendered alone in a test) it reads the port itself, once per chapter, as every reader did before the cache.
 */
export function useChapterText(chapterId: string | undefined): {
  paragraphs: readonly ManuscriptParagraph[] | undefined;
  error: Error | undefined;
  loading: boolean;
} {
  const store = useOptionalStoreHandle();
  const manuscript = usePort('manuscript');
  const cache = store?.keyed('chapterText');
  // Read to redraw on any change of the cache, and to ask again when what this reader shows has gone (a project switch), gone stale (a job ended) or was never answered.
  const version = useSyncExternalStore(
    cache ? cache.subscribe : noSubscribe,
    () => cache?.version() ?? 0,
    () => 0,
  );
  const [own, setOwn] = useState<{ id: string; paragraphs: readonly ManuscriptParagraph[] }>();
  // A chapter a reader shows is not dropped for the budget while it is shown.
  useEffect(() => {
    if (!cache || chapterId === undefined) return;
    return cache.pin(chapterId);
  }, [cache, chapterId]);
  useEffect(() => {
    if (chapterId === undefined) return;
    if (cache) {
      const failed = cache.error(chapterId) !== undefined;
      if (!failed && (cache.get(chapterId) === undefined || cache.isStale(chapterId))) void cache.ensure(chapterId).catch(() => undefined);
      return;
    }
    let live = true;
    manuscript
      .manuscriptParagraphs(chapterId)
      .then((paragraphs) => live && setOwn({ id: chapterId, paragraphs }))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [cache, manuscript, chapterId, version]);
  if (chapterId === undefined) return { paragraphs: undefined, error: undefined, loading: false };
  const paragraphs = cache ? (cache.get(chapterId) as readonly ManuscriptParagraph[] | undefined) : own?.id === chapterId ? own.paragraphs : undefined;
  const error = cache?.error(chapterId);
  return { paragraphs, error, loading: paragraphs === undefined && error === undefined };
}
