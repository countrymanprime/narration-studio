import type { RecordedThrough } from '../../../api/contracts/manuscript';
import type { ManuscriptParagraph, TeleprompterSpan } from '../../../types';
import { estimatedSpans, headingParagraphs, scriptWordAt } from '../page/readingSource';
import { resumeStart } from '../resume/resumeStart';

/** Where the Companion offers to begin: the script word `Start` takes, a short quote starting at it, and how far the chapter is recorded. */
export type RecordedStart = { word: number; label: string; percent: number; estimate: boolean };

const CHIP_WORDS = 6;
const wordsOf = (text: string): string[] => text.match(/\S+/g) ?? [];

/**
 * The Companion's first offer (#2601): the same place the Booth opens the chapter at, `resumeStart` over the host's `recordedThrough`, as the
 * script word the session starts at. Null when nothing is recorded, the chapter is recorded to the end, the paragraph is gone from the text,
 * or the script does not follow it; the prompt then asks the recording itself (`teleprompterLocate`) as before.
 */
export function recordedStart(args: {
  chapter: { title: string; subtitle?: string };
  paragraphs: readonly Pick<ManuscriptParagraph, 'id' | 'text'>[] | undefined;
  spans: readonly TeleprompterSpan[] | undefined;
  recorded: RecordedThrough | undefined;
}): RecordedStart | null {
  const { chapter, paragraphs, spans, recorded } = args;
  if (!paragraphs || !recorded) return null;
  const start = resumeStart({ paragraphs, recorded });
  if (start.reason !== 'recorded' || !start.place) return null;
  const reading = [...headingParagraphs(chapter), ...paragraphs];
  const word = scriptWordAt(spans ?? estimatedSpans(reading), reading, start.place);
  if (word === null) return null;
  const text = paragraphs.find((paragraph) => paragraph.id === start.place?.paragraphId)?.text ?? '';
  const tail = wordsOf(text).slice(start.place.word);
  const label = `…${tail.slice(0, CHIP_WORDS).join(' ')}${tail.length > CHIP_WORDS ? '…' : ''}`;
  return { word, label, percent: recorded.percent, estimate: !recorded.confident };
}
