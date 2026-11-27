// The one answer to "which chapters does this page list": the opening and closing credits are chapters like any other (owner rule), so the
// host's chapter list (`manuscriptChapters`) holds them, opening first and closing last, marked `isCredits`. A page lists a chapter when it is
// narration; credits are narration, so they stay in. A page asks `isCreditsChapter` only for what genuinely differs: they have no paragraphs
// of their own, no speakers, and their text is a template.

import type { ManuscriptChapter } from './api/contracts/manuscript';

/** Whether a chapter is the opening or closing credits. */
export const isCreditsChapter = (chapter: { isCredits?: boolean }): boolean => chapter.isCredits === true;

/** The chapters to record, proof and produce: narration, the credits included. Reference sections and front matter are not. */
export const isNarrationChapter = (chapter: { contentKind?: ManuscriptChapter['contentKind'] | '' }): boolean =>
  !chapter.contentKind || chapter.contentKind === 'narration';

/**
 * The end of the open-chapter order, once for the Booth and the Companion: with nothing asked, no session running, nothing remembered and no chapter
 * from the DAW, the chapter the narrator last read (the reader state's `activeChapter`, an id or a title) if the list has it, else the first chapter of
 * the book's text, not the opening credits (the first chapter of the list when it has only credits).
 */
export const lastReadOrFirstTextChapter = <T extends { id: string; title?: string; isCredits?: boolean }>(
  chapters: readonly T[],
  lastRead: string | undefined,
): T | undefined =>
  (lastRead ? chapters.find((item) => item.id === lastRead || item.title === lastRead) : undefined) ??
  chapters.find((item) => !isCreditsChapter(item)) ??
  chapters[0];

/** The chapters the book numbers, and the ones a sample or a "first N chapters" is taken from: narration with the credits left out. */
export const isNumberedChapter = (chapter: { contentKind?: ManuscriptChapter['contentKind'] | ''; isCredits?: boolean }): boolean =>
  isNarrationChapter(chapter) && !isCreditsChapter(chapter);

/** The chapters with the credits taken out, for a surface that reads paragraphs (Find, the reader's text, the Story Bible's appearances). */
export const withoutCredits = <T extends Pick<ManuscriptChapter, 'isCredits'>>(chapters: readonly T[]): T[] =>
  chapters.filter((chapter) => !isCreditsChapter(chapter));
