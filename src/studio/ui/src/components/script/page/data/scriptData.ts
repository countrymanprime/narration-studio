// The Script page's read cache: the chapter list, each chapter's paragraphs and dialogue cues, the marks, the prep record and the Story
// Bible's entries and types, each read once through its port and kept until something says it changed. The cues are read for the
// chapters the reader draws, never for the whole book. A failed read is
// a state holding the host's sentence, never a throw, and a reload keeps the last value on show while it runs. When a job ends
// (an import, a Story Bible build) everything loaded is read again; a project switch drops the old answers and reads the same
// lists for the new project. The hooks in
// `useScriptData.ts` own one cache per host and are the only readers.

import type { ManuscriptApi, ManuscriptChapter, ManuscriptParagraph } from '../../../../api/contracts/manuscript';
import type { Marks, MarksApi } from '../../../../api/contracts/marks';
import type { ScriptPrep, ScriptPrepApi } from '../../../../api/contracts/scriptPrep';
import type { GuideDialogueCue, GuideEntity, GuideType, StoryBibleApi } from '../../../../api/contracts/storyBible';
import type { SystemApi } from '../../../../api/contracts/system';
import { apiErrorMessage } from '../../../../api/errorMessage';

export type ScriptPorts = {
  manuscript: Pick<ManuscriptApi, 'manuscriptChapters' | 'manuscriptParagraphs'>;
  marks: Pick<MarksApi, 'marksList'>;
  scriptPrep: Pick<ScriptPrepApi, 'scriptPrepList'>;
  storyBible: Pick<StoryBibleApi, 'guideEntities' | 'guideTypes' | 'guideDialogueCuesIn'>;
  system: Pick<SystemApi, 'subscribeJobEnded' | 'subscribeProjectAttach'>;
  /** Says a name's pronunciation changed, on this page or another, or was undone from History: the Story Bible is the one store of
   * pronunciations (#2595), so its entries are read again. */
  pronunciation?: { subscribe: (listener: () => void) => () => void };
};

/** One read: loading (with the last value while a reload runs), ready, or failed with the host's sentence. */
export type Loadable<T> = { status: 'loading'; value?: T } | { status: 'ready'; value: T } | { status: 'error'; message: string; value?: T };

/** The lists read once for the whole page. */
export type ScriptList = 'chapters' | 'marks' | 'prep' | 'entries' | 'types';

export type ScriptDataState = {
  chapters?: Loadable<ManuscriptChapter[]>;
  marks?: Loadable<Marks>;
  prep?: Loadable<ScriptPrep>;
  entries?: Loadable<GuideEntity[]>;
  /** The Story Bible's types: which of them speak and their colours (SN-B95). */
  types?: Loadable<GuideType[]>;
  /** The dialogue cues of each chapter asked for; a chapter with none holds an empty list. */
  cues: Readonly<Record<string, Loadable<GuideDialogueCue[]>>>;
  paragraphs: Readonly<Record<string, Loadable<ManuscriptParagraph[]>>>;
};

export type ScriptData = {
  getState(): ScriptDataState;
  subscribe(listener: () => void): () => void;
  /** Reads a list now; resolves when the answer (or the failure) is in the state. */
  load(list: ScriptList): Promise<void>;
  /** Reads a chapter's paragraphs now. */
  loadParagraphs(chapterId: string): Promise<void>;
  /** Reads a list unless it is loaded or loading. */
  ensure(list: ScriptList): void;
  ensureParagraphs(chapterId: string): void;
  /** Reads the cues of these chapters (every chapter held, when none are named) in one call. */
  loadCues(chapterIds?: readonly string[]): Promise<void>;
  /** Reads a chapter's cues unless they are held or asked for; the chapters asked in one tick share one call. */
  ensureCues(chapterId: string): void;
  /** Reads again every read that failed: the lists, the chapters' paragraphs, and the cues of the chapters whose read failed in one call. */
  retryFailed(): void;
  /** Wires the host's job and project events while a page reads; returns the stop function. Counted, so several readers share one wiring. */
  start(): () => void;
};

const LISTS: readonly ScriptList[] = ['chapters', 'marks', 'prep', 'entries', 'types'];

/**
 * The host's sentence of a read that failed, or nothing when none did. Nothing while a read runs: it may be the retry, and a read that
 * fails after it is said again even in the same words.
 */
export function failedRead(state: ScriptDataState): string {
  const reads = [...LISTS.map((list) => state[list]), ...Object.values(state.cues), ...Object.values(state.paragraphs)];
  if (reads.some((read) => read?.status === 'loading')) return '';
  const failed = reads.find((read) => read?.status === 'error');
  return failed?.status === 'error' ? failed.message : '';
}

const failedIn = (reads: Readonly<Record<string, Loadable<unknown>>>) => Object.keys(reads).filter((id) => reads[id].status === 'error');

/** The lists the Story Bible page also edits. */
const STORY_BIBLE_LISTS: readonly ScriptList[] = ['entries', 'types'];

export function createScriptData(ports: ScriptPorts): ScriptData {
  let state: ScriptDataState = { cues: {}, paragraphs: {} };
  /** Bumped by a project switch, so an answer for the old project is dropped. */
  let generation = 0;
  const listeners = new Set<() => void>();
  const set = (next: ScriptDataState) => {
    state = next;
    listeners.forEach((listener) => listener());
  };

  const readers: { [L in ScriptList]: () => Promise<NonNullable<ScriptDataState[L]> extends Loadable<infer T> ? T : never> } = {
    chapters: () => ports.manuscript.manuscriptChapters(),
    marks: () => ports.marks.marksList(),
    prep: () => ports.scriptPrep.scriptPrepList(),
    entries: () => ports.storyBible.guideEntities(),
    types: () => ports.storyBible.guideTypes(),
  };

  /** Runs one read into the state through `put`, keeping the last value while it runs. */
  async function read<T>(current: Loadable<T> | undefined, put: (value: Loadable<T>) => void, call: () => Promise<T>): Promise<void> {
    const at = generation;
    put({ status: 'loading', value: current?.value });
    try {
      const value = await call();
      if (at === generation) put({ status: 'ready', value });
    } catch (error) {
      if (at === generation) put({ status: 'error', message: apiErrorMessage(error), value: current?.value });
    }
  }

  const load = <L extends ScriptList>(list: L): Promise<void> =>
    read(state[list] as Loadable<unknown> | undefined, (value) => set({ ...state, [list]: value }), readers[list]);

  const loadParagraphs = (chapterId: string): Promise<void> =>
    read(
      state.paragraphs[chapterId],
      (value) => set({ ...state, paragraphs: { ...state.paragraphs, [chapterId]: value } }),
      () => ports.manuscript.manuscriptParagraphs(chapterId),
    );

  async function loadCues(chapterIds: readonly string[] = Object.keys(state.cues)): Promise<void> {
    if (chapterIds.length === 0) return;
    const at = generation;
    const put = (of: (chapterId: string) => Loadable<GuideDialogueCue[]>) =>
      set({ ...state, cues: { ...state.cues, ...Object.fromEntries(chapterIds.map((chapterId) => [chapterId, of(chapterId)])) } });
    put((chapterId) => ({ status: 'loading', value: state.cues[chapterId]?.value }));
    try {
      const cues = await ports.storyBible.guideDialogueCuesIn(chapterIds);
      if (at === generation) put((chapterId) => ({ status: 'ready', value: cues.filter((cue) => cue.chapterId === chapterId) }));
    } catch (error) {
      const message = apiErrorMessage(error);
      if (at === generation) put((chapterId) => ({ status: 'error', message, value: state.cues[chapterId]?.value }));
    }
  }

  /** The chapters whose cues were asked for in this tick. */
  const asked = new Set<string>();

  /** Everything loaded is read again: a job may have replaced the manuscript or rebuilt the Story Bible. */
  const reloadLoaded = () => {
    (Object.keys(readers) as ScriptList[]).filter((list) => state[list]).forEach((list) => void load(list));
    Object.keys(state.paragraphs).forEach((chapterId) => void loadParagraphs(chapterId));
    void loadCues();
  };

  let started = 0;
  let stop: (() => void) | null = null;

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    load,
    loadParagraphs,
    ensure(list) {
      if (!state[list]) void load(list);
    },
    ensureParagraphs(chapterId) {
      if (!state.paragraphs[chapterId]) void loadParagraphs(chapterId);
    },
    loadCues,
    ensureCues(chapterId) {
      if (state.cues[chapterId] || asked.has(chapterId)) return;
      // The reader asks for each chapter it draws in one effect: they wait for the end of the tick and go in one call.
      if (asked.size === 0) {
        queueMicrotask(() => {
          const chapterIds = [...asked];
          asked.clear();
          void loadCues(chapterIds);
        });
      }
      asked.add(chapterId);
    },
    retryFailed() {
      const { paragraphs, cues } = state;
      LISTS.filter((list) => state[list]?.status === 'error').forEach((list) => void load(list));
      failedIn(paragraphs).forEach((chapterId) => void loadParagraphs(chapterId));
      void loadCues(failedIn(cues));
    },
    start() {
      if (started++ === 0) {
        // The cache outlives the page, and the Story Bible edits entries, types and cues without telling it: opening Script reads again what it holds.
        STORY_BIBLE_LISTS.filter((list) => state[list]).forEach((list) => void load(list));
        void loadCues();
        const offJob = ports.system.subscribeJobEnded(reloadLoaded);
        const offProject = ports.system.subscribeProjectAttach((attach) => {
          if (!attach.attached) return;
          // The old project's answers are dropped and what the page was reading is read for the new one.
          const lists = (Object.keys(readers) as ScriptList[]).filter((list) => state[list]);
          const chapterIds = Object.keys(state.paragraphs);
          const cueChapterIds = Object.keys(state.cues);
          generation++;
          set({ cues: {}, paragraphs: {} });
          lists.forEach((list) => void load(list));
          chapterIds.forEach((chapterId) => void loadParagraphs(chapterId));
          void loadCues(cueChapterIds);
        });
        const offPronunciation = ports.pronunciation?.subscribe(() => {
          if (state.entries) void load('entries');
        });
        stop = () => {
          offJob();
          offProject();
          offPronunciation?.();
        };
      }
      return () => {
        if (--started === 0) {
          stop?.();
          stop = null;
        }
      };
    },
  };
}
