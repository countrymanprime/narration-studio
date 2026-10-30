// @vitest-environment node
// Audit cluster 14 (docs/research/ui-function-audit.md): the Script page keeps its Story Bible lists for as long as the app runs, so an entry edited in the
// Story Bible stayed old on Script until a job ended. Opening Script reads the lists it already holds again.
import { describe, expect, it, vi } from 'vitest';
import { createScriptData } from './scriptData';

function ports() {
  let name = 'Alice';
  const unsubscribe = () => undefined;
  const storyBible = {
    guideEntities: vi.fn(async () => [{ id: 'e1', canonical_name: name }]),
    guideTypes: vi.fn(async () => []),
    guideDialogueCues: vi.fn(async () => []),
  };
  const data = createScriptData({
    manuscript: { manuscriptChapters: async () => [], manuscriptParagraphs: async () => [] },
    marks: { marksList: async () => ({ marks: [] }) },
    scriptPrep: { scriptPrepList: async () => ({ chapters: [], words: [] }) },
    storyBible,
    system: { subscribeJobEnded: () => unsubscribe, subscribeProjectAttach: () => unsubscribe },
  } as never);
  return { data, storyBible, rename: (next: string) => (name = next) };
}

const names = (data: ReturnType<typeof ports>['data']) =>
  (data.getState().entries?.value as Array<{ canonical_name: string }> | undefined)?.map((e) => e.canonical_name);

describe('the Story Bible lists on Script', () => {
  it('are read again when Script opens, so an edit made in the Story Bible shows without a job ending', async () => {
    const { data, rename } = ports();
    const leave = data.start();
    await data.load('entries');
    expect(names(data)).toEqual(['Alice']);
    leave();

    rename('Alice Liddell'); // edited in the Story Bible while Script was not open
    const stop = data.start();
    await vi.waitFor(() => expect(names(data)).toEqual(['Alice Liddell']));
    stop();
  });

  it('reads only what was loaded, and a second reader of the same open page does not read again', async () => {
    const { data, storyBible } = ports();
    const first = data.start();
    expect(storyBible.guideTypes).not.toHaveBeenCalled();
    await data.load('entries');
    const second = data.start();
    await Promise.resolve();
    expect(storyBible.guideEntities).toHaveBeenCalledTimes(1);
    first();
    second();
  });
});
