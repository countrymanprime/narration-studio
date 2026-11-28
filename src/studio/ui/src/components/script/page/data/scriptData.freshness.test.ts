// @vitest-environment node
// Audit cluster 14 (docs/research/ui-function-audit.md): the Script page keeps its Story Bible lists for as long as the app runs, so an entry edited in the
// Story Bible stayed old on Script until a job ended. Opening Script reads the lists it already holds again.
import { describe, expect, it, vi } from 'vitest';
import { createScriptData, failedRead } from './scriptData';
import { chaptersOf } from '../../../../api/chaptersOf';

function ports() {
  let name = 'Alice';
  let epoch = 0;
  const jobEnded = new Set<() => void>();
  const projectAttach = new Set<(attach: { attached: boolean }) => void>();
  const storyBible = {
    guideEntities: vi.fn(async () => [{ id: 'e1', canonical_name: name }]),
    guideTypes: vi.fn(async () => []),
    guideDialogueCuesIn: vi.fn(async (chapterIds: readonly string[]) =>
      chapterIds.filter((id) => id !== 'silent').map((chapterId) => ({ id: `cue-${chapterId}`, chapterId })),
    ),
  };
  let gate: Promise<void> | null = null;
  const manuscript = {
    manuscriptChapters: async () => chaptersOf([]),
    manuscriptParagraphs: vi.fn(async (chapterId: string) => {
      await gate;
      return [{ id: `p-${chapterId}` }];
    }),
  };
  const data = createScriptData({
    generation: () => epoch,
    readChapters: async () => [],
    manuscript,
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
    manuscript,
    rename: (next: string) => (name = next),
    /** The store reset a project switch makes, with no page reading. */
    switchProject: () => (epoch += 1),
    /** Holds the answers of the paragraph reads started from now on until the returned function is called. */
    holdParagraphs: () => {
      let open!: () => void;
      gate = new Promise<void>((resolve) => (open = resolve));
      return () => {
        open();
        gate = null;
      };
    },
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

describe('a failed read of the dialogue cues (#3824)', () => {
  const SENTENCE = 'The dialogue cues could not be read.';
  const tick = () => new Promise<void>((resolve) => queueMicrotask(resolve));

  it('of a chapter drawn later is the failure while the chapters read before keep their cues, and Retry asks for that chapter alone', async () => {
    const { data, storyBible } = ports();
    await data.loadCues(['c1', 'c2']);
    expect(failedRead(data.getState())).toBe('');
    let refuse: (reason: Error) => void = () => {};
    storyBible.guideDialogueCuesIn.mockImplementationOnce(() => new Promise((_, reject) => (refuse = reject)));
    data.ensureCues('c3');
    await tick();
    // Its own sentence is not there while it is being read.
    expect(data.getState().cues.c3?.status).toBe('loading');
    expect(failedRead(data.getState())).toBe('');
    refuse(new Error(SENTENCE));
    await vi.waitFor(() => expect(failedRead(data.getState())).toBe(SENTENCE));
    expect(data.getState().cues.c1).toEqual({ status: 'ready', value: [{ id: 'cue-c1', chapterId: 'c1' }] });

    storyBible.guideDialogueCuesIn.mockClear();
    data.retryFailed();
    expect(storyBible.guideDialogueCuesIn.mock.calls).toEqual([[['c3']]]);
    await vi.waitFor(() => expect(data.getState().cues.c3?.status).toBe('ready'));
    expect(failedRead(data.getState())).toBe('');
  });

  it('is no longer the failure once a change to the cues reads them again and the host answers', async () => {
    const { data, storyBible } = ports();
    storyBible.guideDialogueCuesIn.mockRejectedValueOnce(new Error(SENTENCE));
    await data.loadCues(['c1']);
    expect(failedRead(data.getState())).toBe(SENTENCE);
    // What a command that changes the cues does after its write (scriptCommands.ts).
    await data.loadCues();
    expect(failedRead(data.getState())).toBe('');
    expect(data.getState().cues.c1?.status).toBe('ready');
  });

  it('a failed read is said while another read is still running', async () => {
    const { data, storyBible } = ports();
    storyBible.guideDialogueCuesIn.mockRejectedValueOnce(new Error(SENTENCE));
    storyBible.guideEntities.mockImplementationOnce(() => new Promise(() => {}));
    void data.load('entries');
    await data.loadCues(['c1']);
    expect(data.getState().entries?.status).toBe('loading');
    expect(failedRead(data.getState())).toBe(SENTENCE);

    // A Retry that never answers hides its own read's sentence (it is being read), not another read's.
    storyBible.guideTypes.mockRejectedValueOnce(new Error('The types could not be read.'));
    await data.load('types');
    storyBible.guideDialogueCuesIn.mockImplementationOnce(() => new Promise(() => {}));
    storyBible.guideTypes.mockRejectedValueOnce(new Error('The types could not be read.'));
    data.retryFailed();
    await vi.waitFor(() => expect(data.getState().types?.status).toBe('error'));
    expect(data.getState().cues.c1?.status).toBe('loading');
    expect(failedRead(data.getState())).toBe('The types could not be read.');
  });

  it("an older read's answer never replaces a newer one's", async () => {
    const { data, storyBible, manuscript } = ports();
    /** Starts a slow read that is refused by hand, then a newer one the host answers at once. */
    const overlap = async <T>(port: { mockImplementationOnce: (call: () => Promise<T>) => unknown }, load: () => Promise<void>) => {
      let refuse: (reason: Error) => void = () => {};
      port.mockImplementationOnce(() => new Promise<T>((_, reject) => (refuse = reject)));
      const older = load();
      await load();
      return { refuse: (reason: Error) => refuse(reason), older };
    };

    // An older failure after a newer success, for the cues, a list and a chapter's paragraphs.
    const cues = await overlap(storyBible.guideDialogueCuesIn as never, () => data.loadCues(['c1']));
    const entries = await overlap(storyBible.guideEntities as never, () => data.load('entries'));
    const paragraphs = await overlap(manuscript.manuscriptParagraphs as never, () => data.loadParagraphs('c1'));
    for (const read of [cues, entries, paragraphs]) {
      read.refuse(new Error('Too late.'));
      await read.older;
    }
    expect(failedRead(data.getState())).toBe('');
    expect(data.getState().cues.c1).toEqual({ status: 'ready', value: [{ id: 'cue-c1', chapterId: 'c1' }] });
    expect(data.getState().entries).toEqual({ status: 'ready', value: [{ id: 'e1', canonical_name: 'Alice' }] });
    expect(data.getState().paragraphs.c1).toEqual({ status: 'ready', value: [{ id: 'p-c1' }] });

    // An older success after a newer failure: the failure stands.
    const late = async <T>(port: ReturnType<typeof vi.fn>, load: () => Promise<void>, stale: T) => {
      let answer: (value: T) => void = () => {};
      port.mockImplementationOnce(() => new Promise<T>((resolve) => (answer = resolve)));
      port.mockImplementationOnce(() => Promise.reject(new Error(SENTENCE)));
      const older = load();
      await load();
      answer(stale);
      await older;
    };
    await late(storyBible.guideDialogueCuesIn, () => data.loadCues(['c1']), [{ id: 'stale', chapterId: 'c1' }]);
    await late(storyBible.guideEntities, () => data.load('entries'), [{ id: 'stale' }]);
    await late(manuscript.manuscriptParagraphs, () => data.loadParagraphs('c1'), [{ id: 'stale' }]);
    expect(data.getState().cues.c1?.status).toBe('error');
    expect(data.getState().entries?.status).toBe('error');
    expect(data.getState().paragraphs.c1?.status).toBe('error');
    expect(JSON.stringify(data.getState())).not.toContain('stale');
  });

  it("an older read of several chapters' cues still answers for the chapters no newer read asked for", async () => {
    const { data, storyBible } = ports();
    let answer: (cues: never[]) => void = () => {};
    storyBible.guideDialogueCuesIn.mockImplementationOnce(() => new Promise((resolve) => (answer = resolve)));
    const older = data.loadCues(['c1', 'c2']);
    await data.loadCues(['c2']);
    answer([
      { id: 'old-c1', chapterId: 'c1' },
      { id: 'old-c2', chapterId: 'c2' },
    ] as never[]);
    await older;
    expect(data.getState().cues.c1?.value).toEqual([{ id: 'old-c1', chapterId: 'c1' }]);
    expect(data.getState().cues.c2?.value).toEqual([{ id: 'cue-c2', chapterId: 'c2' }]);
  });

  it('a failure with no sentence is still said', async () => {
    for (const nothing of [new Error(''), new Error('   '), undefined, null, { code: 5 }, '']) {
      const { data, storyBible } = ports();
      storyBible.guideDialogueCuesIn.mockRejectedValueOnce(nothing);
      storyBible.guideEntities.mockRejectedValueOnce(nothing);
      await data.loadCues(['c1']);
      expect(failedRead(data.getState())).toBe('Part of this page could not be read. The host gave no reason.');
      await data.loadCues(['c1']);
      await data.load('entries');
      expect(failedRead(data.getState())).toBe('Part of this page could not be read. The host gave no reason.');
    }
  });

  it('with nothing failed, Retry asks the host for nothing', async () => {
    const { data, storyBible } = ports();
    await data.loadCues(['c1']);
    storyBible.guideDialogueCuesIn.mockClear();
    data.retryFailed();
    expect(storyBible.guideDialogueCuesIn).not.toHaveBeenCalled();
  });
});

describe('a project switch made while no Script page reads', () => {
  it("drops the cached chapters and paragraphs, so the next open reads the new project's", async () => {
    const { data, switchProject, manuscript } = ports();
    const leave = data.start();
    await data.load('chapters');
    await data.loadParagraphs('c1');
    expect(data.getState().chapters?.status).toBe('ready');
    expect(data.getState().paragraphs.c1?.status).toBe('ready');
    leave();

    switchProject();
    data.syncProject();
    expect(data.getState().chapters).toBeUndefined();
    expect(data.getState().paragraphs).toEqual({});
    data.ensureParagraphs('c1');
    await vi.waitFor(() => expect(manuscript.manuscriptParagraphs).toHaveBeenCalledTimes(2));
  });

  it('keeps what is held when the project did not change', async () => {
    const { data } = ports();
    const leave = data.start();
    await data.load('chapters');
    leave();
    data.syncProject();
    expect(data.getState().chapters?.status).toBe('ready');
  });

  it("never writes an old project's pending answer into the new project's cache", async () => {
    const { data, switchProject, holdParagraphs } = ports();
    const leave = data.start();
    const answer = holdParagraphs();
    void data.loadParagraphs('c1'); // project A's read, still out
    leave();
    switchProject();
    data.syncProject();
    answer();
    await vi.waitFor(() => expect(data.getState().paragraphs).toEqual({}));
    await Promise.resolve();
    expect(data.getState().paragraphs).toEqual({});
  });

  it("never sends the chapters queued for the old project to the new project's cue read", async () => {
    const { data, switchProject, storyBible } = ports();
    data.ensureCues('c1'); // queued for the end of the tick
    switchProject();
    data.syncProject();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(storyBible.guideDialogueCuesIn).not.toHaveBeenCalledWith(expect.arrayContaining(['c1']));
  });

  it('leaves a page that is reading alone: its own attach listener does the work', async () => {
    const { data, switchProject } = ports();
    const leave = data.start();
    await data.load('chapters');
    switchProject();
    data.syncProject();
    expect(data.getState().chapters?.status).toBe('ready');
    leave();
  });

  it('drops the chapters queued for the old project in the attach listener too', async () => {
    const { data, attachProject, holdParagraphs, storyBible } = ports();
    const leave = data.start();
    const answer = holdParagraphs();
    void data.loadParagraphs('c1');
    data.ensureCues('c2');
    attachProject();
    answer();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(storyBible.guideDialogueCuesIn).not.toHaveBeenCalledWith(expect.arrayContaining(['c2']));
    leave();
  });
});
