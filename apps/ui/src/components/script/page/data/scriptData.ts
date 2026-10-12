// The Script page's read cache: the chapter list, each chapter's paragraphs, the marks, the prep record, the Story Bible's
// entries, its types and its dialogue cues, each read once through its port and kept until something says it changed. A failed read is
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
  storyBible: Pick<StoryBibleApi, 'guideEntities' | 'guideTypes' | 'guideDialogueCues'>;
  system: Pick<SystemApi, 'subscribeJobEnded' | 'subscribeProjectAttach'>;
};

/** One read: loading (with the last value while a reload runs), ready, or failed with the host's sentence. */
export type Loadable<T> = { status: 'loading'; value?: T } | { status: 'ready'; value: T } | { status: 'error'; message: string; value?: T };

/** The lists read once for the whole page. */
export type ScriptList = 'chapters' | 'marks' | 'prep' | 'entries' | 'types' | 'cues';

export type ScriptDataState = {
  chapters?: Loadable<ManuscriptChapter[]>;
  marks?: Loadable<Marks>;
  prep?: Loadable<ScriptPrep>;
  entries?: Loadable<GuideEntity[]>;
  /** The Story Bible's types: which of them speak and their colours (SN-B95). */
  types?: Loadable<GuideType[]>;
  cues?: Loadable<GuideDialogueCue[]>;
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
  /** Wires the host's job and project events while a page reads; returns the stop function. Counted, so several readers share one wiring. */
  start(): () => void;
};

export function createScriptData(ports: ScriptPorts): ScriptData {
  let state: ScriptDataState = { paragraphs: {} };
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
    cues: () => ports.storyBible.guideDialogueCues(),
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

  /** Everything loaded is read again: a job may have replaced the manuscript or rebuilt the Story Bible. */
  const reloadLoaded = () => {
    (Object.keys(readers) as ScriptList[]).filter((list) => state[list]).forEach((list) => void load(list));
    Object.keys(state.paragraphs).forEach((chapterId) => void loadParagraphs(chapterId));
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
    start() {
      if (started++ === 0) {
        const offJob = ports.system.subscribeJobEnded(reloadLoaded);
        const offProject = ports.system.subscribeProjectAttach((attach) => {
          if (!attach.attached) return;
          // The old project's answers are dropped and what the page was reading is read for the new one.
          const lists = (Object.keys(readers) as ScriptList[]).filter((list) => state[list]);
          const chapterIds = Object.keys(state.paragraphs);
          generation++;
          set({ paragraphs: {} });
          lists.forEach((list) => void load(list));
          chapterIds.forEach((chapterId) => void loadParagraphs(chapterId));
        });
        stop = () => {
          offJob();
          offProject();
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
