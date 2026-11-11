import { useCallback, useMemo } from 'react';
import type { TrackMapping } from '../../types';
import type { ChapterTrackCreateResult, ChapterTrackSetResult } from '../../api/contracts/chapterTrackMap';
import { usePort } from '../../ports/usePort';

/** The title the host kept with a displaced chapter's link, trimmed, or undefined when it is empty: the takeover sentence then says "a chapter no
 * longer in the manuscript", so none is silent or reads " was linked to that track" with no name (#3053). */
function keptTitle(storedTitle: string | undefined): string | undefined {
  return storedTitle?.trim() || undefined;
}

/**
 * The one sentence for a chapter that lost its track to another (`ChapterTrackSet` moves a track another chapter holds). `nameOf` gives the
 * manuscript's name for the chapter when the caller has the chapters; without it, or for a chapter the manuscript no longer lists, the title
 * the host kept with the link names it, so no takeover is silent (#3053, #3365).
 */
export function displacedSentence(displaced: TrackMapping, nameOf?: (chapterId: string) => string | undefined): string {
  const name = nameOf?.(displaced.chapterId) ?? keptTitle(displaced.chapterTitle) ?? 'A chapter no longer in the manuscript';
  return `${name} was linked to that track and is now not linked.`;
}

/** A link written: the host's answer, and the sentence for the chapter that lost the track, or '' when the track was free. */
type LinkWritten = { result: ChapterTrackSetResult; displacedNotice: string };

type ChapterLinkActions = {
  /** Links the chapter to the track, replacing its own link and taking the track from any chapter that held it (a Change never leaves a chapter on two tracks). Rejects with the host's error. */
  set: (chapterId: string, trackGuid: string, nameOf?: (chapterId: string) => string | undefined) => Promise<LinkWritten>;
  /** Removes the chapter's link; answers the links that remain. Rejects with the host's error. */
  unlink: (chapterId: string) => Promise<{ mappings: TrackMapping[] }>;
  /** Has the DAW add a track for the chapter and link it; a refusal is an answer, not a rejection. */
  create: (chapterId: string) => Promise<ChapterTrackCreateResult>;
};

/**
 * Every way a screen changes a chapter's link: set, unlink, create. One binding for each (ChapterTrackSet replaces; the upserting
 * ChapterTrackMapConfirm is not used by a screen), one wording for the chapter that lost its track, and one place that throws, so a caller shows
 * a failure its own way but never forgets who lost a track (#3365). It reads nothing: the caller refreshes the shared chapter-track state.
 */
export function useChapterLinkActions(): ChapterLinkActions {
  const trackMap = usePort('chapterTrackMap');
  const set = useCallback(
    async (chapterId: string, trackGuid: string, nameOf?: (chapterId: string) => string | undefined): Promise<LinkWritten> => {
      const result = await trackMap.chapterTrackSet(chapterId, trackGuid);
      return { result, displacedNotice: result.displaced ? displacedSentence(result.displaced, nameOf) : '' };
    },
    [trackMap],
  );
  const unlink = useCallback((chapterId: string) => trackMap.chapterTrackUnlink(chapterId), [trackMap]);
  const create = useCallback((chapterId: string) => trackMap.chapterTrackCreate(chapterId), [trackMap]);
  return useMemo(() => ({ set, unlink, create }), [set, unlink, create]);
}
