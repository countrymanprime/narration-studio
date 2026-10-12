// A chapter's two lines on the Script page, the mock's label and title ("CHAPTER VIII" over "The Queen's Croquet-Ground"), from the
// chapter's own title and subtitle through `chapterName` (ADR 0191), never a literal. A chapter with no second line has no label.

import { chapterName } from '../../../../chapterName';
import type { ManuscriptChapter } from '../../../../api/contracts/manuscript';

export type ChapterHeading = { label: string; title: string };

type Named = Pick<ManuscriptChapter, 'title' | 'subtitle' | 'contentKind'>;

/** The credits pages: the opening pages the manuscript imports before the first chapter. */
const isCredits = (chapter: Pick<ManuscriptChapter, 'contentKind'>): boolean => chapter.contentKind === 'opening';

/** The label over the title, and the title. The list draws no label for credits; the card labels them "Credits" (`cardLabel`). */
export function chapterHeading(chapter: Named): ChapterHeading {
  const full = chapterName(chapter);
  const short = chapterName(chapter, 'short');
  if (isCredits(chapter) || full === short) return { label: '', title: full };
  return { label: short, title: full.slice(short.length).replace(/^[\s:—–-]+/, '') };
}

/** What the card's top row says: "Credits" for the opening pages, otherwise the chapter's label. */
export const cardLabel = (chapter: Named): string => (isCredits(chapter) ? 'Credits' : chapterHeading(chapter).label);

/** What the boundary above a card calls the chapter before it: "End of chapter 7", or "End of front matter". */
export const endedName = (chapter: Named): string => (isCredits(chapter) ? chapterName(chapter).toLowerCase() : chapterName(chapter, 'short'));
