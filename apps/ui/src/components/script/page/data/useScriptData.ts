// The Script page's one data layer (SNB-7a): the hooks every part of the page reads the host through. They read the
// manuscript, marks, prep, Story Bible and dictionary ports, keep one read cache and one view store per host, bind the pure
// selectors of `script.selectors.ts` to what is loaded, and run the journalled commands of `scriptCommands.ts`. A refusal is
// the host's sentence in a toast and nothing is journalled. No other file of the page names a port.

import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react';
import type { ManuscriptChapter, ManuscriptParagraph } from '../../../../api/contracts/manuscript';
import type { DictionaryLookupResult } from '../../../../api/contracts/dictionary';
import type { Mark, Marks, MarkThreadAuthor, MarkType } from '../../../../api/contracts/marks';
import type { PrepState, ScriptPrep, ScriptPrepChapter, ScriptWord } from '../../../../api/contracts/scriptPrep';
import type { GuideDialogueCue, GuideEntity } from '../../../../api/contracts/storyBible';
import { apiErrorMessage } from '../../../../api/errorMessage';
import type { ChapterNameInput } from '../../../../chapterName';
import { overlay } from '../../../../overlay/overlayService';
import { usePort } from '../../../../ports/usePort';
import { useJournal } from '../../../../studio/StudioProvider';
import type { Result } from '../../../../studio/journal/createJournal';
import * as commands from './scriptCommands';
import type { LineRange, ScriptCommandEnv } from './scriptCommands';
import { createScriptData, type Loadable, type ScriptData, type ScriptDataState } from './scriptData';
import { createScriptView, type ScriptView, type ScriptViewState } from './scriptView';
import * as select from './script.selectors';

/** What a read looks like to a component: its value (the last one while a reload runs), the host's sentence when it failed, and Retry. */
export type ReadView<T> = {
  status: Loadable<T>['status'];
  value: T | undefined;
  /** The host's sentence when the read failed; empty otherwise. */
  message: string;
  retry: () => void;
};

type ScriptHost = { data: ScriptData; view: ScriptView };

/** One cache and one view per host, so every part of the page shares them; a new host (a test's mock) starts clean. */
const hosts = new WeakMap<object, ScriptHost>();

function useScriptHost(): ScriptHost {
  const manuscript = usePort('manuscript');
  const marks = usePort('marks');
  const scriptPrep = usePort('scriptPrep');
  const storyBible = usePort('storyBible');
  const system = usePort('system');
  const host = useMemo(() => {
    const found = hosts.get(marks);
    if (found) return found;
    const created = { data: createScriptData({ manuscript, marks, scriptPrep, storyBible, system }), view: createScriptView() };
    hosts.set(marks, created);
    return created;
  }, [manuscript, marks, scriptPrep, storyBible, system]);
  useEffect(() => host.data.start(), [host]);
  return host;
}

/** A field of the cache's state; the cache replaces only what changed, so the value is stable between changes. */
function useData<T>(data: ScriptData, pick: (state: ScriptDataState) => T): T {
  return useSyncExternalStore(data.subscribe, () => pick(data.getState()));
}

const view = <T>(loaded: Loadable<T> | undefined, retry: () => void): ReadView<T> => ({
  status: loaded?.status ?? 'loading',
  value: loaded?.value,
  message: loaded?.status === 'error' ? loaded.message : '',
  retry,
});

/** The manuscript's chapters, read once and again after a job ends. */
export function useChapters(): ReadView<ManuscriptChapter[]> {
  const { data } = useScriptHost();
  const loaded = useData(data, (state) => state.chapters);
  useEffect(() => data.ensure('chapters'), [data]);
  const retry = useCallback(() => void data.load('chapters'), [data]);
  return useMemo(() => view(loaded, retry), [loaded, retry]);
}

/** A chapter's paragraphs, cached per chapter and read again after a job ends. */
export function useParagraphs(chapterId: string): ReadView<ManuscriptParagraph[]> {
  const { data } = useScriptHost();
  const loaded = useData(data, (state) => state.paragraphs[chapterId]);
  useEffect(() => data.ensureParagraphs(chapterId), [data, chapterId]);
  const retry = useCallback(() => void data.loadParagraphs(chapterId), [data, chapterId]);
  return useMemo(() => view(loaded, retry), [loaded, retry]);
}

const NO_TYPES: MarkType[] = [];
const NO_MARKS: Mark[] = [];
const NO_WORDS: ScriptWord[] = [];
const NO_PREP: ScriptPrepChapter[] = [];
const NO_ENTRIES: GuideEntity[] = [];
const NO_CUES: GuideDialogueCue[] = [];

export type MarksView = ReadView<Marks> & {
  types: MarkType[];
  marks: Mark[];
  isAsk: (mark: Mark) => boolean;
  inChapter: (chapterId: string) => Mark[];
  openQueries: Mark[];
  messages: typeof select.markMessages;
};

/** The mark types and every mark, in reading order. */
export function useMarks(): MarksView {
  const { data } = useScriptHost();
  const loaded = useData(data, (state) => state.marks);
  useEffect(() => data.ensure('marks'), [data]);
  const retry = useCallback(() => void data.load('marks'), [data]);
  return useMemo(() => {
    const types = loaded?.value?.types ?? NO_TYPES;
    const marks = loaded?.value?.marks ?? NO_MARKS;
    return {
      ...view(loaded, retry),
      types,
      marks,
      isAsk: (mark: Mark) => select.isAsk(types, mark),
      inChapter: (chapterId: string) => select.marksInChapter(marks, chapterId),
      openQueries: select.openQueries(types, marks),
      messages: select.markMessages,
    };
  }, [loaded, retry]);
}

export type PrepView = ReadView<ScriptPrep> & {
  words: ScriptWord[];
  prepOf: (chapterId: string) => PrepState;
  wordsInChapter: (chapterId: string) => ScriptWord[];
  pronStatus: (word: string) => ScriptWord['status'];
  pronOfWord: (word: string) => { say: string; source: string };
};

/** Each chapter's prep state and the flagged words. */
export function useScriptPrep(): PrepView {
  const { data } = useScriptHost();
  const loaded = useData(data, (state) => state.prep);
  useEffect(() => data.ensure('prep'), [data]);
  const retry = useCallback(() => void data.load('prep'), [data]);
  return useMemo(() => {
    const chapters = loaded?.value?.chapters ?? NO_PREP;
    const words = loaded?.value?.words ?? NO_WORDS;
    return {
      ...view(loaded, retry),
      words,
      prepOf: (chapterId: string) => chapters.find((row) => row.chapterId === chapterId)?.state ?? 'none',
      wordsInChapter: (chapterId: string) => select.wordsInChapter(words, chapterId),
      pronStatus: (word: string) => select.pronStatus(words, word),
      pronOfWord: (word: string) => select.pronOfWord(words, word),
    };
  }, [loaded, retry]);
}

export type EntriesView = ReadView<GuideEntity[]> & {
  entries: GuideEntity[];
  entryById: (id: string | null | undefined) => GuideEntity | undefined;
  findEntries: (query: string, category: string) => GuideEntity[];
  mentionsIn: (paragraph: Pick<ManuscriptParagraph, 'text'>) => select.Mention[];
  entriesInChapter: (paragraphs: readonly Pick<ManuscriptParagraph, 'text'>[]) => GuideEntity[];
};

/** The Story Bible's entries, read once and again after each Story Bible change this page makes or a build ends. */
export function useEntries(): EntriesView {
  const { data } = useScriptHost();
  const loaded = useData(data, (state) => state.entries);
  useEffect(() => data.ensure('entries'), [data]);
  const retry = useCallback(() => void data.load('entries'), [data]);
  return useMemo(() => {
    const entries = loaded?.value ?? NO_ENTRIES;
    return {
      ...view(loaded, retry),
      entries,
      entryById: (id: string | null | undefined) => select.entryById(entries, id),
      findEntries: (query: string, category: string) => select.findEntries(entries, query, category),
      mentionsIn: (paragraph: Pick<ManuscriptParagraph, 'text'>) => select.mentionsIn(entries, paragraph.text),
      entriesInChapter: (paragraphs: readonly Pick<ManuscriptParagraph, 'text'>[]) => select.entriesInChapter(entries, paragraphs),
    };
  }, [loaded, retry]);
}

export type SpeakersView = ReadView<GuideDialogueCue[]> & {
  phrasesOf: (paragraph: Pick<ManuscriptParagraph, 'id' | 'chapterId'>) => select.Phrase[];
  unattributed: (chapterId: string) => number;
  candidates: GuideEntity[];
};

/** Quoted phrases and their speakers, from the Story Bible's dialogue cues and entries. */
export function useSpeakers(): SpeakersView {
  const { data } = useScriptHost();
  const cues = useData(data, (state) => state.cues);
  const entries = useEntries();
  useEffect(() => data.ensure('cues'), [data]);
  const retry = useCallback(() => void data.load('cues'), [data]);
  return useMemo(() => {
    const list = cues?.value ?? NO_CUES;
    return {
      ...view(cues, retry),
      phrasesOf: (paragraph: Pick<ManuscriptParagraph, 'id' | 'chapterId'>) => select.phrasesOf(list, entries.entries, paragraph),
      unattributed: (chapterId: string) => select.unattributed(list, entries.entries, chapterId),
      candidates: select.speakerCandidates(entries.entries),
    };
  }, [cues, retry, entries.entries]);
}

/** The chapter card's facts line, from the marks, the flagged words and the phrases with no speaker. */
export function useChapterFacts(): (chapterId: string) => string {
  const marks = useMarks();
  const prep = useScriptPrep();
  const speakers = useSpeakers();
  return useCallback(
    (chapterId: string) =>
      select.chapterFacts({ types: marks.types, marks: marks.marks, words: prep.words, unattributed: speakers.unattributed(chapterId) }, chapterId),
    [marks.types, marks.marks, prep.words, speakers],
  );
}

/** The page's view state and its setter. The selector must return a field of the state (or a value derived only from one). */
export function useScriptView<T>(pick: (state: ScriptViewState) => T): [T, ScriptView['update']] {
  const { view: store } = useScriptHost();
  const value = useSyncExternalStore(store.subscribe, () => pick(store.getState()));
  return [value, store.update];
}

/** Looks one word up in the offline dictionary. A failed lookup answers the host's sentence. */
export function useDictionary(): (word: string) => Promise<{ ok: true; value: DictionaryLookupResult } | { ok: false; message: string }> {
  const dictionary = usePort('dictionary');
  return useCallback(
    async (word: string) => {
      try {
        return { ok: true, value: await dictionary.systemLookup(word) };
      } catch (error) {
        return { ok: false, message: apiErrorMessage(error) };
      }
    },
    [dictionary],
  );
}

/** A refusal is the host's own sentence in a toast; nothing was journalled. */
function said<T>(result: Result<T>): T | null {
  if (result.ok) return result.value;
  overlay.toast(result.refusal.reason, { tone: 'error' });
  return null;
}

/** The page's changes, each one journal entry; each answers its value, or null when the host refused (its sentence is a toast). */
export function useScriptCommands() {
  const { data } = useScriptHost();
  const journal = useJournal();
  const marks = usePort('marks');
  const scriptPrep = usePort('scriptPrep');
  const storyBible = usePort('storyBible');
  const env = useMemo<ScriptCommandEnv>(
    () => ({ journal, marks, scriptPrep, storyBible, data, announce: (text) => overlay.announce(text) }),
    [journal, marks, scriptPrep, storyBible, data],
  );

  return useMemo(() => {
    const undoOffer = (text: string, entryId: number | null) => {
      if (entryId === null) return;
      overlay.toastUndo(text, async () => {
        const undone = await journal.undo(entryId);
        return undone.ok ? { ok: true } : undone;
      });
    };
    return {
      /** Marks a range; a query needs its question. Says what was saved, as the mock does. */
      async addMark(range: LineRange & { quote: string }, type: string, text: string) {
        const done = said(await commands.addMark(env, range, type, text));
        if (!done) return null;
        const kind = data.getState().marks?.value?.types.find((row) => row.key === type);
        overlay.toast(kind?.asks ? 'Query saved. Track the reply in the Queries tab.' : `Marked “${range.quote}” as ${kind?.name ?? type}.`);
        return done.value;
      },
      removeMark: async (id: string) => said(await commands.removeMark(env, id)) !== null,
      setMarkType: async (id: string, type: string) => said(await commands.setMarkType(env, id, type))?.value ?? null,
      reply: async (id: string, who: MarkThreadAuthor, text: string) => said(await commands.replyToMark(env, id, who, text))?.value ?? null,
      editMessage: async (id: string, index: number, text: string) => said(await commands.editMessage(env, id, index, text)) !== null,
      /** Deletes a message and offers Undo, which restores it. */
      async deleteMessage(id: string, index: number) {
        const done = said(await commands.deleteMessage(env, id, index));
        if (done) undoOffer('Message deleted.', done.entryId);
        return done !== null;
      },
      setStatus: async (id: string, status: 'open' | 'resolved') => said(await commands.setMarkStatus(env, id, status)) !== null,
      /** Resolves a query, with a last reply first when one was typed. */
      async resolve(id: string, who: MarkThreadAuthor, text: string) {
        if (text.trim() && !said(await commands.replyToMark(env, id, who, text))) return false;
        if (!said(await commands.setMarkStatus(env, id, 'resolved'))) return false;
        overlay.toast('Query resolved.');
        return true;
      },
      setPrep: async (chapter: ChapterNameInput & { id: string }, state: PrepState) => said(await commands.setPrep(env, chapter, state)) !== null,
      stepPrep: async (chapter: ChapterNameInput & { id: string }, delta: number) => said(await commands.stepPrep(env, chapter, delta)) !== null,
      flagWord: async (range: LineRange) => said(await commands.flagWord(env, range))?.value ?? null,
      unflagWord: async (flagId: string) => said(await commands.unflagWord(env, flagId)) !== null,
      removeWord: async (word: string) => said(await commands.removeWord(env, word)) !== null,
      /** Saves how a word is said; with no source the narrator typed it. */
      saveSay: async (word: string, say: string, source?: string) => said(await commands.saveSay(env, word, say, source))?.value ?? null,
      confirmSpeaker: async (cueId: string, entryId: string) => said(await commands.confirmSpeaker(env, cueId, entryId)) !== null,
      /** Makes (or finds) the Story Bible entry for a selected name and says which, as the mock does. Answers the entry's id. */
      async createEntryFrom(category: string, text: string) {
        const done = said(await commands.createEntryFrom(env, category, text));
        if (!done) return null;
        const name = text.trim();
        const entry = data.getState().entries?.value?.find((row) => row.id === done.value);
        overlay.toast(
          done.created ? `Added “${name}” to the Story Bible as ${category.toLowerCase()}.` : `Linked “${name}” to ${entry?.canonical_name ?? name}.`,
        );
        return done.value;
      },
    };
  }, [env, journal, data]);
}
