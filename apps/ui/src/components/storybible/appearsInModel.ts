import type { GuideEntity } from '../../types';

/** The part of a manuscript chapter the list needs: its id and the parts of its name. */
export type ChapterRef = { id: string; title: string; subtitle?: string };

/**
 * The chapters an entry appears in, one per chapter however many scenes it touches, in the manuscript's reading order.
 * An appearance whose chapter is not in the manuscript is dropped. A file written before `appearances` existed is read from the
 * chapters its evidence lines name (by id, or by title where a line has no id), the same reading the entry list counts from, so the
 * list row and this section never give two numbers. `undefined` when the entry has neither, or its evidence names no chapter of the manuscript.
 */
export function chaptersOf(
  entity: Pick<GuideEntity, 'appearances'> & Partial<Pick<GuideEntity, 'occurrences'>>,
  manuscript: readonly ChapterRef[],
): ChapterRef[] | undefined {
  if (entity.appearances) {
    const present = new Set(entity.appearances.map((appearance) => appearance.chapterId));
    return manuscript.filter((chapter) => present.has(chapter.id));
  }
  if (!entity.occurrences?.length) return undefined;
  const named = manuscript.filter((chapter) =>
    entity.occurrences!.some((line) => (line.chapterId ? line.chapterId === chapter.id : line.chapter === chapter.title)),
  );
  // Evidence that names no chapter of this manuscript says nothing about where the entry appears.
  return named.length ? named : undefined;
}
