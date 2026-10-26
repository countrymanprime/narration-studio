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

/** The note a chapter list draws after a chapter's name (`ChapterStepper`'s `detail`): "45%", "~30%", "Complete"; none with nothing recorded. */
export function chapterRecordedDetail(chapter: Pick<ManuscriptChapter, 'recordedThrough'>): string | undefined {
  return recordedThroughLabel(chapter.recordedThrough, [])?.short;
}
