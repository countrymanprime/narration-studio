// The browser mock's Editing records. It keeps the accepted words in memory and checks each one against the mock
// manuscript's current text the way apps/desktop/internal/editlog does: a key the chapter's text lacks is refused and nothing
// is saved, a word already accepted is not recorded twice, the list is in reading order, and a word whose text changed comes
// back stale, never moved.
import type { AcceptedWord, AcceptedWords, AcceptedWordsChange, EditLogApi, ManuscriptChapter, ManuscriptParagraph } from '../types';
import { wireClone } from './mockFixtures';

type Stored = { chapterId: string; paragraphId: string; ordinal: number; text: string; acceptedAt: string };
type Key = { key: string; paragraphId: string; ordinal: number };

/** The most keys one call names, as the host allows. */
const MAX_KEYS = 5000;

/** A paragraph's words, split the way the reader splits them. */
const wordsOf = (text: string): string[] => text.split(/\s+/).filter(Boolean);
const keyOf = (paragraphId: string, ordinal: number) => `${paragraphId}:${ordinal}`;

function parseKeys(keys: string[]): Key[] {
  if (keys.length === 0) throw new Error('choose a word first');
  if (keys.length > MAX_KEYS) throw new Error(`at most ${MAX_KEYS} words can be changed at once`);
  const parsed = new Map<string, Key>();
  for (const key of keys) {
    const cut = key.lastIndexOf(':');
    const digits = key.slice(cut + 1);
    if (cut <= 0 || !/^(0|[1-9]\d*)$/.test(digits)) throw new Error('that is not a word of the script');
    if (!parsed.has(key)) parsed.set(key, { key, paragraphId: key.slice(0, cut), ordinal: Number(digits) });
  }
  return [...parsed.values()];
}

export function createEditLogMock(ready: Promise<unknown>, chapters: () => ManuscriptChapter[], paragraphs: () => ManuscriptParagraph[]): EditLogApi {
  let stored: Stored[] = [];

  const lineOf = (chapterId: string, paragraphId: string) =>
    paragraphs().find((paragraph) => paragraph.id === paragraphId && paragraph.chapterId === chapterId);

  const resolve = (word: Stored): AcceptedWord => {
    const base = {
      key: keyOf(word.paragraphId, word.ordinal),
      paragraphId: word.paragraphId,
      ordinal: word.ordinal,
      text: word.text,
      acceptedAt: word.acceptedAt,
    };
    const line = lineOf(word.chapterId, word.paragraphId);
    if (!line) return { ...base, paragraph: null, stale: true, staleReason: 'paragraph_missing' };
    const words = wordsOf(line.text);
    if (word.ordinal >= words.length) return { ...base, paragraph: line.index, stale: true, staleReason: 'word_missing' };
    if (words[word.ordinal] !== word.text) return { ...base, paragraph: line.index, stale: true, staleReason: 'text_changed' };
    return { ...base, paragraph: line.index, stale: false };
  };

  const list = (chapterId: string): AcceptedWords => {
    const at = (word: AcceptedWord) => word.paragraph ?? Number.MAX_SAFE_INTEGER;
    const words = stored
      .filter((word) => word.chapterId === chapterId)
      .map(resolve)
      .sort((a, b) => at(a) - at(b) || (a.paragraphId < b.paragraphId ? -1 : a.paragraphId > b.paragraphId ? 1 : 0) || a.ordinal - b.ordinal);
    return wireClone({ chapterId, words });
  };

  const change = (chapterId: string, changed: string[]): AcceptedWordsChange => ({ ...list(chapterId), changed });

  return {
    editingAcceptedList: async (chapterId) => {
      await ready;
      return list(chapterId);
    },
    editingAccept: async (chapterId, keys) => {
      await ready;
      const parsed = parseKeys(keys);
      if (!chapters().some((chapter) => chapter.id === chapterId)) throw new Error('that chapter is not in the manuscript');
      const texts = parsed.map((key) => {
        const line = lineOf(chapterId, key.paragraphId);
        if (!line) throw new Error('that word is not in this chapter');
        const text = wordsOf(line.text)[key.ordinal];
        if (text === undefined) throw new Error('that word is past the end of its line');
        return text;
      });
      const changed: string[] = [];
      const acceptedAt = new Date().toISOString();
      parsed.forEach((key, index) => {
        const text = texts[index] ?? '';
        const same = (word: Stored) => word.chapterId === chapterId && word.paragraphId === key.paragraphId && word.ordinal === key.ordinal;
        const existing = stored.find(same);
        if (existing?.text === text) return;
        const word: Stored = { chapterId, paragraphId: key.paragraphId, ordinal: key.ordinal, text, acceptedAt };
        stored = existing ? stored.map((other) => (same(other) ? word : other)) : [...stored, word];
        changed.push(key.key);
      });
      return change(chapterId, changed);
    },
    editingUnaccept: async (chapterId, keys) => {
      await ready;
      const remove = new Set(parseKeys(keys).map((key) => key.key));
      const changed: string[] = [];
      stored = stored.filter((word) => {
        const key = keyOf(word.paragraphId, word.ordinal);
        if (word.chapterId !== chapterId || !remove.has(key)) return true;
        changed.push(key);
        return false;
      });
      return change(chapterId, changed);
    },
  };
}
