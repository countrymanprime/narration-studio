// The browser mock's passage map. It keeps the runs in memory and checks them the way apps/desktop/internal/passagemap
// does: a run is a start, any rolls and a stop in time order, each on a paragraph of the chapter at a word from 0 to the
// paragraph's word count; a run that breaks a rule is refused and nothing is kept. The mock has no DAW, so it stamps the
// built-in recorder's way: one take name for the item and every take. A mark whose paragraph is gone or whose word is past
// its end comes back stale, never moved.
import { PASSAGE_MAP_MAX_ID, PASSAGE_MAP_MAX_MARKS, PASSAGE_MAP_MAX_SECONDS } from './contracts/passageMap';
import type { ManuscriptChapter, ManuscriptParagraph, PassageMapApi, PassageMark, PassagePlace } from '../types';
import { wireClone } from './mockFixtures';

type Stored = Omit<PassageMark, 'stale' | 'staleReason'>;

const wordsIn = (text: string) => (text.match(/\S+/g) ?? []).length;

// eslint-disable-next-line no-control-regex -- the point is to find control characters
const controlCharacters = /[\u0000-\u001f\u007f-\u009f]/;
const idOk = (id: string) => id !== '' && new TextEncoder().encode(id).length <= PASSAGE_MAP_MAX_ID && !controlCharacters.test(id);

export function createPassageMapMock(ready: Promise<unknown>, chapters: () => ManuscriptChapter[], paragraphs: () => ManuscriptParagraph[]): PassageMapApi {
  let stored: Stored[] = [];
  let takes = 0;

  const wordsOf = (chapterId: string) =>
    new Map(
      paragraphs()
        .filter((paragraph) => paragraph.chapterId === chapterId)
        .map((paragraph) => [paragraph.id, wordsIn(paragraph.text)]),
    );

  const resolve = (mark: Stored): PassageMark => {
    const words = wordsOf(mark.chapterId);
    let stale: PassageMark['staleReason'];
    for (const place of [{ pid: mark.pid, word: mark.word }, ...(mark.prev ? [mark.prev] : [])]) {
      const count = words.get(place.pid);
      if (count === undefined) return { ...mark, stale: true, staleReason: 'paragraph_missing' };
      if (place.word > count) stale = 'word_out_of_range';
    }
    return stale ? { ...mark, stale: true, staleReason: stale } : { ...mark, stale: false };
  };

  const checkPlace = (words: Map<string, number>, place: PassagePlace) => {
    const count = words.get(place.pid);
    if (count === undefined) throw new Error('that paragraph is not in this chapter');
    if (!Number.isInteger(place.word) || place.word < 0 || place.word > count) throw new Error('that word is not in the paragraph');
  };

  return {
    passageMapRecordRun: async (chapterId, run) => {
      await ready;
      if (!idOk(chapterId)) throw new Error(`a chapter id is at most ${PASSAGE_MAP_MAX_ID} characters, with no control characters`);
      if (run.length > PASSAGE_MAP_MAX_MARKS) throw new Error(`a recording's passage map holds at most ${PASSAGE_MAP_MAX_MARKS} marks`);
      if (run.length < 2) throw new Error("a recording's passage map needs a start and a stop");
      if (run.some((mark) => !idOk(mark.pid) || (mark.prev && !idOk(mark.prev.pid)))) {
        throw new Error(`a paragraph id is at most ${PASSAGE_MAP_MAX_ID} characters, with no control characters`);
      }
      if (!chapters().some((chapter) => chapter.id === chapterId)) throw new Error('that chapter is not in the manuscript');
      const words = wordsOf(chapterId);
      let last = 0;
      run.forEach((mark, index) => {
        if (index === 0 && mark.kind !== 'start') throw new Error("a recording's passage map begins with a start");
        if (index === run.length - 1 && mark.kind !== 'stop') throw new Error("a recording's passage map ends with a stop");
        if (index > 0 && index < run.length - 1 && mark.kind !== 'roll') throw new Error('between the start and the stop, every mark is a roll');
        if (mark.kind === 'start' && mark.prev) throw new Error('a start mark has no take before it');
        if (mark.kind !== 'start' && !mark.prev) throw new Error('a roll or a stop says where the take before it ended');
        checkPlace(words, mark);
        if (mark.prev) checkPlace(words, mark.prev);
        if (!Number.isFinite(mark.sec) || mark.sec < 0 || mark.sec > PASSAGE_MAP_MAX_SECONDS) {
          throw new Error(`a mark's seconds are a number from 0 to ${PASSAGE_MAP_MAX_SECONDS}`);
        }
        if (mark.sec < last) throw new Error("a recording's marks are in time order");
        last = mark.sec;
      });
      const runs = new Set(stored.filter((mark) => mark.chapterId === chapterId).map((mark) => mark.run));
      const runId = `${chapterId}.${runs.size + 1}`;
      const take = `Take ${String(++takes).padStart(3, '0')}`;
      const marks: Stored[] = run.map((mark, index) => ({
        id: `${runId}.${index}`,
        run: runId,
        chapterId,
        pid: mark.pid,
        word: mark.word,
        sec: mark.sec,
        kind: mark.kind,
        ...(mark.prev ? { prev: { pid: mark.prev.pid, word: mark.prev.word } } : {}),
        itemGuid: take,
        takeGuid: take,
      }));
      stored = [...stored, ...marks];
      return wireClone(marks.map(resolve));
    },
    passageMapList: async (chapterId) => {
      await ready;
      return wireClone(stored.filter((mark) => mark.chapterId === chapterId).map(resolve));
    },
  };
}
