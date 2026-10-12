import type { GuideDialogueCue, GuideEntity, ManuscriptParagraph, TeleprompterFlag, TeleprompterSpan } from '../../../types';
import { WPH } from '../../schedule/estimates';
import type { CreditsKind } from '../readerModel';
import { wordCount, type BoothUnit, type ReadingParagraph, type WordDecoration } from '../reading/boothUnits';
import type { ReadingPosition } from '../reading/readingPosition';
import type { SuspectedFlag } from '../suspected/suspectedLines';

// What the Booth text reads, built from the host's data: the chapter's paragraphs cut at the Story Bible's dialogue cues, or the
// rendered credits, and the mapping between the host's script words (its `read` index) and a paragraph and word. Pure.

type Phrase = NonNullable<ReadingParagraph['phrases']>[number];

/** The chapter's paragraphs as the Booth reads them: each dialogue cue is a quoted phrase with its speaker's name, the rest narration. */
export function readingParagraphsOf(
  paragraphs: readonly Pick<ManuscriptParagraph, 'id' | 'text'>[],
  cues: readonly GuideDialogueCue[],
  entities: readonly Pick<GuideEntity, 'id' | 'canonical_name'>[],
): ReadingParagraph[] {
  const names = new Map(entities.map((entity) => [entity.id, entity.canonical_name]));
  return paragraphs.map(({ id, text }) => {
    const own = cues
      .filter((cue) => cue.paragraphId === id && cue.quote_start >= 0 && cue.quote_end > cue.quote_start && cue.quote_end <= text.length)
      .sort((a, b) => a.quote_start - b.quote_start);
    if (!own.length) return { id, text };
    const phrases: Phrase[] = [];
    let at = 0;
    const narration = (end: number) => {
      if (end > at) phrases.push({ key: `${id}:${at}`, start: at, end, quoted: false, speaker: '', confirmed: true });
    };
    for (const cue of own) {
      if (cue.quote_start < at) continue;
      narration(cue.quote_start);
      phrases.push({
        key: cue.id,
        start: cue.quote_start,
        end: cue.quote_end,
        quoted: true,
        speaker: (cue.speaker_entity_id && names.get(cue.speaker_entity_id)) || '',
        confirmed: cue.corrected || cue.speaker_source === 'correction',
      });
      at = cue.quote_end;
    }
    narration(text.length);
    return { id, text, phrases };
  });
}

/** The rendered credits, one paragraph per non-empty line. */
export function creditsParagraphs(kind: CreditsKind, text: string): ReadingParagraph[] {
  return text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => ({ id: `credits-${kind}-${index}`, text: line }));
}

/** The host's paragraph spans in order; the n-th is the n-th paragraph the Booth reads (credits have no paragraph ids of their own). */
const paragraphSpans = (spans: readonly TeleprompterSpan[]) => spans.filter((span) => span.kind === 'paragraph');

/** The paragraph and word a script word (the host's `read`) stands at, or null outside every paragraph. */
export function positionInScript(spans: readonly TeleprompterSpan[], paragraphs: readonly ReadingParagraph[], word: number): ReadingPosition | null {
  const own = paragraphSpans(spans);
  const at = own.findIndex((span) => word >= span.start && word < span.start + span.count);
  const paragraph = paragraphs[at];
  return paragraph ? { paragraphId: paragraph.id, word: word - own[at].start } : null;
}

/** The script word for a paragraph and word, or null when the host's script has no such paragraph. */
export function scriptWordAt(spans: readonly TeleprompterSpan[], paragraphs: readonly ReadingParagraph[], position: ReadingPosition): number | null {
  const index = paragraphs.findIndex((paragraph) => paragraph.id === position.paragraphId);
  const span = paragraphSpans(spans)[index];
  return span ? span.start + Math.max(0, Math.min(position.word, span.count - 1)) : null;
}

/** The word a character offset falls in (or the word after it, on a space): the words that end at or before it come first. */
export function positionAtOffset(paragraphs: readonly ReadingParagraph[], paragraphId: string, offset: number): ReadingPosition | null {
  const paragraph = paragraphs.find((p) => p.id === paragraphId);
  if (!paragraph) return null;
  const before = [...paragraph.text.matchAll(/\S+/g)].filter((match) => match.index + match[0].length <= offset).length;
  return { paragraphId, word: Math.min(before, Math.max(0, wordCount(paragraph.text) - 1)) };
}

/** Where a phrase starts in the chapter's audio, in seconds, read at the standard rate (`WPH` words an hour). An estimate. */
export function secondsBefore(units: readonly BoothUnit[], phrase: number): number {
  const words = units.slice(0, Math.max(0, phrase)).reduce((sum, unit) => sum + unit.words, 0);
  return (words / WPH) * 3600;
}

/** The host's suspected flags placed in the paragraphs the Booth reads: the paragraph the flag starts in, and the words it covers there. */
export function suspectedFrom(
  flags: readonly TeleprompterFlag[],
  spans: readonly TeleprompterSpan[],
  paragraphs: readonly ReadingParagraph[],
  chapterId: string,
): SuspectedFlag[] {
  const own = paragraphSpans(spans);
  return flags.flatMap((flag) => {
    const at = own.findIndex((span) => flag.start >= span.start && flag.start < span.start + span.count);
    const span = own[at];
    const paragraph = paragraphs[at];
    if (!span || !paragraph) return [];
    const wordStart = flag.start - span.start;
    const wordEnd = Math.max(wordStart + 1, Math.min(flag.end, span.start + span.count) - span.start);
    const words = paragraph.text.match(/\S+/g) ?? [];
    return [
      {
        chapterId,
        paragraphId: paragraph.id,
        kind: flag.kind,
        wordStart,
        wordEnd,
        scriptStart: flag.start,
        scriptEnd: flag.end,
        script: words.slice(wordStart, wordEnd).join(' '),
        heard: flag.heard,
      },
    ];
  });
}

/** The host's spans before it has sent a script: a title span, then one per paragraph, counted by words. For the resume line only. */
export function estimatedSpans(title: string, paragraphs: readonly ReadingParagraph[]): TeleprompterSpan[] {
  const titleCount = wordCount(title);
  let start = titleCount;
  return [
    { kind: 'title', id: 'title', index: null, start: 0, count: titleCount },
    ...paragraphs.map((paragraph, index) => {
      const count = wordCount(paragraph.text);
      const span: TeleprompterSpan = { kind: 'paragraph', id: paragraph.id, index, start, count };
      start += count;
      return span;
    }),
  ];
}

/** The Story Bible name (an entity tint's title) on a paragraph's word, or null when the word carries none. */
export function entityAtWord(
  paragraphs: readonly ReadingParagraph[],
  decorations: readonly WordDecoration[],
  paragraphId: string,
  word: number,
): string | null {
  const text = paragraphs.find((paragraph) => paragraph.id === paragraphId)?.text ?? '';
  const match = [...text.matchAll(/\S+/g)][word];
  if (!match) return null;
  const from = match.index;
  const to = from + match[0].length;
  const hit = decorations.find((d) => d.kind === 'entity' && d.paragraphId === paragraphId && d.start < to && d.end > from);
  return hit?.title ?? null;
}
