// The browser mock's Script prep states and flagged words. It keeps them in memory and checks each flag against the mock
// manuscript's current text the way apps/desktop/internal/scriptprep does: a chapter or range the manuscript lacks is refused,
// the word is the line's own text for the range (lower-cased as its key), the same range flagged again is the one flag, a
// say-value is one line within the cap from a known source (none means the narrator typed it), the value is dropped with the
// word's last flag, the status is worked out here rather than by a page, and a flag whose line is gone, whose range no longer
// fits or whose words changed comes back stale.
import { PREP_STATES, SCRIPT_SAY_MANUAL_SOURCE, SCRIPT_SAY_MAX, SCRIPT_WORD_MAX } from './contracts/scriptPrep';
import type { ManuscriptChapter, ManuscriptParagraph, PrepState, ScriptPrep, ScriptPrepApi, ScriptWord, ScriptWordFlag } from '../types';
import { wireClone } from './mockFixtures';

type Stored = Omit<ScriptWordFlag, 'paragraph' | 'stale' | 'staleReason'> & { word: string };

/** The source ids the mock's pronunciationSources lists. */
const SOURCES = ['cmu', 'wiktextract', 'espeak', 'merriam_webster', SCRIPT_SAY_MANUAL_SOURCE];

/** Whether a UTF-16 offset is a place in the text: from 0 to its length, never between the halves of a surrogate pair. */
const fits = (text: string, offset: number) => {
  if (!Number.isInteger(offset) || offset < 0 || offset > text.length) return false;
  const before = text.charCodeAt(offset - 1);
  return !(offset > 0 && offset < text.length && before >= 0xd800 && before <= 0xdbff);
};

// eslint-disable-next-line no-control-regex -- the point is to find control characters
const controlCharacters = /[\u0000-\u001f\u007f-\u009f]/;

const wordKey = (text: string) => text.trim().toLowerCase();

export function createScriptPrepMock(ready: Promise<unknown>, chapters: () => ManuscriptChapter[], paragraphs: () => ManuscriptParagraph[]): ScriptPrepApi {
  let nextId = 1;
  const states = new Map<string, PrepState>();
  let flags: Stored[] = [];
  const says = new Map<string, { say: string; source: string }>();

  const hasChapter = (chapterId: string) => chapters().some((chapter) => chapter.id === chapterId);
  const lineOf = (flag: Pick<Stored, 'chapterId' | 'paragraphId'>) =>
    paragraphs().find((paragraph) => paragraph.id === flag.paragraphId && paragraph.chapterId === flag.chapterId);

  const resolve = ({ word: _word, ...flag }: Stored): ScriptWordFlag => {
    const line = lineOf(flag);
    if (!line) return { ...flag, paragraph: null, stale: true, staleReason: 'paragraph_missing' };
    if (!fits(line.text, flag.start) || !fits(line.text, flag.end)) return { ...flag, paragraph: line.index, stale: true, staleReason: 'range_out_of_range' };
    if (line.text.slice(flag.start, flag.end) !== flag.quote) return { ...flag, paragraph: line.index, stale: true, staleReason: 'text_changed' };
    return { ...flag, paragraph: line.index, stale: false };
  };

  const inReadingOrder = (resolved: ScriptWordFlag[]) => {
    const position = new Map(paragraphs().map((paragraph, index) => [`${paragraph.chapterId}\u0000${paragraph.id}`, index]));
    const at = (flag: ScriptWordFlag) => position.get(`${flag.chapterId}\u0000${flag.paragraphId}`) ?? Number.MAX_SAFE_INTEGER;
    return resolved.sort((a, b) => at(a) - at(b) || a.start - b.start || a.end - b.end || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  };

  const wordOf = (key: string): ScriptWord => {
    const own = inReadingOrder(flags.filter((flag) => flag.word === key).map(resolve));
    if (own.length === 0) return { word: key, say: '', source: '', status: 'not_flagged', flags: [] };
    const say = says.get(key) ?? { say: '', source: '' };
    return { word: key, ...say, status: say.say ? 'set' : 'not_set', flags: own };
  };

  const list = (): ScriptPrep => {
    const keyOf = new Map(flags.map((flag) => [flag.id, flag.word]));
    const order = inReadingOrder(flags.map(resolve)).map((flag) => keyOf.get(flag.id) ?? '');
    return wireClone({
      chapters: chapters().map((chapter) => ({ chapterId: chapter.id, state: states.get(chapter.id) ?? 'none' })),
      words: [...new Set(order)].map(wordOf),
    });
  };

  return {
    scriptPrepList: async () => {
      await ready;
      return list();
    },
    scriptPrepSetChapter: async (chapterId, state) => {
      await ready;
      if (!(PREP_STATES as readonly string[]).includes(state)) throw new Error('that is not a prep state');
      if (!hasChapter(chapterId)) throw new Error('that chapter is not in the manuscript');
      if (state === 'none') states.delete(chapterId);
      else states.set(chapterId, state);
      return { chapterId, state };
    },
    scriptWordFlag: async (chapterId, paragraphId, start, end) => {
      await ready;
      if (!hasChapter(chapterId)) throw new Error('that chapter is not in the manuscript');
      const line = lineOf({ chapterId, paragraphId });
      if (!line) throw new Error('that line is not in this chapter');
      if (!(start < end)) throw new Error('choose a word to flag first');
      if (!fits(line.text, start) || !fits(line.text, end)) throw new Error('those words are not in the line');
      const quote = line.text.slice(start, end);
      if (quote.length > SCRIPT_WORD_MAX) throw new Error(`a flagged word can be at most ${SCRIPT_WORD_MAX} characters`);
      const key = wordKey(quote);
      if (!key) throw new Error('choose a word to flag first');
      const known = flags.some(
        (flag) => flag.chapterId === chapterId && flag.paragraphId === paragraphId && flag.start === start && flag.end === end && flag.word === key,
      );
      if (!known) flags = [...flags, { id: `flag-${nextId++}`, chapterId, paragraphId, start, end, quote, word: key, createdAt: new Date().toISOString() }];
      return wireClone(wordOf(key));
    },
    scriptWordSay: async (word, say, source) => {
      await ready;
      const key = wordKey(word);
      const cleaned = say.trim();
      if (cleaned.length > SCRIPT_SAY_MAX) throw new Error(`how a word is said can be at most ${SCRIPT_SAY_MAX} characters`);
      if (controlCharacters.test(cleaned)) throw new Error('how a word is said is one line of text');
      const from = !cleaned ? '' : source || SCRIPT_SAY_MANUAL_SOURCE;
      if (from && !SOURCES.includes(from)) throw new Error('that pronunciation source is not one of yours');
      if (!flags.some((flag) => flag.word === key)) throw new Error('flag the word in the text first');
      if (cleaned) says.set(key, { say: cleaned, source: from });
      else says.delete(key);
      return wireClone(wordOf(key));
    },
    scriptWordUnflag: async (flagId) => {
      await ready;
      const flag = flags.find((candidate) => candidate.id === flagId);
      if (!flag) throw new Error('that flag is no longer there');
      flags = flags.filter((candidate) => candidate.id !== flagId);
      if (!flags.some((candidate) => candidate.word === flag.word)) says.delete(flag.word);
      return wireClone(wordOf(flag.word));
    },
  };
}
