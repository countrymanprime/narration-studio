import type { ManuscriptChapter, RecordedThrough } from './api/contracts/manuscript';

const wordsOf = (text: string): string[] => text.match(/\S+/g) ?? [];

/** What a page says about how far a chapter is recorded (`recordedThrough`): `short` for a chapter list, `text` for the Booth's top bar. */
export type RecordedThroughLabel = { short: string; text: string; complete: boolean };

const QUOTE_WORDS = 4;

/**
 * "Recorded through “…the last words recorded” (45%)", "Recorded: complete", or for the track-length estimate the same with "about"
 * and where it came from. Null with nothing recorded. The quote is the last few words up to the recorded one, whole words only.
 */
export function recordedThroughLabel(recorded: RecordedThrough | undefined, paragraphs: readonly { id: string; text: string }[]): RecordedThroughLabel | null {
  if (!recorded) return null;
  const estimate = !recorded.confident;
  const from = estimate ? ' (from the track’s length)' : '';
  if (recorded.complete) {
    return { short: estimate ? 'Complete?' : 'Complete', text: estimate ? `Recorded: about complete${from}` : 'Recorded: complete', complete: true };
  }
  const share = `${estimate ? '~' : ''}${recorded.percent}%`;
  const paragraph = paragraphs.find((item) => item.id === recorded.paragraphId);
  const words = wordsOf(paragraph?.text ?? '');
  if (!paragraph || words.length === 0)
    return { short: share, text: `Recorded through ${estimate ? 'about ' : ''}${recorded.percent}% of the chapter`, complete: false };
  const end = Math.min(recorded.word, words.length - 1);
  const begin = Math.max(0, end - QUOTE_WORDS + 1);
  const quote = `${begin > 0 ? '…' : ''}${words.slice(begin, end + 1).join(' ')}`;
  return {
    short: share,
    text: estimate ? `Recorded through about “${quote}” (${share}, from the track’s length)` : `Recorded through “${quote}” (${share})`,
    complete: false,
  };
}

/**
 * How much of a chapter is recorded, 0 to 1: the host's `recordedThrough` when it sent one (the value the Booth resumes at, so every page agrees),
 * else the measured length against the chapter's finished length at `wph` words an hour, else null.
 */
export function recordedShare(chapter: { recordedThrough?: RecordedThrough; recordedSeconds: number | null; wordCount: number }, wph: number): number | null {
  if (chapter.recordedThrough) return chapter.recordedThrough.complete ? 1 : chapter.recordedThrough.percent / 100;
  if (chapter.recordedSeconds === null || chapter.wordCount <= 0) return null;
  return Math.min(1, chapter.recordedSeconds / ((chapter.wordCount / wph) * 3600));
}

/**
 * The percent a chapter shows as recorded, one rule for every page (the Record cell and Next up): the host's `recordedThrough` when it sent one (100 only when it says
 * complete, else 1 to 99), else the measured length against the finished length, floored and kept to 1 to 99 (a chapter whose audio has reached its estimate is not "done":
 * only the host says so). Null when nothing is measured.
 */
export function recordedPercent(chapter: { recordedThrough?: RecordedThrough; recordedSeconds: number | null; wordCount: number }, wph: number): number | null {
  // Nothing recorded is 0 (the host's 0, or 0 s measured), never 1; any audio is at least 1, and only the host's "complete" is 100.
  const clamp = (percent: number): number => (percent <= 0 ? 0 : Math.min(99, Math.max(1, percent)));
  if (chapter.recordedThrough) return chapter.recordedThrough.complete ? 100 : clamp(chapter.recordedThrough.percent);
  if (chapter.recordedSeconds === null || chapter.wordCount <= 0) return null;
  if (chapter.recordedSeconds <= 0) return 0;
  return clamp(Math.floor((chapter.recordedSeconds / ((chapter.wordCount / wph) * 3600)) * 100));
}

/** The note a chapter list draws after a chapter's name (`ChapterStepper`'s `detail`): "45%", "~30%", "Complete"; none with nothing recorded. */
export function chapterRecordedDetail(chapter: Pick<ManuscriptChapter, 'recordedThrough'>): string | undefined {
  return recordedThroughLabel(chapter.recordedThrough, [])?.short;
}
