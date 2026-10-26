// A chapter's two lines on the Script page, the mock's label and title ("CHAPTER VIII" over "The Queen's Croquet-Ground"), from the
// chapter's own title and subtitle through `chapterName`, never a literal. A chapter with no second line has no label.

import { chapterName } from './chapterName';
import type { ManuscriptChapter, ManuscriptContentKind } from './api/contracts/manuscript';

export type ChapterHeading = { label: string; title: string };

// `''` is the Production page's "kind not read yet" (`ProductionChapter.contentKind`): it is not credits, like an absent kind.
type Named = Pick<ManuscriptChapter, 'title' | 'subtitle'> & { contentKind?: ManuscriptContentKind | '' };

/** The credits pages: the opening pages the manuscript imports before the first chapter. */
const isCredits = (chapter: { contentKind?: ManuscriptContentKind | '' }): boolean => chapter.contentKind === 'opening';

/** The label over the title, and the title. The list draws no label for credits; the card labels them "Credits" (`cardLabel`). */
export function chapterHeading(chapter: Named): ChapterHeading {
  const full = chapterName(chapter);
  const short = chapterName(chapter, 'short');
  if (isCredits(chapter) || full === short) return { label: '', title: full };
  return { label: short, title: full.slice(short.length).replace(/^[\s:—–-]+/, '') };
}

/** A heading whose label is the manuscript's own numbering style ("CHAPTER VIII.", "8.", "Chapter 8:"), which keeps its own separator. */
export const HEADING_LABEL_END = /[.:]$/;

/**
 * The one way a chapter's name is shown to read everywhere but the Booth's main reading area (#2251 item 24): the name in the style the
 * manuscript settled, the standard the manuscript import dialog sets (`production/importReviewModel.headingParts`). A label heading keeps the
 * manuscript's own separator ("CHAPTER VIII. Croquet", "8. Croquet", "Chapter 8: Croquet"); a plain heading with a subtitle reads "Chapter 3: Title"
 * (colon, owner decision on #2251); a heading with no subtitle is the title alone.
 * This is the single display formatter the Editing, Booth and Pickups chapter lists used to each write by hand; every other chapter-name
 * display reads it too, so the dash never shows on a numbered heading on one page and not on another.
 */
export function headingName(chapter: Named): string {
  const { label, title } = chapterHeading(chapter);
  if (!label) return title;
  return HEADING_LABEL_END.test(label) ? `${label} ${title}` : `${label}: ${title}`;
}

/** What the card's top row says: "Credits" for the opening pages, otherwise the chapter's label. */
export const cardLabel = (chapter: Named): string => (isCredits(chapter) ? 'Credits' : chapterHeading(chapter).label);

/** What the boundary above a card calls the chapter before it: "End of chapter 7", or "End of opening credits". */
export const endedName = (chapter: Named): string => (isCredits(chapter) ? chapterName(chapter).toLowerCase() : chapterName(chapter, 'short'));
