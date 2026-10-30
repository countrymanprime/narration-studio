// The one answer to "which chapters does this page list": the opening and closing credits are chapters like any other (owner rule), so the
// host's chapter list (`manuscriptChapters`) holds them, opening first and closing last, marked `isCredits`. A page lists a chapter when it is
// narration; credits are narration, so they stay in. A page asks `isCreditsChapter` only for what genuinely differs: they have no paragraphs
// of their own, no speakers, and their text is a template.

import type { ManuscriptChapter } from './api/contracts/manuscript';

/** Whether a chapter is the opening or closing credits. */
export const isCreditsChapter = (chapter: Pick<ManuscriptChapter, 'isCredits'>): boolean => chapter.isCredits === true;

/** The chapters to record, proof and produce: narration, the credits included. Reference sections and front matter are not. */
export const isNarrationChapter = (chapter: { contentKind?: ManuscriptChapter['contentKind'] | '' }): boolean =>
  !chapter.contentKind || chapter.contentKind === 'narration';

/** The chapters with the credits taken out, for a surface that reads paragraphs (Find, the reader's text, the Story Bible's appearances). */
export const withoutCredits = <T extends Pick<ManuscriptChapter, 'isCredits'>>(chapters: readonly T[]): T[] =>
  chapters.filter((chapter) => !isCreditsChapter(chapter));
