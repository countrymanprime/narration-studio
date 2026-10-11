// The browser mock's cuts. It keeps them in memory and checks each against the mock manuscript the way
// apps/desktop/internal/editlog/cuts.go does, with the host's sentences: a word the paragraph lacks, a range or option the
// app never sends, a missing DAW result or an overlap with a stored cut on the same take is refused and nothing is saved;
// the list is in the original recording's time order, and a cut whose words changed comes back stale, never moved.
import type { EditCut, EditCutRequest, EditCuts, EditCutsApi, EditCutsChange, ManuscriptChapter, ManuscriptParagraph } from '../types';
import { wireClone } from './mockFixtures';

type Stored = Omit<EditCut, 'paragraph' | 'stale' | 'staleReason' | 'keys' | 'words'> & { ordinals: number[]; texts: string[] };

/** As the host allows. */
const MAX_KEYS = 5000;
const MAX_TEXT = 10000;
const MAX_SECONDS = 7 * 24 * 3600;
const FADE_CHOICES = [0, 6, 12, 25];

const wordsOf = (text: string): string[] => text.split(/\s+/).filter(Boolean);
const finiteTime = (seconds: number) => Number.isFinite(seconds) && seconds >= 0 && seconds <= MAX_SECONDS;
const finiteOffset = (seconds: number) => Number.isFinite(seconds) && Math.abs(seconds) <= MAX_SECONDS;

function checkRequest(cut: EditCutRequest): void {
  const steps = (cut as { undoSteps?: unknown }).undoSteps;
  if (typeof steps !== 'number' || !cut.guid?.trim() || !cut.daw?.trim())
    throw new Error('a cut is recorded only after the DAW made it: its result is missing');
  if (steps < 0) throw new Error("the DAW's undo steps cannot be negative");
  if (cut.mode !== 'close' && cut.mode !== 'gap') throw new Error('a cut either closes the gap or leaves it');
  if (!FADE_CHOICES.includes(cut.fadeMs)) throw new Error('that crossfade is not one of the choices');
  if (!finiteTime(cut.a) || !finiteTime(cut.b)) throw new Error("a cut's times must be seconds from the start of the recording");
  if (cut.b <= cut.a) throw new Error('a cut must end after it starts');
  if (!finiteOffset(cut.off0) || !finiteOffset(cut.off1) || cut.off1 < cut.off0) throw new Error("a cut's place in its take must end after it starts");
  if (!cut.pid || cut.pid.includes(':')) throw new Error('that paragraph is not in this chapter');
  if (!cut.text.trim()) throw new Error('a cut must show the words it hides');
  for (const text of [cut.text, cut.daw, cut.guid, cut.takeId ?? '', cut.backupId ?? '']) {
    if ([...text].length > MAX_TEXT) throw new Error(`a cut's text can be at most ${MAX_TEXT} characters`);
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

export function createEditCutsMock(ready: Promise<unknown>, chapters: () => ManuscriptChapter[], paragraphs: () => ManuscriptParagraph[]): EditCutsApi {
  let stored: Stored[] = [];

  const lineOf = (chapterId: string, paragraphId: string) =>
    paragraphs().find((paragraph) => paragraph.id === paragraphId && paragraph.chapterId === chapterId);

  const resolve = ({ ordinals, texts, ...cut }: Stored): EditCut => {
    const base = { ...cut, keys: ordinals.map((ordinal) => `${cut.pid}:${ordinal}`), words: [...texts] };
    const line = lineOf(cut.chapterId, cut.pid);
    if (!line) return { ...base, paragraph: null, stale: true, staleReason: 'paragraph_missing' };
    const words = wordsOf(line.text);
    for (const [index, ordinal] of ordinals.entries()) {
      if (ordinal >= words.length) return { ...base, paragraph: line.index, stale: true, staleReason: 'word_missing' };
      if (words[ordinal] !== texts[index]) return { ...base, paragraph: line.index, stale: true, staleReason: 'text_changed' };
    }
    return { ...base, paragraph: line.index, stale: false };
  };

  const list = (chapterId: string): EditCuts => {
    const cuts = stored
      .filter((cut) => cut.chapterId === chapterId)
      .map(resolve)
      .sort((x, y) => x.a - y.a || (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
    return wireClone({ chapterId, cuts });
  };

  const change = (chapterId: string, changed: string[]): EditCutsChange => ({ ...list(chapterId), changed });

  const nextId = () => `cut${stored.reduce((highest, cut) => Math.max(highest, Number(cut.id.replace(/^cut/, '')) || 0), 0) + 1}`;

  return {
    editingCutsList: async (chapterId) => {
      await ready;
      return list(chapterId);
    },
    editingCutRecord: async (chapterId, request) => {
      await ready;
      checkRequest(request);
      const parsed = parseKeys(request.keys);
      if (!chapters().some((chapter) => chapter.id === chapterId)) throw new Error('that chapter is not in the manuscript');
      const line = lineOf(chapterId, request.pid);
      if (!line) throw new Error('that paragraph is not in this chapter');
      const words = wordsOf(line.text);
      const picked = parsed.map((key) => {
        if (key.paragraphId !== request.pid) throw new Error("a cut's words must all be in its paragraph");
        const text = words[key.ordinal];
        if (text === undefined) throw new Error('that word is past the end of its line');
        return { ordinal: key.ordinal, text };
      });
      picked.sort((x, y) => x.ordinal - y.ordinal);
      const takeId = request.takeId ?? '';
      const overlap = stored.find((cut) => cut.chapterId === chapterId && (cut.takeId ?? '') === takeId && request.a < cut.b && cut.a < request.b);
      if (overlap) throw new Error(`that audio overlaps cut ${overlap.id}, which is recorded already`);
      const id = nextId();
      const cut: Stored = {
        id,
        chapterId,
        pid: request.pid,
        ...(request.takeId ? { takeId: request.takeId } : {}),
        text: request.text,
        a: request.a,
        b: request.b,
        off0: request.off0,
        off1: request.off1,
        mode: request.mode,
        fadeMs: request.fadeMs,
        daw: request.daw,
        guid: request.guid,
        undoSteps: request.undoSteps,
        ...(request.backupId ? { backupId: request.backupId } : {}),
        at: new Date().toISOString(),
        ordinals: picked.map((word) => word.ordinal),
        texts: picked.map((word) => word.text),
      };
      stored = [...stored, cut];
      return change(chapterId, [id]);
    },
    editingCutRemove: async (chapterId, id) => {
      await ready;
      if (!id) throw new Error('choose a cut first');
      const before = stored.length;
      stored = stored.filter((cut) => cut.chapterId !== chapterId || cut.id !== id);
      return change(chapterId, stored.length < before ? [id] : []);
    },
  };
}
