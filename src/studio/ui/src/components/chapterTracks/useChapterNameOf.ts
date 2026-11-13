import { useEffect, useState } from 'react';
import { headingName } from '../../chapterHeading';
import { usePort } from '../../ports/usePort';

/**
 * The manuscript's current heading for a chapter id ("Chapter 1: Down the Rabbit-Hole"), or undefined before the manuscript has been read or for a
 * chapter it no longer lists. Every picker names the chapter holding a track by this, so the label, the takeover sentence and the chapter's own
 * row spell one chapter one way (#3398); a caller falls back to the title the host kept with the link.
 */
export function useChapterNameOf(): (chapterId: string) => string | undefined {
  const manuscript = usePort('manuscript');
  const [names, setNames] = useState<ReadonlyMap<string, string>>(new Map());
  useEffect(() => {
    let live = true;
    manuscript
      .manuscriptChapters()
      .then((chapters) => live && setNames(new Map(chapters.map((chapter) => [chapter.id, headingName(chapter)]))))
      // The kept titles name the holders meanwhile.
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [manuscript]);
  return (chapterId) => names.get(chapterId);
}
