import { useEffect, useState } from 'react';
import { headingName } from '../../chapterHeading';
import { usePort } from '../../ports/usePort';
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
  const manuscript = usePort('manuscript');
  const [lookup, setLookup] = useState<(chapterId: string) => string | undefined>(() => () => undefined);
  // Read when the caller becomes active (a panel opening, a dialog mounting), so a chapter renamed since is named as it is now.
  useEffect(() => {
    if (!active) return;
    let live = true;
    manuscript
      .manuscriptChapters()
      .then((chapters) => live && setLookup(() => chapterNameLookup(chapters)))
      // The kept titles name the holders meanwhile.
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [manuscript, active, refreshKey]);
  return lookup;
}
