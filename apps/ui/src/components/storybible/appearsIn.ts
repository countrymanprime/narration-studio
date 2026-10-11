import type { GuideEntity } from '../../types';

/** The part of a manuscript chapter the list needs: its id and the parts of its name. */
export type ChapterRef = { id: string; title: string; subtitle?: string };

/**
 * The chapters an entry appears in, one per chapter however many scenes it touches, in the manuscript's reading order.
 * An appearance whose chapter is not in the manuscript is dropped. `undefined` when the entry has no `appearances`
 * (a file written before they existed): nothing is guessed from its evidence lines.
 */
export function chaptersOf(entity: Pick<GuideEntity, 'appearances'>, manuscript: readonly ChapterRef[]): ChapterRef[] | undefined {
  if (!entity.appearances) return undefined;
  const present = new Set(entity.appearances.map((appearance) => appearance.chapterId));
  return manuscript.filter((chapter) => present.has(chapter.id));
}
