import type { RecordedThrough } from '../../../api/contracts/manuscript';
import type { ReadingParagraph } from '../reading/boothUnits';
import type { ChapterPlace } from '../page/lastPlace';

/**
 * Why the Booth opened a chapter where it did: a target the narrator came with (a pickup line, a flagged line, a go-to link, Start
 * from here), the word after the last one recorded, the place the narrator last read to in the chapter, or its top.
 */
type ResumeReason = 'explicit' | 'recorded' | 'kept' | 'start';

export type ResumeStart = { place: ChapterPlace | null; reason: ResumeReason };

const wordsOf = (text: string): string[] => text.match(/\S+/g) ?? [];

/** The place, kept inside the paragraph when the text has shortened since; null when the paragraph is gone. */
function within(paragraphs: readonly ReadingParagraph[], place: ChapterPlace): ChapterPlace | null {
  const paragraph = paragraphs.find((item) => item.id === place.paragraphId);
  if (!paragraph) return null;
  return { paragraphId: paragraph.id, word: Math.max(0, Math.min(place.word, wordsOf(paragraph.text).length - 1)) };
}

/** The word after `place`: the next in its paragraph, or the next paragraph's first; the place itself at the chapter's last word. */
function after(paragraphs: readonly ReadingParagraph[], place: ChapterPlace): ChapterPlace {
  const index = paragraphs.findIndex((item) => item.id === place.paragraphId);
  const count = wordsOf(paragraphs[index]?.text ?? '').length;
  if (place.word + 1 < count) return { paragraphId: place.paragraphId, word: place.word + 1 };
  const next = paragraphs.slice(index + 1).find((item) => wordsOf(item.text).length > 0);
  return next ? { paragraphId: next.id, word: 0 } : place;
}

/**
 * Where the Booth opens a chapter (the owner's order, #2251): an explicit target always wins and is placed by its own code; then the
 * word after the last one the recording reaches (`recordedThrough`, the host's one value), so a half-recorded chapter reopens at the
 * half; then the place the narrator last read to in this chapter (kept per project and chapter); then the top. A complete chapter has
 * nothing left to record, so it opens where the narrator left it, else at the top. A recorded or kept paragraph the text no longer has
 * (the script was edited) is passed over rather than guessed at.
 */
export function resumeStart(args: {
  paragraphs: readonly ReadingParagraph[];
  explicit?: boolean;
  recorded?: RecordedThrough;
  kept?: ChapterPlace | null;
}): ResumeStart {
  const { paragraphs, explicit, recorded, kept } = args;
  if (explicit) return { place: null, reason: 'explicit' };
  if (recorded && !recorded.complete) {
    const last = within(paragraphs, recorded);
    if (last) return { place: after(paragraphs, last), reason: 'recorded' };
  }
  const left = kept ? within(paragraphs, kept) : null;
  if (left) return { place: left, reason: 'kept' };
  return { place: null, reason: 'start' };
}
