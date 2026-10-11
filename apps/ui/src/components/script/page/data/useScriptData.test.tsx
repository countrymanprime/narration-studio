// @vitest-environment jsdom
// The Script page's data layer over the browser mock (`createMockApi`) and over fakes that refuse: reads and their error
// state, the journalled commands and their inverses, prep announcements, words, speakers and Story Bible entries.
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { ApiProvider } from '../../../../api/ApiContext';
import type { JobEnded } from '../../../../api/contracts/system';
import { createMockApi } from '../../../../api/mockApi';
import { overlay } from '../../../../overlay/overlayService';
import { StudioProvider, useJournal } from '../../../../studio/StudioProvider';
import type { NarrationApi } from '../../../../types';
import { PREP_LABELS } from './scriptCommands';
import {
  useChapterFacts,
  useChapters,
  useDictionary,
  useEntries,
  useMarks,
  useParagraphs,
  useScriptCommands,
  useScriptPrep,
  useScriptView,
  useSpeakers,
} from './useScriptData';

let api: NarrationApi;
const jobEnded = new Set<(event: JobEnded) => void>();

/** The mock host, with the job-ended subscription caught so a test can end a job. */
function host(overrides: Partial<NarrationApi> = {}): NarrationApi {
  const base = createMockApi();
  return {
    ...base,
    subscribeJobEnded: (onEnded) => {
      jobEnded.add(onEnded);
      return () => void jobEnded.delete(onEnded);
    },
    ...overrides,
  };
}

const refusing = (sentence: string) => () => Promise.reject(new Error(sentence));

function setup() {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <ApiProvider api={api}>
      <StudioProvider>{children}</StudioProvider>
    </ApiProvider>
  );
  return renderHook(
    () => ({
      chapters: useChapters(),
      paragraphs: useParagraphs('chapter-1'),
      marks: useMarks(),
      prep: useScriptPrep(),
      entries: useEntries(),
      speakers: useSpeakers(),
      facts: useChapterFacts(),
      commands: useScriptCommands(),
      journal: useJournal(),
      view: useScriptView((s) => s.tab),
      lookup: useDictionary(),
    }),
    { wrapper },
  );
}

type Hook = ReturnType<typeof setup>;
const ready = async (hook: Hook) =>
  waitFor(() => {
    const r = hook.result.current;
    expect([r.chapters, r.paragraphs, r.marks, r.prep, r.entries, r.speakers].every((v) => v.status === 'ready')).toBe(true);
  });

const lastEntry = async (hook: Hook) => (await hook.result.current.journal.entries())[0];
const undoLast = (hook: Hook) => act(async () => void (await hook.result.current.journal.undoLast()));

let toast: MockInstance<typeof overlay.toast>;
let announce: MockInstance<typeof overlay.announce>;
let toastUndo: MockInstance<typeof overlay.toastUndo>;
beforeEach(() => {
  jobEnded.clear();
  api = host();
  toast = vi.spyOn(overlay, 'toast').mockImplementation(() => undefined);
  announce = vi.spyOn(overlay, 'announce').mockImplementation(() => undefined);
  toastUndo = vi.spyOn(overlay, 'toastUndo').mockImplementation(() => undefined);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/** The first line of chapter 1 with a range at its start. */
async function range(paragraph = 0, length = 5) {
  const line = (await api.manuscriptParagraphs('chapter-1'))[paragraph]!;
  return { chapterId: line.chapterId, paragraphId: line.id, start: 0, end: length, quote: line.text.slice(0, length) };
}

describe('chapters-and-paragraphs-load-once-and-follow-a-change', () => {
  it('reads each once, caches per chapter and reads again when a job ends', async () => {
    const chapters = vi.spyOn(api, 'manuscriptChapters');
    const paragraphs = vi.spyOn(api, 'manuscriptParagraphs');
    const hook = setup();
    await ready(hook);
    const second = renderHook(() => useParagraphs('chapter-1'), {
      wrapper: ({ children }) => (
        <ApiProvider api={api}>
          <StudioProvider>{children}</StudioProvider>
        </ApiProvider>
      ),
    });
    expect(second.result.current.value).toBe(hook.result.current.paragraphs.value);
    expect(chapters).toHaveBeenCalledTimes(1);
    expect(paragraphs).toHaveBeenCalledTimes(1);
    expect(hook.result.current.chapters.value?.[0]?.id).toBe('chapter-1');

    act(() => jobEnded.forEach((onEnded) => onEnded({ id: 'j', kind: 'manuscript_import', outcome: 'success', message: '', durationMs: 1 })));
    await waitFor(() => expect(paragraphs).toHaveBeenCalledTimes(2));
    // The shell's own chapter slot reads on a job end too, so only a second read is asserted.
    expect(chapters.mock.calls.length).toBeGreaterThan(1);
    await ready(hook);
  });

  it('a mark reads the marks again', async () => {
    const list = vi.spyOn(api, 'marksList');
    const hook = setup();
    await ready(hook);
    await act(async () => void (await hook.result.current.commands.addMark(await range(), 'stress', '')));
    expect(list).toHaveBeenCalledTimes(2);
    expect(hook.result.current.marks.marks).toHaveLength(1);
  });

  it('a failed read is a state with the host sentence and Retry, not a throw', async () => {
    let fail = true;
    const base = host();
    api = { ...base, manuscriptChapters: () => (fail ? Promise.reject(new Error('The manuscript could not be read.')) : base.manuscriptChapters()) };
    const hook = setup();
    await waitFor(() => expect(hook.result.current.chapters.status).toBe('error'));
    expect(hook.result.current.chapters.message).toBe('The manuscript could not be read.');
    fail = false;
    act(() => hook.result.current.chapters.retry());
    await waitFor(() => expect(hook.result.current.chapters.status).toBe('ready'));
    expect(hook.result.current.chapters.message).toBe('');
  });
});

describe('marks-and-threads-are-journalled', () => {
  async function withQuery(hook: Hook) {
    await ready(hook);
    let id = '';
    await act(async () => void (id = (await hook.result.current.commands.addMark(await range(), 'ask', 'Which spelling?'))!.id));
    return id;
  }
  const markOf = (hook: Hook, id: string) => hook.result.current.marks.marks.find((m) => m.id === id);

  it('add and remove each journal with their inverse', async () => {
    const hook = setup();
    await ready(hook);
    await act(async () => void (await hook.result.current.commands.addMark(await range(), 'stress', 'lean on this')));
    expect(hook.result.current.marks.marks[0]).toMatchObject({ type: 'stress', text: 'lean on this' });
    expect(toast).toHaveBeenCalledWith(`Marked “${(await range()).quote}” as Word stress.`);
    expect((await lastEntry(hook))?.label).toBe('Added a mark');
    await undoLast(hook);
    expect(hook.result.current.marks.marks).toEqual([]);

    const id = await withQuery(hook);
    expect(toast).toHaveBeenCalledWith('Query saved. Track the reply in the Queries tab.');
    await act(async () => void (await hook.result.current.commands.reply(id, 'author', 'This one.')));
    await act(async () => void (await hook.result.current.commands.removeMark(id)));
    expect(hook.result.current.marks.marks).toEqual([]);
    await undoLast(hook);
    expect(hook.result.current.marks.marks[0]).toMatchObject({ type: 'ask', text: 'Which spelling?', thread: [{ who: 'author', text: 'This one.' }] });
  });

  it('a query needs its question, and journals nothing without it', async () => {
    const hook = setup();
    await ready(hook);
    await act(async () => void (await hook.result.current.commands.addMark(await range(), 'ask', '  ')));
    expect(toast).toHaveBeenCalledWith('Write the query first.', { tone: 'error' });
    expect(await hook.result.current.journal.entries()).toEqual([]);
  });

  it('change type keeps the thread and the status; undo changes it back', async () => {
    const hook = setup();
    const id = await withQuery(hook);
    await act(async () => void (await hook.result.current.commands.reply(id, 'author', 'This one.')));
    await act(async () => void (await hook.result.current.commands.setStatus(id, 'resolved')));
    let changed = '';
    await act(async () => void (changed = (await hook.result.current.commands.setMarkType(id, 'stress'))!.id));
    expect(markOf(hook, id)).toBeUndefined();
    expect(markOf(hook, changed)).toMatchObject({ type: 'stress', text: 'Which spelling?', thread: [{ text: 'This one.' }] });
    expect(markOf(hook, changed)?.status).toBeUndefined();
    await undoLast(hook);
    expect(hook.result.current.marks.marks).toHaveLength(1);
    expect(hook.result.current.marks.marks[0]).toMatchObject({ type: 'ask', status: 'resolved', thread: [{ text: 'This one.' }] });
  });

  it('reply, edit, delete (with Undo offered), resolve and reopen each undo', async () => {
    const hook = setup();
    const id = await withQuery(hook);
    const run = (fn: () => Promise<unknown>) => act(async () => void (await fn()));

    await run(() => hook.result.current.commands.reply(id, 'author', 'They meant the animals.'));
    expect(markOf(hook, id)?.thread.at(-1)).toMatchObject({ who: 'author', text: 'They meant the animals.' });
    await undoLast(hook);
    expect(markOf(hook, id)?.thread).toEqual([]);

    await run(() => hook.result.current.commands.reply(id, 'author', 'First.'));
    await run(() => hook.result.current.commands.editMessage(id, 0, 'Changed wording'));
    expect(markOf(hook, id)?.thread[0]?.text).toBe('Changed wording');
    await undoLast(hook);
    expect(markOf(hook, id)?.thread[0]?.text).toBe('First.');

    await run(() => hook.result.current.commands.deleteMessage(id, 0));
    expect(markOf(hook, id)?.thread).toEqual([]);
    expect(toastUndo).toHaveBeenCalledWith('Message deleted.', expect.any(Function));
    const offer = toastUndo.mock.calls[0]![1];
    await act(async () => expect(await offer()).toEqual({ ok: true }));
    await waitFor(() => expect(markOf(hook, id)?.thread[0]?.text).toBe('First.'));

    await run(() => hook.result.current.commands.resolve(id, 'you', ''));
    expect(markOf(hook, id)?.status).toBe('resolved');
    expect(toast).toHaveBeenCalledWith('Query resolved.');
    expect((await lastEntry(hook))?.label).toBe('Resolved a query');
    await undoLast(hook);
    expect(markOf(hook, id)?.status).toBe('open');
    await run(() => hook.result.current.commands.setStatus(id, 'resolved'));
    await run(() => hook.result.current.commands.setStatus(id, 'open'));
    expect((await lastEntry(hook))?.label).toBe('Reopened a query');
  });

  it('the opening message is edited by a replacement that undo reverses', async () => {
    const hook = setup();
    const id = await withQuery(hook);
    let ok = false;
    await act(async () => void (ok = await hook.result.current.commands.editMessage(id, -1, 'Which one?')));
    expect(ok).toBe(true);
    expect(hook.result.current.marks.marks[0]).toMatchObject({ text: 'Which one?', status: 'open' });
    await undoLast(hook);
    expect(hook.result.current.marks.marks[0]).toMatchObject({ text: 'Which spelling?' });
  });

  it('a refusal is the host sentence in a toast and journals nothing', async () => {
    api = host({ marksReply: refusing('a message needs its text'), marksSetStatus: refusing('only a query has a status') });
    const hook = setup();
    const id = await withQuery(hook);
    const before = await hook.result.current.journal.entries();
    await act(async () => void (await hook.result.current.commands.reply(id, 'you', '')));
    await act(async () => void (await hook.result.current.commands.setStatus(id, 'resolved')));
    expect(toast).toHaveBeenCalledWith('a message needs its text', { tone: 'error' });
    expect(toast).toHaveBeenCalledWith('only a query has a status', { tone: 'error' });
    expect(await hook.result.current.journal.entries()).toEqual(before);
  });
});

describe('prep-state-is-journalled-and-announced', () => {
  it('sets, steps within the ends, announces "{chapter}: {state}" and undoes to the earlier state', async () => {
    const hook = setup();
    await ready(hook);
    const chapter = hook.result.current.chapters.value![0]!;
    await act(async () => void (await hook.result.current.commands.setPrep(chapter, 'prepped')));
    expect(hook.result.current.prep.prepOf(chapter.id)).toBe('prepped');
    expect(announce).toHaveBeenLastCalledWith(`${chapter.title}: ${PREP_LABELS.prepped}`);
    expect((await lastEntry(hook))?.label).toBe(`${chapter.title}: Prepped`);
    await undoLast(hook);
    expect(hook.result.current.prep.prepOf(chapter.id)).toBe('none');
    expect(announce).toHaveBeenLastCalledWith(`${chapter.title}: Not started`);

    const step = (delta: number) => act(async () => void (await hook.result.current.commands.stepPrep(chapter, delta)));
    const entries = (await hook.result.current.journal.entries()).length;
    await step(-1);
    expect(await hook.result.current.journal.entries()).toHaveLength(entries);
    await step(1);
    expect(hook.result.current.prep.prepOf(chapter.id)).toBe('progress');
    await step(1);
    await step(1);
    expect(hook.result.current.prep.prepOf(chapter.id)).toBe('prepped');
    await step(-1);
    expect(hook.result.current.prep.prepOf(chapter.id)).toBe('progress');
  });
});

describe('words-follow-the-mock', () => {
  it('flag, say and unflag map to the three word calls with the host status; typing records manual', async () => {
    const say = vi.spyOn(api, 'scriptWordSay');
    const hook = setup();
    await ready(hook);
    const r = await range(0, 5);
    let word = '';
    await act(async () => void (word = (await hook.result.current.commands.flagWord(r))!.word));
    expect(hook.result.current.prep.pronStatus(word)).toBe('not_set');
    await act(async () => void (await hook.result.current.commands.flagWord(r)));
    expect(await hook.result.current.journal.entries()).toHaveLength(1);

    await act(async () => void (await hook.result.current.commands.saveSay(word, 'uh-LIS')));
    expect(say).toHaveBeenLastCalledWith(word, 'uh-LIS', 'manual');
    expect(hook.result.current.prep.pronStatus(word)).toBe('set');
    expect(hook.result.current.prep.pronOfWord(word)).toEqual({ say: 'uh-LIS', source: 'manual' });
    await act(async () => void (await hook.result.current.commands.saveSay(word, 'uh-lees', 'cmu')));
    expect(hook.result.current.prep.pronOfWord(word)).toEqual({ say: 'uh-lees', source: 'cmu' });
    await undoLast(hook);
    expect(hook.result.current.prep.pronOfWord(word).say).toBe('uh-LIS');

    const flagId = hook.result.current.prep.words.find((w) => w.word === word)!.flags[0]!.id;
    await act(async () => void (await hook.result.current.commands.unflagWord(flagId)));
    expect(hook.result.current.prep.pronStatus(word)).toBe('not_flagged');
    await undoLast(hook);
    expect(hook.result.current.prep.pronStatus(word)).toBe('set');
    expect(hook.result.current.prep.wordsInChapter('chapter-1').map((w) => w.word)).toEqual([word]);
  });
});

describe('confirm-a-speaker', () => {
  it('corrects the cue as a journal entry whose undo restores the earlier speaker, and reads the Story Bible again', async () => {
    const entities = vi.spyOn(api, 'guideEntities');
    const correct = vi.spyOn(api, 'guideCorrectCue');
    const hook = setup();
    await ready(hook);
    const line = { id: 'p-3', chapterId: 'chapter-1' };
    const [before] = hook.result.current.speakers.phrasesOf(line);
    expect(before?.state).toBe('suggested');
    const other = hook.result.current.speakers.candidates.find((e) => e.id !== before?.speaker?.id)!;
    await act(async () => void (await hook.result.current.commands.confirmSpeaker(before!.cueId, other.id)));
    expect(hook.result.current.speakers.phrasesOf(line)[0]).toMatchObject({ state: 'confirmed', speaker: { id: other.id } });
    expect(entities).toHaveBeenCalledTimes(2);
    await undoLast(hook);
    expect(correct).toHaveBeenLastCalledWith(before!.cueId, before!.speaker!.id);
    expect(hook.result.current.speakers.phrasesOf(line)[0]?.speaker?.id).toBe(before!.speaker!.id);
    expect(hook.result.current.speakers.unattributed('chapter-6')).toBe(1);
    expect(hook.result.current.facts('chapter-6')).toBe('0 marks · 0 open queries · 0 without pronunciation · 1 without a speaker');
  });
});

describe('entities-and-mentions', () => {
  it('reads the entries once and offers the lookups', async () => {
    const entities = vi.spyOn(api, 'guideEntities');
    const hook = setup();
    await ready(hook);
    const queen = hook.result.current.entries.entryById('queen-of-hearts')!;
    expect(queen.canonical_name).toBe('Queen of Hearts');
    expect(hook.result.current.entries.findEntries('queen', 'All')).toContain(queen);
    expect(hook.result.current.entries.mentionsIn({ text: 'Off went the queen of hearts.' })).toMatchObject([{ entryId: queen.id, start: 13 }]);
    const lines = hook.result.current.paragraphs.value!;
    expect(hook.result.current.entries.entriesInChapter(lines).length).toBeGreaterThan(0);
    expect(entities).toHaveBeenCalledTimes(1);
  });

  it('an entry from a selection is journalled with a delete inverse; an existing name journals nothing', async () => {
    const hook = setup();
    await ready(hook);
    let id: string | null = null;
    await act(async () => void (id = await hook.result.current.commands.createEntryFrom('Character', ' Mock Turtle ')));
    expect(hook.result.current.entries.entryById(id)).toMatchObject({ canonical_name: 'Mock Turtle', category: 'Character' });
    expect(toast).toHaveBeenCalledWith('Added “Mock Turtle” to the Story Bible as character.');
    await undoLast(hook);
    expect(hook.result.current.entries.entryById(id)).toBeUndefined();

    const entries = (await hook.result.current.journal.entries()).length;
    await act(async () => void (id = await hook.result.current.commands.createEntryFrom('Character', 'queen of hearts')));
    expect(id).toBe('queen-of-hearts');
    expect(toast).toHaveBeenCalledWith('Linked “queen of hearts” to Queen of Hearts.');
    expect(await hook.result.current.journal.entries()).toHaveLength(entries);
  });

  it('a refused create is the host sentence and journals nothing', async () => {
    api = host({ guideCreate: refusing('The Story Bible is being rebuilt.') });
    const hook = setup();
    await ready(hook);
    await act(async () => void (await hook.result.current.commands.createEntryFrom('Character', 'Gryphon')));
    expect(toast).toHaveBeenCalledWith('The Story Bible is being rebuilt.', { tone: 'error' });
    expect(await hook.result.current.journal.entries()).toEqual([]);
  });
});

describe('contract-kit', () => {
  it('every read refusing leaves an error state per list, never a throw', async () => {
    const no = refusing('The project folder could not be read.');
    api = host({ manuscriptChapters: no, manuscriptParagraphs: no, marksList: no, scriptPrepList: no, guideEntities: no, guideDialogueCues: no });
    const hook = setup();
    await waitFor(() => {
      const r = hook.result.current;
      expect([r.chapters, r.paragraphs, r.marks, r.prep, r.entries, r.speakers].map((v) => v.status)).toEqual(Array(6).fill('error'));
    });
    expect(hook.result.current.marks.message).toBe('The project folder could not be read.');
    expect(hook.result.current.facts('chapter-1')).toBe('0 marks · 0 open queries · 0 without pronunciation');
  });

  it('every command refusing is a toast and an empty journal', async () => {
    const no = refusing('No.');
    api = host({ marksAdd: no, scriptPrepSetChapter: no, scriptWordFlag: no, guideCorrectCue: no });
    const hook = setup();
    await ready(hook);
    const c = hook.result.current.commands;
    await act(async () => {
      expect(await c.addMark(await range(), 'stress', '')).toBeNull();
      expect(await c.setPrep(hook.result.current.chapters.value![0]!, 'prepped')).toBe(false);
      expect(await c.flagWord(await range())).toBeNull();
      expect(await c.confirmSpeaker('cue-1', 'alice')).toBe(false);
    });
    expect(toast.mock.calls.filter(([text]) => text === 'No.')).toHaveLength(4);
    expect(announce).not.toHaveBeenCalled();
    expect(await hook.result.current.journal.entries()).toEqual([]);
  });

  it('the dictionary answers the host or its sentence', async () => {
    const hook = setup();
    await ready(hook);
    const found = await hook.result.current.lookup('rabbit');
    expect(found.ok).toBe(true);
    api = host({ systemLookup: refusing('Look up one word at a time.') });
    const refused = setup();
    expect(await refused.result.current.lookup('two words')).toEqual({ ok: false, message: 'Look up one word at a time.' });
  });

  it('the view state is shared by every reader of the same host', async () => {
    const hook = setup();
    expect(hook.result.current.view[0]).toBe('pron');
    act(() => hook.result.current.view[1]({ tab: 'queries' }));
    expect(hook.result.current.view[0]).toBe('queries');
  });
});
