import { cueIsConfirmed } from '../../manuscript/dialogueCues.selectors';
import type { GuideDialogueCue, GuideEntity, ManuscriptParagraph, TeleprompterFlag, TeleprompterSpan } from '../../../types';
import { WPH } from '../../schedule/estimates';
import type { CreditsKind } from '../readerModel';
import { UNKNOWN_SPEAKER, wordCount, type BoothUnit, type ReadingParagraph, type WordDecoration } from '../reading/boothUnits';
import type { ReadingPosition } from '../reading/readingPosition';
import type { SuspectedFlag } from '../suspected/suspectedLinesModel';

// What the Booth text reads, built from the host's data: the chapter's paragraphs cut at the Story Bible's dialogue cues, or the
// rendered credits, and the mapping between the host's script words (its `read` index) and a paragraph and word. Pure.

type Phrase = NonNullable<ReadingParagraph['phrases']>[number];

/** The chapter's paragraphs as the Booth reads them: each dialogue cue is a quoted phrase with its speaker's name, the rest narration.
 * `entities` are the entries a line can be given to (`cueSpeakerEntries`); a line given to any other is unknown. */
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
        speaker: (cue.speaker_entity_id && names.get(cue.speaker_entity_id)) || UNKNOWN_SPEAKER,
        confirmed: cueIsConfirmed(cue),
      });
      at = cue.quote_end;
    }
    narration(text.length);
    return { id, text, phrases };
  });
}

/** The ids of the heading lines; no manuscript paragraph has one. */
const HEADING_TITLE_ID = 'chapter-heading-title';
const HEADING_SUBTITLE_ID = 'chapter-heading-subtitle';

/**
 * The chapter heading as the Booth's first lines (#2251 item 7): the title, then the subtitle when there is one, in source casing, each a
 * line of its own with its words on one line (a manual break in a title is a space). A part with no words is no line, so a chapter
 * with no title starts at its first paragraph. The host's script opens with the same words, title then subtitle (`chapter_script.py`'s
 * heading), so reading them aloud is followed like any line; reading them is optional, so no flag is ever placed on them (`suspectedFrom`).
 */
export function headingParagraphs(chapter: { title: string; subtitle?: string }): ReadingParagraph[] {
  const line = (text: string | undefined) => (text ?? '').split(/\s+/).filter(Boolean).join(' ');
  const parts = [
    { id: HEADING_TITLE_ID, text: line(chapter.title), heading: 'title' as const },
    { id: HEADING_SUBTITLE_ID, text: line(chapter.subtitle), heading: 'subtitle' as const },
  ];
  return parts.filter((part) => part.text !== '');
}

/** The manuscript paragraph number (from 0) of a line the Booth reads: the heading lines are not paragraphs, so they are on the first. */
export function bodyParagraphIndex(paragraphs: readonly ReadingParagraph[], paragraphIndex: number): number {
  const heading = paragraphs.filter((paragraph) => paragraph.heading).length;
  return Math.max(0, paragraphIndex - heading);
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

/**
 * Where each line the Booth reads sits in the host's script: its first script word and its word count, or null when the host's script
 * does not follow it. The heading lines share the host's title span, title first: both are followed when their words fill the span, the
 * title alone when the span counts the title only (a script from before the subtitle was read), neither when the counts disagree. The
 * other lines are the host's paragraph spans in order.
 */
function scriptPlaces(spans: readonly TeleprompterSpan[], paragraphs: readonly ReadingParagraph[]): Array<{ start: number; count: number } | null> {
  const title = spans.find((span) => span.kind === 'title');
  const heading = paragraphs.filter((paragraph) => paragraph.heading);
  const counts = heading.map((paragraph) => wordCount(paragraph.text));
  const all = counts.reduce((sum, count) => sum + count, 0);
  const followed = !title ? 0 : all === title.count ? heading.length : counts[0] === title.count ? 1 : 0;
  const body = paragraphSpans(spans);
  let headingIndex = 0;
  let headingStart = title?.start ?? 0;
  let bodyIndex = 0;
  return paragraphs.map((paragraph) => {
    if (paragraph.heading) {
      const count = counts[headingIndex];
      const place = headingIndex < followed ? { start: headingStart, count } : null;
      headingIndex += 1;
      headingStart += count;
      return place;
    }
    const span = body[bodyIndex];
    bodyIndex += 1;
    return span ? { start: span.start, count: span.count } : null;
  });
}

/** The line and word a script word (the host's `read`) stands at, or null outside every line the Booth follows. */
export function positionInScript(spans: readonly TeleprompterSpan[], paragraphs: readonly ReadingParagraph[], word: number): ReadingPosition | null {
  const places = scriptPlaces(spans, paragraphs);
  const at = places.findIndex((place) => place !== null && word >= place.start && word < place.start + place.count);
  const place = places[at];
  return place ? { paragraphId: paragraphs[at].id, word: word - place.start } : null;
}

/** The script word for a line and word, or null when the host's script does not follow that line. */
export function scriptWordAt(spans: readonly TeleprompterSpan[], paragraphs: readonly ReadingParagraph[], position: ReadingPosition): number | null {
  const index = paragraphs.findIndex((paragraph) => paragraph.id === position.paragraphId);
  const place = scriptPlaces(spans, paragraphs)[index];
  return place ? place.start + Math.max(0, Math.min(position.word, place.count - 1)) : null;
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
  // The heading is read optionally and in the narrator's own words ("Chapter Seven" for "Chapter 7"): nothing said there is a pickup,
  // as the host's own flags already hold (flags.py), so a flag that starts in it is dropped here too.
  const own = paragraphSpans(spans);
  const body = paragraphs.filter((paragraph) => !paragraph.heading);
  return flags.flatMap((flag) => {
    const at = own.findIndex((span) => flag.start >= span.start && flag.start < span.start + span.count);
    const span = own[at];
    const paragraph = body[at];
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

/** The host's spans before it has sent a script: a title span over the heading lines, then one per paragraph, counted by words. For the resume line only. */
export function estimatedSpans(paragraphs: readonly ReadingParagraph[]): TeleprompterSpan[] {
  const titleCount = paragraphs.filter((paragraph) => paragraph.heading).reduce((sum, paragraph) => sum + wordCount(paragraph.text), 0);
  let start = titleCount;
  return [
    { kind: 'title', id: 'title', index: null, start: 0, count: titleCount },
    ...paragraphs
      .filter((paragraph) => !paragraph.heading)
      .map((paragraph, index) => {
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
