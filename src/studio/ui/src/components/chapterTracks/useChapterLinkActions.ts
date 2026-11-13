import { useCallback, useMemo } from 'react';
import type { ManuscriptChapter, TrackMapping } from '../../types';
import type { ChapterTrackCreateResult, ChapterTrackSetResult } from '../../api/contracts/chapterTrackMap';
import { usePort } from '../../ports/usePort';
import { chapterNameLookup } from './useChapterNameOf';
import { describeApiError } from '../../api/errorMessage';

/** The title the host kept with a displaced chapter's link, trimmed, or undefined when it is empty: the takeover sentence then says "a chapter no
 * longer in the manuscript", so none is silent or reads " was linked to that track" with no name (#3053). */
export function keptTitle(storedTitle: unknown): string | undefined {
  if (typeof storedTitle !== 'string') return undefined;
  // A title is text someone else wrote: control and bidi-override characters would reach a toast as they are, and a very long one would fill it.
  const clean = Array.from(storedTitle, (ch) => (isOddCharacter(ch.codePointAt(0) ?? 0) ? ' ' : ch))
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
  if (!clean) return undefined;
  return clean.length > MAX_TITLE ? `${clean.slice(0, MAX_TITLE - 1)}…` : clean;
}
/** A chapter's name as the Link a track dialog and the sentences around it say it: cleaned and clipped like a kept title, and "This chapter" when blank. */
export function dialogChapterName(name: string): string {
  return keptTitle(name) ?? 'This chapter';
}
/** A control character or a bidi override/isolate mark. */
function isOddCharacter(code: number): boolean {
  return (
    code < 0x20 ||
    (code >= 0x7f && code <= 0x9f) ||
    code === 0x200e ||
    code === 0x200f ||
    (code >= 0x202a && code <= 0x202e) ||
    (code >= 0x2066 && code <= 0x2069)
  );
}
/** The longest chapter title a sentence quotes. */
const MAX_TITLE = 80;

/**
 * The one sentence for a chapter that lost its track to another (`ChapterTrackSet` moves a track another chapter holds). `nameOf` gives the
 * manuscript's name for the chapter when the caller has the chapters; without it, or for a chapter the manuscript no longer lists, the title
 * the host kept with the link names it, so no takeover is silent (#3053, #3365).
 */
export function displacedSentence(displaced: TrackMapping, nameOf?: (chapterId: string) => string | undefined): string {
  const name = keptTitle(nameOf?.(displaced.chapterId)) ?? keptTitle(displaced.chapterTitle) ?? 'A chapter no longer in the manuscript';
  return `${name} was linked to that track and is now not linked.`;
}

/**
 * What to say when a change to the links (a link, an unlink) was written and reading the list again failed: the change was made, so the narrator is
 * not told it failed. The Chapter links list and the Link chapters dialog run the write and the re-read in one chain, so this is where the two
 * are told apart (#3398).
 */
export const changedButUnread = (reason: unknown): string => `The change was made, but the list could not be read again: ${describeApiError(reason)}`;

/** A link written: the host's answer, and the sentence for the chapter that lost the track, or '' when the track was free. */
async function manuscriptNames(manuscript: {
  manuscriptChapters: () => Promise<ManuscriptChapter[]>;
}): Promise<((chapterId: string) => string | undefined) | undefined> {
  try {
    return chapterNameLookup(await manuscript.manuscriptChapters());
  } catch {
    return undefined;
  }
}

type LinkWritten = {
  result: ChapterTrackSetResult;
  /** The sentence for the chapter that lost the track, or '' when it was free. */
  displacedNotice: string;
  /** What a toast says after the link: "Track linked.", with the displaced sentence after it when a chapter lost the track. */
  linkedNotice: string;
};

type ChapterLinkActions = {
  /** Links the chapter to the track, replacing its own link and taking the track from any chapter that held it (a Change never leaves a chapter on two tracks). Rejects with the host's error. */
  set: (chapterId: string, trackGuid: string, nameOf?: (chapterId: string) => string | undefined) => Promise<LinkWritten>;
  /** Removes the chapter's link; answers the links that remain. Rejects with the host's error. */
  unlink: (chapterId: string) => Promise<{ mappings: TrackMapping[] }>;
  /** Has the DAW add a track for the chapter and link it; a refusal is an answer, not a rejection. */
  create: (chapterId: string) => Promise<ChapterTrackCreateResult>;
};

/**
 * Every way a screen changes a chapter's link: set, unlink, create. One binding for each (ChapterTrackSet replaces; there is no upserting
 * confirm binding any more), one wording for the chapter that lost its track, and one place that throws, so a caller shows
 * a failure its own way but never forgets who lost a track (#3365). It reads nothing: the caller refreshes the shared chapter-track state.
 */
export function useChapterLinkActions(): ChapterLinkActions {
  const trackMap = usePort('chapterTrackMap');
  const manuscript = usePort('manuscript');
  const set = useCallback(
    async (chapterId: string, trackGuid: string, nameOf?: (chapterId: string) => string | undefined): Promise<LinkWritten> => {
      const result = await trackMap.chapterTrackSet(chapterId, trackGuid);
      // The chapter that lost the track is named as the manuscript names it now (a renamed chapter reads the same on every screen); a caller that
      // has the chapters passes its own, and a manuscript that cannot be read leaves the title the host kept.
      const names = nameOf ?? (result.displaced ? await manuscriptNames(manuscript) : undefined);
      // A host that answers the chapter just linked as the one displaced has displaced no one.
      const displacedNotice = result.displaced && result.displaced.chapterId !== chapterId ? displacedSentence(result.displaced, names) : '';
      return { result, displacedNotice, linkedNotice: displacedNotice ? `Track linked. ${displacedNotice}` : 'Track linked.' };
    },
    [trackMap, manuscript],
  );
  const unlink = useCallback((chapterId: string) => trackMap.chapterTrackUnlink(chapterId), [trackMap]);
  const create = useCallback((chapterId: string) => trackMap.chapterTrackCreate(chapterId), [trackMap]);
  return useMemo(() => ({ set, unlink, create }), [set, unlink, create]);
}
