// The takes the Booth's passage map records and the paragraphs they read, worked out as
// apps/desktop/internal/passagetakes does (mapSpans, mappedSpans): a take begins at a mark and ends where the next mark of
// its run says the reading had got to. A take with a stale mark at either end is left out, because where it sits in the
// current text is not known. Editing lists a Booth-recorded chapter's passages from these, and places their takes exactly.
import type { PassageMark, PassagePlace } from './contracts/passageMap';

/** One take of the map: where it began and ended in the text, and the ids the DAW gave it. */
export interface MapSpan {
  from: PassagePlace;
  to: PassagePlace;
  itemGuid: string;
  takeGuid: string;
}

/** A paragraph of the chapter, in the chapter's order. */
export interface MapParagraph {
  id: string;
  text: string;
}

const wordsIn = (text: string): number => text.split(/\s+/).filter(Boolean).length;

/** The takes the marks record. `marks` are as `passageMapList` answers them: runs in the order recorded, each in time order. */
function mapSpans(marks: readonly PassageMark[]): MapSpan[] {
  const out: MapSpan[] = [];
  for (let i = 0; i + 1 < marks.length; i++) {
    const begin = marks[i];
    const end = marks[i + 1];
    if (begin.run !== end.run || begin.stale || end.stale || !end.prev) continue;
    out.push({ from: { pid: begin.pid, word: begin.word }, to: end.prev, itemGuid: begin.itemGuid, takeGuid: begin.takeGuid });
  }
  return out;
}

/**
 * How many of the map's takes read at least one word of each paragraph, by paragraph id. A take that began in one paragraph
 * and ended in a later one read the end of the first, every paragraph between and the start of the last; a roll back to an
 * earlier place starts the next take there, so the paragraph it rolled back into is read twice.
 */
export function takesPerParagraph(marks: readonly PassageMark[], paragraphs: readonly MapParagraph[]): Map<string, MapSpan[]> {
  const index = new Map(paragraphs.map((p, i) => [p.id, i]));
  const out = new Map<string, MapSpan[]>();
  for (const span of mapSpans(marks)) {
    const from = index.get(span.from.pid);
    const to = index.get(span.to.pid);
    if (from === undefined || to === undefined) continue;
    for (let p = from; p <= to; p++) {
      const words = wordsIn(paragraphs[p].text);
      const begin = p === from ? span.from.word : 0;
      const end = p === to ? Math.min(words, span.to.word) : words;
      if (end > begin) out.set(paragraphs[p].id, [...(out.get(paragraphs[p].id) ?? []), span]);
    }
  }
  return out;
}

/** The paragraphs two or more of the map's takes read: the passages the Booth recorded, with takes to choose between. */
export function mapPassages(marks: readonly PassageMark[], paragraphs: readonly MapParagraph[]): Set<string> {
  const out = new Set<string>();
  for (const [id, spans] of takesPerParagraph(marks, paragraphs)) if (spans.length >= 2) out.add(id);
  return out;
}
