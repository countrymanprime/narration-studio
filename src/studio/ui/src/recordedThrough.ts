import type { RecordedThrough } from './api/contracts/manuscript';

const wordsOf = (text: string): string[] => text.match(/\S+/g) ?? [];

/**
 * The percent the host's `recordedThrough` is printed as, by every page (the Booth chip and lists, the Record cell and its tips, the Rec. name, Next up, the Companion):
 * 100 only when the host says complete, else 1 to 99, and 0 only when the host says 0 and no audio is measured on the track (a host 0 with audio reads 1: the host rounds the
 * share of words, so a chapter is at 0 until half a percent of its words are recorded, with audio already there). `audio` is the chapter's measured recorded seconds above zero.
 */
export function throughPercent(recorded: RecordedThrough, audio: boolean): number {
  if (recorded.complete) return 100;
  return recorded.percent <= 0 ? (audio ? 1 : 0) : Math.min(99, Math.max(1, recorded.percent));
}

/** What a page says about how far a chapter is recorded (`recordedThrough`): `short` for a chapter list, `text` for the Booth's top bar. */
export type RecordedThroughLabel = { short: string; text: string; complete: boolean };

const QUOTE_WORDS = 4;

/**
 * "Recorded through “…the last words recorded” (45%)", "Recorded: complete", or for the track-length estimate the same with "about"
 * and where it came from. Null with nothing recorded. The quote is the last few words up to the recorded one, whole words only.
 */
export function recordedThroughLabel(
  recorded: RecordedThrough | undefined,
  paragraphs: readonly { id: string; text: string }[],
  audio: boolean,
): RecordedThroughLabel | null {
  if (!recorded) return null;
  const estimate = !recorded.confident;
  const from = estimate ? ' (from the track’s length)' : '';
  if (recorded.complete) {
    return { short: estimate ? 'Complete?' : 'Complete', text: estimate ? `Recorded: about complete${from}` : 'Recorded: complete', complete: true };
  }
  const percent = throughPercent(recorded, audio);
  const share = `${estimate ? '~' : ''}${percent}%`;
  const paragraph = paragraphs.find((item) => item.id === recorded.paragraphId);
  const words = wordsOf(paragraph?.text ?? '');
  if (!paragraph || words.length === 0)
    return { short: share, text: `Recorded through ${estimate ? 'about ' : ''}${percent}% of the chapter`, complete: false };
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
 * complete; 1 to 99 otherwise, 0 only with no measured audio), else the measured length against the finished length, floored and kept to 1 to 99 (a chapter whose audio has reached its estimate is not "done":
 * only the host says so). Null when nothing is measured.
 */
export function recordedPercent(chapter: { recordedThrough?: RecordedThrough; recordedSeconds: number | null; wordCount: number }, wph: number): number | null {
  // 0 only when no audio is measured (0 s, or a host 0 with nothing on the track); any measured audio is at least 1, up to 99; only the host's "complete" is 100.
  const audio = chapter.recordedSeconds !== null && chapter.recordedSeconds > 0;
  const atLeastOne = (percent: number): number => Math.min(99, Math.max(1, percent));
  if (chapter.recordedThrough) {
    return throughPercent(chapter.recordedThrough, audio);
  }
  if (chapter.recordedSeconds === null || chapter.wordCount <= 0) return null;
  if (!audio) return 0;
  return atLeastOne(Math.floor((chapter.recordedSeconds / ((chapter.wordCount / wph) * 3600)) * 100));
}

/** The note a chapter list draws after a chapter's name (`ChapterStepper`'s `detail`): "45%", "~30%", "Complete"; none with nothing recorded. */
export function chapterRecordedDetail(chapter: { recordedThrough?: RecordedThrough; recordedSeconds?: number | null }): string | undefined {
  return recordedThroughLabel(chapter.recordedThrough, [], (chapter.recordedSeconds ?? 0) > 0)?.short;
}
