// @vitest-environment node
// Audit cluster 14 (docs/research/ui-function-audit.md): the Script page keeps its Story Bible lists for as long as the app runs, so an entry edited in the
// Story Bible stayed old on Script until a job ended. Opening Script reads the lists it already holds again.
import { describe, expect, it, vi } from 'vitest';
import { createScriptData } from './scriptData';

function ports() {
  let name = 'Alice';
  const jobEnded = new Set<() => void>();
  const projectAttach = new Set<(attach: { attached: boolean }) => void>();
  const storyBible = {
    guideEntities: vi.fn(async () => [{ id: 'e1', canonical_name: name }]),
    guideTypes: vi.fn(async () => []),
    guideDialogueCuesIn: vi.fn(async (chapterIds: readonly string[]) =>
      chapterIds.filter((id) => id !== 'silent').map((chapterId) => ({ id: `cue-${chapterId}`, chapterId })),
    ),
  };
  const data = createScriptData({
    manuscript: { manuscriptChapters: async () => [], manuscriptParagraphs: async () => [] },
    marks: { marksList: async () => ({ marks: [] }) },
    scriptPrep: { scriptPrepList: async () => ({ chapters: [], words: [] }) },
    storyBible,
    system: {
      subscribeJobEnded: (listener: () => void) => {
        jobEnded.add(listener);
        return () => jobEnded.delete(listener);
      },
      subscribeProjectAttach: (listener: (attach: { attached: boolean }) => void) => {
        projectAttach.add(listener);
        return () => projectAttach.delete(listener);
      },
    },
  } as never);
  return {
    data,
    storyBible,
    rename: (next: string) => (name = next),
    endJob: () => jobEnded.forEach((listener) => listener()),
    attachProject: () => projectAttach.forEach((listener) => listener({ attached: true })),
  };
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

describe('the dialogue cues on Script', () => {
  const cueIds = (data: ReturnType<typeof ports>['data'], chapterId: string) => data.getState().cues[chapterId]?.value?.map((cue) => cue.id);
  const tick = () => new Promise<void>((resolve) => setTimeout(resolve));

  it('are asked for once for the chapters wanted in one tick, split by chapter, and a held chapter is not asked again', async () => {
    const { data, storyBible } = ports();
    data.ensureCues('a');
    data.ensureCues('silent');
    data.ensureCues('b');
    data.ensureCues('a');
    await tick();
    expect(storyBible.guideDialogueCuesIn.mock.calls).toEqual([[['a', 'silent', 'b']]]);
    expect(cueIds(data, 'a')).toEqual(['cue-a']);
    expect(cueIds(data, 'b')).toEqual(['cue-b']);
    // A chapter with no cues is held as read, so it is not asked for again either.
    expect(data.getState().cues.silent).toEqual({ status: 'ready', value: [] });

    data.ensureCues('a');
    data.ensureCues('silent');
    data.ensureCues('c');
    await tick();
    expect(storyBible.guideDialogueCuesIn.mock.calls.slice(1)).toEqual([[['c']]]);
  });

  it('are read again for the held chapters when Script opens, and not read when none are held', async () => {
    const { data, storyBible } = ports();
    data.start()();
    await tick();
    expect(storyBible.guideDialogueCuesIn).not.toHaveBeenCalled();

    await data.loadCues(['a', 'b']);
    const stop = data.start();
    await tick();
    expect(storyBible.guideDialogueCuesIn.mock.calls).toEqual([[['a', 'b']], [['a', 'b']]]);
    stop();
  });

  it('are asked for again, for exactly the held chapters, when a job ends and when the project changes', async () => {
    const { data, storyBible, endJob, attachProject } = ports();
    const stop = data.start();
    await data.loadCues(['a', 'b']);
    endJob();
    await tick();
    expect(storyBible.guideDialogueCuesIn.mock.calls.slice(1)).toEqual([[['a', 'b']]]);
    attachProject();
    // The old project's cues are off the page before the new project's arrive.
    expect(cueIds(data, 'a')).toBeUndefined();
    await tick();
    expect(storyBible.guideDialogueCuesIn.mock.calls.slice(2)).toEqual([[['a', 'b']]]);
    expect(cueIds(data, 'a')).toEqual(['cue-a']);
    stop();
  });

  it('drop an answer that arrives after the project changed', async () => {
    const { data, storyBible, attachProject } = ports();
    const stop = data.start();
    let answerOld: (cues: never[]) => void = () => undefined;
    storyBible.guideDialogueCuesIn.mockImplementationOnce(() => new Promise((resolve) => (answerOld = resolve)));
    const old = data.loadCues(['a']);
    attachProject();
    await tick();
    expect(cueIds(data, 'a')).toEqual(['cue-a']);
    answerOld([{ id: 'cue-of-the-old-project', chapterId: 'a' } as never]);
    await old;
    expect(cueIds(data, 'a')).toEqual(['cue-a']);
    stop();
  });
});
