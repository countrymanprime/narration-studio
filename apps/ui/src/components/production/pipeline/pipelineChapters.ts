import type { ProductionChapter } from '../../../api/contracts/production';
import type { CreditsEntry } from '../../credits/creditsEntries';

/** A credits entry as a row of the board: it has the chapter's fields so the pipeline draws it the one way, and no logged time or readiness. */
function creditsChapter(entry: CreditsEntry): ProductionChapter {
  return {
    id: entry.id,
    title: entry.name,
    contentKind: '',
    status: entry.status,
    wordCount: entry.words,
    recordedSeconds: entry.recordedSeconds ?? null,
    ...(entry.recordedUnavailable ? { recordedUnavailable: entry.recordedUnavailable } : {}),
    hoursLogged: 0,
    pfh: null,
    readiness: null,
  };
}

/**
 * The pipeline's rows in the mock's order: the opening credits, the narration chapters, then the closing credits. Only narration chapters are
 * rows: a chapter an earlier import kept for the book's opening pages (kind `opening`) is never listed.
 */
export function pipelineChapters(chapters: readonly ProductionChapter[], credits: { opening?: CreditsEntry; closing?: CreditsEntry }): ProductionChapter[] {
  const isNarration = (chapter: ProductionChapter) => !chapter.contentKind || chapter.contentKind === 'narration';
  return [
    ...(credits.opening ? [creditsChapter(credits.opening)] : []),
    ...chapters.filter(isNarration),
    ...(credits.closing ? [creditsChapter(credits.closing)] : []),
  ];
}
