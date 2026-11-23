import type { ChapterStatus, ManuscriptChapter, ManuscriptContentKind, RecordedThrough, RecordedUnavailable } from '../../api/contracts/manuscript';
import type { ProductionChapterNumbers, ProductionOverview, ProductionReadiness } from '../../api/contracts/production';

/** One row of the board: a chapter of the shared list with the host's numbers for it. `recordedSeconds` is the measured length of its confirmed track, `null` with `recordedUnavailable` saying why. */
export type ProductionChapter = {
  id: string;
  title: string;
  subtitle?: string;
  contentKind: ManuscriptContentKind | '';
  status: ChapterStatus;
  wordCount: number;
  recordedSeconds: number | null;
  recordedUnavailable?: RecordedUnavailable;
  /** How far the chapter is recorded: the chapter list's `recordedThrough`, so the board and the Booth agree. */
  recordedThrough?: RecordedThrough;
  hoursLogged: number;
  /** Hours logged on the chapter per finished hour of it; `null` with no measured audio or no logged time. */
  pfh: number | null;
  /** `null` for a chapter the stage recommendations did not assess. */
  readiness: ProductionReadiness | null;
};

/** The overview the page draws: the host's overview with its chapters composed from the shared list. */
export type ProductionBoard = Omit<ProductionOverview, 'chapters'> & { chapters: ProductionChapter[] };

/**
 * The Production page's overview with its chapters taken from the one chapter list every page shares (the store's slot, #3658, #4058). The list says which
 * chapters there are and how they are named, ordered, kinded, statused and recorded; the host's overview adds only the numbers it computes per chapter (hours
 * logged, PFH, readiness). A chapter the list has and the overview has not is a row with no numbers (0 hours, no PFH, no readiness); a chapter the overview has
 * and the list has not is not drawn (the list is the book).
 */
export function composeOverview(overview: ProductionOverview, shared: readonly ManuscriptChapter[]): ProductionBoard {
  const numbers = new Map<string, ProductionChapterNumbers>(overview.chapters.map((chapter) => [chapter.id, chapter]));
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
  return { ...overview, chapters };
}
