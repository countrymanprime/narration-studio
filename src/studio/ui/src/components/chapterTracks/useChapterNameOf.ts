import { useMemo } from 'react';
import { headingName } from '../../chapterHeading';
import { useChapters } from '../../studio/useChapters';
import type { ManuscriptChapter } from '../../types';

/** Names a chapter by the manuscript's current heading out of a chapter list: the one lookup every caller shares (the pickers, the takeover sentence). */
export function chapterNameLookup(chapters: readonly ManuscriptChapter[]): (chapterId: string) => string | undefined {
  return (chapterId) => {
    const known = chapters.find((chapter) => chapter.id === chapterId);
    return known ? headingName(known) : undefined;
  };
}

/**
 * The manuscript's current heading for a chapter id ("Chapter 1: Down the Rabbit-Hole"), or undefined before the manuscript has been read or for a
 * chapter it no longer lists. Every picker names the chapter holding a track by this, so the label, the takeover sentence and the chapter's own
 * row spell one chapter one way (#3398); a caller falls back to the title the host kept with the link.
 */
export function useChapterNameOf(active = true, refreshKey = 0): (chapterId: string) => string | undefined {
  // The store's chapter list, read again when the manuscript changes, so a chapter renamed since is named as it is now; the kept titles name the holders meanwhile.
  const { chapters } = useChapters(active, refreshKey);
  return useMemo(() => (chapters ? chapterNameLookup(chapters) : () => undefined), [chapters]);
}
