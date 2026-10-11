// The browser mock's Script marks. It keeps the types and marks in memory and checks each mark against the mock manuscript's
// current text the way apps/desktop/internal/marks does: a range the line lacks is refused, the quote is the line's own text,
// a question needs its text and starts open, at least one type is kept, removing a type in use needs `removeUses`, the list is
// in reading order, and a mark whose line is gone, whose range no longer fits or whose words changed comes back stale.
import { MARK_COLOURS, MARK_STYLES, MARK_TEXT_MAX, MARK_TYPE_NAME_MAX } from './contracts/marks';
import type { ManuscriptChapter, ManuscriptParagraph, Mark, MarkType, Marks, MarksApi } from '../types';
import { wireClone } from './mockFixtures';

type Stored = Omit<Mark, 'paragraph' | 'stale' | 'staleReason'>;

/** The Studio Next mock's own types, the ones a project starts with. */
const DEFAULT_TYPES: MarkType[] = [
  { key: 'stress', name: 'Word stress', colour: 'copper', style: 'highlight', asks: false },
  { key: 'breath', name: 'Breath / pause', colour: 'info', style: 'dotted', asks: false },
  { key: 'pace', name: 'Pace', colour: 'ok', style: 'wavy', asks: false },
  { key: 'emo', name: 'Emotion', colour: 'bad', style: 'underline', asks: false },
  { key: 'note', name: 'Note', colour: 'violet', style: 'double', asks: false },
  { key: 'ask', name: 'Query for author', colour: 'warn', style: 'highlight', asks: true },
];

/** Whether a UTF-16 offset is a place in the text: from 0 to its length, never between the halves of a surrogate pair. */
const fits = (text: string, offset: number) => {
  if (!Number.isInteger(offset) || offset < 0 || offset > text.length) return false;
  const before = text.charCodeAt(offset - 1);
  return !(offset > 0 && offset < text.length && before >= 0xd800 && before <= 0xdbff);
};

// eslint-disable-next-line no-control-regex -- the point is to find control characters
const controlCharacters = /[\u0000-\u001f\u007f-\u009f]/;

function cleanText(text: string): string {
  const cleaned = text.replace(/\r\n/g, '\n').trim();
  if (cleaned.length > MARK_TEXT_MAX) throw new Error(`a note can be at most ${MARK_TEXT_MAX} characters`);
  if (controlCharacters.test(cleaned.replace(/[\n\t]/g, ''))) throw new Error('a note can hold only text, line breaks and tabs');
  return cleaned;
}

function cleanTypes(types: MarkType[], nextKey: () => string): MarkType[] {
  if (types.length === 0) throw new Error('keep at least one kind of mark');
  const seen = new Set<string>();
  return types.map((type) => {
    const cleaned = { ...type, key: type.key || nextKey(), name: type.name.trim() };
    if (!/^[A-Za-z0-9_-]{1,40}$/.test(cleaned.key)) throw new Error('that is not a kind of mark');
    if (!cleaned.name) throw new Error('give each kind of mark a name');
    if (cleaned.name.length > MARK_TYPE_NAME_MAX) throw new Error(`a kind of mark's name can be at most ${MARK_TYPE_NAME_MAX} characters`);
    if (controlCharacters.test(cleaned.name)) throw new Error("a kind of mark's name is one line of text");
    if (!(MARK_COLOURS as readonly string[]).includes(cleaned.colour)) throw new Error('that colour is not one of the six');
    if (!(MARK_STYLES as readonly string[]).includes(cleaned.style)) throw new Error('that line is not one of the six');
    if (seen.has(cleaned.key)) throw new Error('two kinds of mark have the same key');
    seen.add(cleaned.key);
    return cleaned;
  });
}

export function createMarksMock(ready: Promise<unknown>, chapters: () => ManuscriptChapter[], paragraphs: () => ManuscriptParagraph[]): MarksApi {
  let nextId = 1;
  let types = DEFAULT_TYPES.map((type) => ({ ...type }));
  let stored: Stored[] = [];

  const lineOf = (mark: Pick<Stored, 'chapterId' | 'paragraphId'>) =>
    paragraphs().find((paragraph) => paragraph.id === mark.paragraphId && paragraph.chapterId === mark.chapterId);

  const resolve = (mark: Stored): Mark => {
    const line = lineOf(mark);
    if (!line) return { ...mark, paragraph: null, stale: true, staleReason: 'paragraph_missing' };
    if (!fits(line.text, mark.start) || !fits(line.text, mark.end)) return { ...mark, paragraph: line.index, stale: true, staleReason: 'range_out_of_range' };
    if (line.text.slice(mark.start, mark.end) !== mark.quote) return { ...mark, paragraph: line.index, stale: true, staleReason: 'text_changed' };
    return { ...mark, paragraph: line.index, stale: false };
  };

  const list = (): Marks => {
    const position = new Map(paragraphs().map((paragraph, index) => [`${paragraph.chapterId}\u0000${paragraph.id}`, index]));
    const at = (mark: Mark) => position.get(`${mark.chapterId}\u0000${mark.paragraphId}`) ?? Number.MAX_SAFE_INTEGER;
    const marks = stored
      .map(resolve)
      .sort((a, b) => at(a) - at(b) || a.start - b.start || a.end - b.end || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
    return wireClone({ types, marks });
  };

  return {
    marksList: async () => {
      await ready;
      return list();
    },
    marksAdd: async (chapterId, paragraphId, start, end, typeKey, text) => {
      await ready;
      const cleaned = cleanText(text);
      if (!chapters().some((chapter) => chapter.id === chapterId)) throw new Error('that chapter is not in the manuscript');
      const line = lineOf({ chapterId, paragraphId });
      if (!line) throw new Error('that line is not in this chapter');
      if (!(start < end)) throw new Error('choose some words to mark first');
      if (!fits(line.text, start) || !fits(line.text, end)) throw new Error('those words are not in the line');
      const type = types.find((candidate) => candidate.key === typeKey);
      if (!type) throw new Error('that kind of mark is no longer there');
      if (type.asks && !cleaned) throw new Error('write the question first');
      const mark: Stored = {
        id: `mark-${nextId++}`,
        chapterId,
        paragraphId,
        start,
        end,
        quote: line.text.slice(start, end),
        type: typeKey,
        text: cleaned,
        ...(type.asks ? { status: 'open' as const } : {}),
        thread: [],
        createdAt: new Date().toISOString(),
      };
      stored = [...stored, mark];
      return wireClone(resolve(mark));
    },
    marksRemove: async (id) => {
      await ready;
      stored = stored.filter((mark) => mark.id !== id);
      return list();
    },
    marksSaveTypes: async (next, removeUses) => {
      await ready;
      const cleaned = cleanTypes(next, () => `m${nextId++}`);
      const asks = new Map(cleaned.map((type) => [type.key, type.asks]));
      const orphans = stored.filter((mark) => !asks.has(mark.type)).length;
      if (orphans > 0 && !removeUses) {
        throw new Error(`${orphans} ${orphans === 1 ? 'mark uses' : 'marks use'} a kind you removed; remove them too, or keep that kind`);
      }
      types = cleaned;
      stored = stored.filter((mark) => asks.has(mark.type)).map((mark) => (asks.get(mark.type) && !mark.status ? { ...mark, status: 'open' as const } : mark));
      return list();
    },
  };
}
