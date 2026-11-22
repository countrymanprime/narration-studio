import type { ManuscriptChapter } from '../../api/contracts/manuscript';
import type { ProductionChapter, ProductionNextUpItem, ProductionOverview } from '../../api/contracts/production';

/**
 * The Production page's overview with its chapters taken from the one chapter list every page shares (the store's slot, #3658, #4058). The list says which
 * chapters there are and how they are named, ordered, kinded, statused and recorded; the host's overview adds only the numbers it computes per chapter (hours
 * logged, PFH, readiness). A chapter the list has and the overview has not is a row with no numbers (0 hours, no PFH, no readiness); a chapter the overview has
 * and the list has not is not drawn (the list is the book). "Next up" is named from the list, falling back to the overview's own title for a chapter the list lacks.
 */
export function composeOverview(overview: ProductionOverview, shared: readonly ManuscriptChapter[]): ProductionOverview {
  const numbers = new Map(overview.chapters.map((chapter) => [chapter.id, chapter]));
  const chapters: ProductionChapter[] = shared.map((chapter) => {
    const own = numbers.get(chapter.id);
    return {
      id: chapter.id,
      title: chapter.title,
      ...(chapter.subtitle !== undefined ? { subtitle: chapter.subtitle } : {}),
      contentKind: chapter.contentKind ?? '',
      status: chapter.status,
      wordCount: chapter.wordCount,
      recordedSeconds: chapter.recordedSeconds ?? null,
      ...(chapter.recordedUnavailable ? { recordedUnavailable: chapter.recordedUnavailable } : {}),
      ...(chapter.recordedThrough ? { recordedThrough: chapter.recordedThrough } : {}),
      hoursLogged: own?.hoursLogged ?? 0,
      pfh: own?.pfh ?? null,
      readiness: own?.readiness ?? null,
    };
  });
  const named = new Map(shared.map((chapter) => [chapter.id, chapter]));
  const nextUp: ProductionNextUpItem[] = overview.nextUp.map((item) => {
    const chapter = named.get(item.chapterId);
    return chapter ? { ...item, title: chapter.title, ...(chapter.subtitle !== undefined ? { subtitle: chapter.subtitle } : {}) } : item;
  });
  return { ...overview, chapters, nextUp };
}
