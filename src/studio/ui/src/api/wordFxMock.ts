// The browser mock's word effects. It keeps them in memory and checks each against the mock manuscript the way
// apps/desktop/internal/editlog/wordfx.go does, with the host's sentences: a word the paragraph lacks, words in more than one
// take, a range the app never sends, a missing DAW result or a chain named by a path is refused and nothing is saved; an
// effect on words that already carry one is kept and the answer's `over` names those; the list is in the original
// recording's time order, and an effect whose words changed comes back stale, never moved.
import type { ManuscriptChapter, ManuscriptParagraph, EditWordFxApi, WordFx, WordFxChange, WordFxList, WordFxRequest } from '../types';
import { wireClone } from './mockFixtures';

type Stored = Omit<WordFx, 'paragraph' | 'stale' | 'staleReason' | 'keys' | 'words'> & { ordinals: number[]; texts: string[] };

/** As the host allows. */
const MAX_KEYS = 5000;
const MAX_TEXT = 10000;
const MAX_SECONDS = 7 * 24 * 3600;
const MAX_FADE_MS = 1000;

/** The host's ErrBadChainName. */
const BAD_CHAIN_NAME = 'that is not the name of an effect chain the DAW lists, so nothing was saved';

const wordsOf = (text: string): string[] => text.split(/\s+/).filter(Boolean);
const finiteTime = (seconds: number) => Number.isFinite(seconds) && seconds >= 0 && seconds <= MAX_SECONDS;
const finiteOffset = (seconds: number) => Number.isFinite(seconds) && Math.abs(seconds) <= MAX_SECONDS;
const listName = (name: string) =>
  name.trim() !== '' && !/[\\:\p{Cc}]/u.test(name) && name.split('/').every((part) => part !== '' && part !== '.' && part !== '..');

function checkRequest(fx: WordFxRequest): void {
  if (!fx.guid?.trim() || !fx.daw?.trim()) throw new Error('an effect is recorded only after the DAW added it: its result is missing');
  if (!listName(fx.chainId) || !listName(fx.chainName)) throw new Error(BAD_CHAIN_NAME);
  if (!fx.source?.trim()) throw new Error('an effect must name the list it came from');
  if (!Number.isInteger(fx.fadeMs) || fx.fadeMs < 0 || fx.fadeMs > MAX_FADE_MS) throw new Error(`an effect's fades must be 0 to ${MAX_FADE_MS} ms`);
  if (!finiteTime(fx.a) || !finiteTime(fx.b)) throw new Error("an effect's times must be seconds from the start of the recording");
  if (fx.b <= fx.a) throw new Error('an effect must end after it starts');
  if (!finiteOffset(fx.off0) || !finiteOffset(fx.off1) || fx.off1 < fx.off0) throw new Error("an effect's place in its take must end after it starts");
  if (!fx.pid || fx.pid.includes(':')) throw new Error('that paragraph is not in this chapter');
  if (!fx.text.trim()) throw new Error('an effect must show the words it is on');
  for (const text of [fx.text, fx.chainId, fx.chainName, fx.source, fx.daw, fx.guid, fx.takeId ?? '', fx.backupId ?? '']) {
    if ([...text].length > MAX_TEXT) throw new Error(`an effect's text can be at most ${MAX_TEXT} characters`);
  }
}

function parseKeys(keys: string[]): Array<{ paragraphId: string; ordinal: number }> {
  if (keys.length === 0) throw new Error('choose a word first');
  if (keys.length > MAX_KEYS) throw new Error(`at most ${MAX_KEYS} words can be changed at once`);
  const parsed = new Map<string, { paragraphId: string; ordinal: number }>();
  for (const key of keys) {
    const cut = key.lastIndexOf(':');
    const digits = key.slice(cut + 1);
    if (cut <= 0 || !/^(0|[1-9]\d*)$/.test(digits)) throw new Error('that is not a word of the script');
    if (!parsed.has(key)) parsed.set(key, { paragraphId: key.slice(0, cut), ordinal: Number(digits) });
  }
  return [...parsed.values()];
}

export function createWordFxMock(ready: Promise<unknown>, chapters: () => ManuscriptChapter[], paragraphs: () => ManuscriptParagraph[]): EditWordFxApi {
  let stored: Stored[] = [];

  const lineOf = (chapterId: string, paragraphId: string) =>
    paragraphs().find((paragraph) => paragraph.id === paragraphId && paragraph.chapterId === chapterId);

  const resolve = ({ ordinals, texts, ...fx }: Stored): WordFx => {
    const base = { ...fx, keys: ordinals.map((ordinal) => `${fx.pid}:${ordinal}`), words: [...texts] };
    const line = lineOf(fx.chapterId, fx.pid);
    if (!line) return { ...base, paragraph: null, stale: true, staleReason: 'paragraph_missing' };
    const words = wordsOf(line.text);
    for (const [index, ordinal] of ordinals.entries()) {
      if (ordinal >= words.length) return { ...base, paragraph: line.index, stale: true, staleReason: 'word_missing' };
      if (words[ordinal] !== texts[index]) return { ...base, paragraph: line.index, stale: true, staleReason: 'text_changed' };
    }
    return { ...base, paragraph: line.index, stale: false };
  };

  const list = (chapterId: string): WordFxList => {
    const effects = stored
      .filter((fx) => fx.chapterId === chapterId)
      .map(resolve)
      .sort((x, y) => x.a - y.a || (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
    return wireClone({ chapterId, effects });
  };

  const change = (chapterId: string, changed: string[], over: string[] = []): WordFxChange => ({ ...list(chapterId), changed, over });

  const nextId = () => `fx${stored.reduce((highest, fx) => Math.max(highest, Number(fx.id.replace(/^fx/, '')) || 0), 0) + 1}`;

  return {
    editingWordFxList: async (chapterId) => {
      await ready;
      return list(chapterId);
    },
    editingWordFxRecord: async (chapterId, request) => {
      await ready;
      checkRequest(request);
      const parsed = parseKeys(request.keys);
      if (!chapters().some((chapter) => chapter.id === chapterId)) throw new Error('that chapter is not in the manuscript');
      const line = lineOf(chapterId, request.pid);
      if (!line) throw new Error('that paragraph is not in this chapter');
      const words = wordsOf(line.text);
      const picked = parsed.map((key) => {
        if (key.paragraphId !== request.pid) throw new Error('these words sit in more than one take: an effect needs words from one take');
        const text = words[key.ordinal];
        if (text === undefined) throw new Error('that word is past the end of its line');
        return { ordinal: key.ordinal, text };
      });
      picked.sort((x, y) => x.ordinal - y.ordinal);
      const ordinals = picked.map((word) => word.ordinal);
      const over = stored
        .filter((fx) => fx.chapterId === chapterId && fx.pid === request.pid && fx.ordinals.some((ordinal) => ordinals.includes(ordinal)))
        .map((fx) => fx.id);
      const id = nextId();
      const fx: Stored = {
        id,
        chapterId,
        pid: request.pid,
        ...(request.takeId ? { takeId: request.takeId } : {}),
        text: request.text,
        a: request.a,
        b: request.b,
        off0: request.off0,
        off1: request.off1,
        chainId: request.chainId,
        chainName: request.chainName,
        source: request.source,
        fadeMs: request.fadeMs,
        daw: request.daw,
        guid: request.guid,
        ...(request.backupId ? { backupId: request.backupId } : {}),
        at: new Date().toISOString(),
        ordinals,
        texts: picked.map((word) => word.text),
        bypassed: false,
      };
      stored = [...stored, fx];
      return change(chapterId, [id], over);
    },
    editingWordFxRemove: async (chapterId, id) => {
      await ready;
      if (!id) throw new Error('choose an effect first');
      const before = stored.length;
      stored = stored.filter((fx) => fx.chapterId !== chapterId || fx.id !== id);
      return change(chapterId, stored.length < before ? [id] : []);
    },
    editingWordFxBypass: async (chapterId, id, bypassed) => {
      await ready;
      if (!id) throw new Error('choose an effect first');
      const changed = stored.some((fx) => fx.chapterId === chapterId && fx.id === id && fx.bypassed !== bypassed) ? [id] : [];
      stored = stored.map((fx) => (fx.chapterId === chapterId && fx.id === id ? { ...fx, bypassed } : fx));
      return change(chapterId, changed);
    },
  };
}
