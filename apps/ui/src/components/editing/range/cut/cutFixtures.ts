import type { EditCut, EditCutRequest, EditCutsApi } from '../../../../api/contracts/editCuts';
import type { RangeLocator } from '../common/locate';

/** The tokens of `marksDoc`'s chapter: p-1's words are tokens 0 to 8, p-2's start at 100; a word said and not in the script has none. */
export const locator: RangeLocator = {
  token: (key) => {
    const m = /^p-(\d):(\d+)$/.exec(key);
    return m ? (Number(m[1]) - 1) * 100 + Number(m[2]) : undefined;
  },
  source: (at) => ({ itemGuid: '{item-1}', sourceTime: at }),
  place: () => 'track “Chapter 1”',
};

/** An in-memory Editing records log for the cuts: records what it is sent, in time order, and forgets by id. */
export function fakeCutLog(): Pick<EditCutsApi, 'editingCutRecord' | 'editingCutRemove' | 'editingCutsList'> & { cuts: EditCut[] } {
  const self = {
    cuts: [] as EditCut[],
    next: 0,
    change(chapterId: string, changed: string[]) {
      self.cuts.sort((x, y) => x.a - y.a);
      return Promise.resolve({ chapterId, cuts: self.cuts.map((c) => ({ ...c })), changed });
    },
    editingCutsList: (chapterId: string) => Promise.resolve({ chapterId, cuts: self.cuts.map((c) => ({ ...c })) }),
    editingCutRecord(chapterId: string, cut: EditCutRequest) {
      const id = `cut${++self.next}`;
      self.cuts.push({ ...cut, id, chapterId, words: cut.keys.map(() => ''), at: '2026-10-12T00:00:00Z', paragraph: 0, stale: false });
      return self.change(chapterId, [id]);
    },
    editingCutRemove(chapterId: string, id: string) {
      self.cuts = self.cuts.filter((c) => c.id !== id);
      return self.change(chapterId, [id]);
    },
  };
  return self;
}
