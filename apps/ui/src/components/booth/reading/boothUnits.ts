// The phrases of a chapter and the words of each phrase, for the Booth's text (the Studio Next mock's selectors/booth.ts).
// Pure: who speaks each quoted phrase arrives as input (the Script reader's attribution, `speakerLabels`), it is not recomputed here.

/** The speaker of a quoted phrase that nothing attributes: the mock's dashed "?" chip. */
export const UNKNOWN_SPEAKER = '?';

/** One stretch of a paragraph: narration, or a quotation with its speaker. */
type ReadingPhrase = {
  /** Identifies the phrase to `onSetSpeaker`. */
  key: string;
  /** Character offsets in the paragraph text, [start, end). */
  start: number;
  end: number;
  /** A quotation: someone speaks, so it has a chip. */
  quoted: boolean;
  speaker: string;
  /** The narrator confirmed the speaker (narration counts as confirmed); otherwise it is a suggestion. */
  confirmed: boolean;
};

export type ReadingParagraph = {
  id: string;
  text: string;
  /** Left out: the paragraph is one narration phrase. */
  phrases?: readonly ReadingPhrase[];
};

/** One sentence of a phrase: the unit the Booth lights and steps through. */
export type BoothUnit = {
  key: string;
  paragraphId: string;
  /** Index of the paragraph in the chapter. */
  paragraphIndex: number;
  start: number;
  end: number;
  speaker: string;
  quoted: boolean;
  confirmed: boolean;
  text: string;
  words: number;
  /** A later sentence of the same quotation: it has no chip of its own. */
  cont: boolean;
};

const PLACEHOLDER_TEXT = 'Chapter text appears here.';

/** The chapter's paragraphs, or one placeholder paragraph when it has no text yet. */
export function readingParagraphs(paragraphs: readonly ReadingParagraph[]): readonly ReadingParagraph[] {
  return paragraphs.length ? paragraphs : [{ id: 'placeholder', text: PLACEHOLDER_TEXT }];
}

export const wordCount = (text: string): number => (text.match(/\S+/g) ?? []).length;

const ABBREVIATION = /(?:^|\s)(?:Mr|Mrs|Ms|Dr|St|Jr|Sr|vs|etc|Prof|Capt)\.$/;
const SENTENCE_END = /[.!?…]["”’)]*\s+(?=["“‘(]?[A-Z0-9])/g;

/** The sentences of text[start, end) as [start, end) ranges that cover it exactly; the space after a sentence stays with it. */
export function sentenceRanges(text: string, start: number, end: number): Array<[number, number]> {
  const segment = text.slice(start, end);
  const ranges: Array<[number, number]> = [];
  let from = 0;
  for (const match of segment.matchAll(SENTENCE_END)) {
    if (ABBREVIATION.test(segment.slice(from, match.index + 1))) continue;
    const to = match.index + match[0].length;
    ranges.push([start + from, start + to]);
    from = to;
  }
  if (from < segment.length || !ranges.length) ranges.push([start + from, end]);
  return ranges;
}

/** A narration paragraph with no quotation marks is not one jump: every phrase is cut into sentences. */
export function boothUnits(paragraphs: readonly ReadingParagraph[]): BoothUnit[] {
  return paragraphs.flatMap((paragraph, paragraphIndex) => {
    const phrases = paragraph.phrases ?? [{ key: `${paragraph.id}:0`, start: 0, end: paragraph.text.length, quoted: false, speaker: '', confirmed: true }];
    return phrases.flatMap((phrase) =>
      sentenceRanges(paragraph.text, phrase.start, phrase.end).map(([start, end], k) => {
        const text = paragraph.text.slice(start, end);
        return {
          key: k === 0 ? phrase.key : `${phrase.key}#${start}`,
          paragraphId: paragraph.id,
          paragraphIndex,
          start,
          end,
          speaker: phrase.speaker,
          quoted: phrase.quoted,
          confirmed: phrase.confirmed,
          text,
          words: Math.max(1, wordCount(text)),
          cont: k > 0,
        };
      }),
    );
  });
}

/** Marks drawn on words (a Story Bible name's tint, a marked word's underline); built by the adapter, not here. */
export type WordDecoration = {
  paragraphId: string;
  start: number;
  end: number;
  kind: 'entity' | 'mark';
  /** A colour token name, e.g. `--place`. */
  colour: string;
  title?: string;
};

export type ParagraphNote = { id: string; paragraphId: string; name: string; text: string };

type WordToken = {
  /** The word without the space after it. */
  text: string;
  /** The whitespace that follows; never part of the word's highlight. */
  gap: string;
  index: number;
  entity?: WordDecoration;
  mark?: WordDecoration;
};

export type UnitWords = { lead: string; words: WordToken[] };

/** Every word of a sentence is its own token so the one being read can be marked. */
export function unitWords(paragraph: ReadingParagraph, unit: Pick<BoothUnit, 'start' | 'end'>, decorations: readonly WordDecoration[] = []): UnitWords {
  const own = decorations.filter((d) => d.paragraphId === paragraph.id && d.start < unit.end && d.end > unit.start);
  const text = paragraph.text.slice(unit.start, unit.end);
  const words: WordToken[] = [];
  for (const match of text.matchAll(/\S+\s*/g)) {
    const word = match[0].trimEnd();
    const from = unit.start + match.index;
    const to = from + word.length;
    const hit = (kind: WordDecoration['kind']) => own.find((d) => d.kind === kind && d.start < to && d.end > from);
    words.push({ text: word, gap: match[0].slice(word.length), index: words.length, entity: hit('entity'), mark: hit('mark') });
  }
  return { lead: /^\s*/.exec(text)?.[0] ?? '', words };
}
