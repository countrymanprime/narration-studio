import type { ChapterStatus, RecordedThrough } from './api/contracts/manuscript';
import type { Measured } from './api/schemas/base';
import { reached } from './chapterStatus';
import { clamp } from './clamp';

const wordsOf = (text: string): string[] => text.match(/\S+/g) ?? [];

/**
 * A chapter's `recordedThrough` together with whether audio is measured on its track, taken from ONE read of the chapter. A page that re-reads how far a chapter is recorded
 * (after a take, when a session ends) replaces the pair together, so a new `through` is never printed with an old audio flag: every printer of the percent takes this pair
 * (`throughPercent`, `recordedThroughLabel`) and no caller can pair two reads.
 */
export type RecordedAt = { through: RecordedThrough; audio: boolean };

/**
 * Whether a recorded length counts as audio for the percent: one whole second or more. A length under a second is no audio on any page (the Companion's length reads 0:00, Production's Rec. figure None yet), so it reads 0% (any recorded second reads
 * at least 1%). The one rule for "there is audio": the percent, the Rec. figure, the Record cell and the recording-check pages all take it from here.
 */
export const hasAudio = (seconds: number | null | undefined): boolean => seconds !== null && seconds !== undefined && seconds >= 1;

/** A measured length as every page reads it: audio under a second is nothing recorded (0 s), whatever else is null or not. */
export const audibleSeconds = (seconds: number | null | undefined): number | null =>
  seconds === null || seconds === undefined ? null : hasAudio(seconds) ? seconds : 0;

export const NO_LENGTHS = 'No chapter has a measured length yet.';

/**
 * The finished length of the chapters that have been measured, by chapter id, from the shared chapter list (a chapter's `recordedSeconds`), or the reason there is none.
 * One rule for audio: a length under a second is no length (0 s), so the pace and every other reader agree with the board. `undefined` is a list not read yet.
 */
export function chapterLengthsOf(chapters: readonly { id: string; recordedSeconds?: number | null }[] | undefined): Measured<Record<string, number>> {
  if (!chapters) return { ok: false, reason: 'Reading the measured lengths…' };
  const lengths: Record<string, number> = {};
  for (const chapter of chapters) {
    const seconds = audibleSeconds(chapter.recordedSeconds);
    if (seconds !== null) lengths[chapter.id] = seconds;
  }
  return Object.keys(lengths).length ? { ok: true, value: lengths } : { ok: false, reason: NO_LENGTHS };
}

/** The pair of a chapter as one read gave it; undefined when nothing says any of the chapter is recorded. */
export const recordedAtOf = (chapter: { recordedThrough?: RecordedThrough; recordedSeconds?: number | null }): RecordedAt | undefined =>
  chapter.recordedThrough ? { through: chapter.recordedThrough, audio: hasAudio(chapter.recordedSeconds) } : undefined;

/**
 * The percent the host's `recordedThrough` is printed as, by every page (the Booth chip and lists, the Record cell and its tips, the Rec. name, Next up, the Companion):
 * 100 only when the host says complete, else 1 to 99, and 0 only when the host says 0 and no audio (one second or more) is measured on the track (a host 0 with audio reads 1: the host rounds the
 * share of words, so a chapter is at 0 until half a percent of its words are recorded, with audio already there).
 */
export function throughPercent({ through, audio }: RecordedAt): number {
  if (through.complete) return 100;
  return through.percent <= 0 ? (audio ? 1 : 0) : clamp(through.percent, 1, 99);
}

/** What a page says about how far a chapter is recorded (`recordedThrough`): `short` for a chapter list, `text` for the Booth's top bar. */
export type RecordedThroughLabel = { short: string; text: string; complete: boolean };

const QUOTE_WORDS = 4;

/**
 * "Recorded through “…the last words recorded” (45%)", "Recorded: complete", or for the track-length estimate the same with "about"
 * and where it came from. Null with nothing recorded. The quote is the last few words up to the recorded one, whole words only.
 */
export function recordedThroughLabel(at: RecordedAt | undefined, paragraphs: readonly { id: string; text: string }[]): RecordedThroughLabel | null {
  if (!at) return null;
  const recorded = at.through;
  const estimate = !recorded.confident;
  const from = estimate ? ' (from the track’s length)' : '';
  if (recorded.complete) {
    return { short: estimate ? 'Complete?' : 'Complete', text: estimate ? `Recorded: about complete${from}` : 'Recorded: complete', complete: true };
  }
  const percent = throughPercent(at);
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
  const measured =
    chapter.recordedSeconds === null || chapter.wordCount <= 0
      ? null
      : Math.min(1, (audibleSeconds(chapter.recordedSeconds) ?? 0) / ((chapter.wordCount / wph) * 3600));
  const through = chapter.recordedThrough;
  // A host 0 with a second or more on the track counts the audio measured (tiny, so the tile reads "<0h 01m" as the row does), never the 1% the row prints.
  if (through && (through.complete || through.percent > 0 || !hasAudio(chapter.recordedSeconds)))
    return throughPercent({ through, audio: hasAudio(chapter.recordedSeconds) }) / 100;
  if (through) return measured ?? 0.01;
  return measured;
}

/** Whether the delivery review has mastered a chapter with its checks passing: the one rule for "delivered", read by Production's stage bar and the Schedule's estimates. */
export const isDelivered = (review: { mastered: boolean; qc: string | null } | undefined): boolean => review?.mastered === true && review.qc === 'PASS';

/**
 * How much of a chapter counts as recorded for the book's figures, 0 to 1: all of it once the delivery review has mastered it with its checks passing (`delivered`, `isDelivered`) or its stage
 * is Editing or later, else the chapter's own `recordedShare`, never above the percent the Booth prints for it (`recordedPercent`). A delivered chapter counts whole in these aggregate figures, though a per-chapter
 * cell still prints the chapter's own stage and percent: delivery is the stronger evidence. The one rule behind Production's "Not recorded yet" and "Recorded audio", and the Schedule's Recording left and chart.
 */
export function chapterRecordedShare(
  chapter: { status: ChapterStatus; recordedThrough?: RecordedThrough; recordedSeconds: number | null; wordCount: number },
  wph: number,
  delivered = false,
): number {
  if (delivered || reached(chapter.status, 'editing')) return 1;
  const share = recordedShare(chapter, wph) ?? 0;
  // Never more than the percent the Booth prints (`recordedPercent`: only the host says complete, so a length that has reached the estimate is 99%, and a host 0 with audio is 1%).
  const printed = recordedPercent(chapter, wph);
  return printed === null ? share : Math.min(share, printed / 100);
}

/**
 * The percent a chapter shows as recorded, one rule for every page (the Record cell and Next up): the host's `recordedThrough` when it sent one (100 only when it says
 * complete; 1 to 99 otherwise, 0 only with no measured audio), else the measured length against the finished length, floored and kept to 1 to 99 (a chapter whose audio has reached its estimate is not "done":
 * only the host says so). Null when nothing is measured.
 */
export function recordedPercent(chapter: { recordedThrough?: RecordedThrough; recordedSeconds: number | null; wordCount: number }, wph: number): number | null {
  // 0 only when no audio is measured (under one second, or a host 0 with nothing on the track); any recorded second is at least 1, up to 99; only the host's "complete" is 100.
  const audio = hasAudio(chapter.recordedSeconds);
  if (chapter.recordedThrough) {
    return throughPercent({ through: chapter.recordedThrough, audio });
  }
  if (chapter.recordedSeconds === null || chapter.wordCount <= 0) return null;
  if (!audio) return 0;
  return clamp(Math.floor((chapter.recordedSeconds / ((chapter.wordCount / wph) * 3600)) * 100), 1, 99);
}

/** The note a chapter list draws after a chapter's name (`ChapterStepper`'s `detail`): "45%", "~30%", "Complete"; none with nothing recorded. */
export function chapterRecordedDetail(chapter: { recordedThrough?: RecordedThrough; recordedSeconds?: number | null }): string | undefined {
  return recordedAtDetail(recordedAtOf(chapter));
}

/** The note a chapter list draws for a pair already read (the Booth's chapter menu): the same text as `chapterRecordedDetail`. */
export const recordedAtDetail = (at: RecordedAt | undefined): string | undefined => recordedThroughLabel(at, [])?.short;
