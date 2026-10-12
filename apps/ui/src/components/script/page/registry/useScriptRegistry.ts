// What the Script page registers while it is mounted (SNB-7b): its four search sources, its right-click provider and its keys
// (Alt+Down and Alt+Up, Ctrl+F, the reader's Left and Right, Escape; mock `pages/script/keys.ts`). Each registration is removed when
// the page unmounts. The page passes the handlers that move its own view (open Find on a term, show a mark, go to a chapter); the data,
// the commands and the Find and drawer state come from the page's hooks, so nothing here holds state. The reader's Left and Right are
// the `script.prep.*` rows, so the page passes the Reader no `onStepPrep` of its own.

import { useMemo, useRef } from 'react';
import type { Mark } from '../../../../api/contracts/marks';
import { EDITABLE } from '../../../../input/targets';
import { useCommand } from '../../../../input/useCommand';
import { POPOVER_POPUP_SELECTOR } from '../../../primitives/Popover';
import { useContextProvider } from '../../../../registries/context';
import { useSearchSource } from '../../../../registries/search';
import type { ScriptViewState } from '../data/scriptView';
import { useChapters, useEntries, useMarks, useScriptCommands, useScriptPrep, useScriptView } from '../data/useScriptData';
import { closeFind, escapeClosesFind, openFind } from '../tools/find/findState';
import { scriptContextProvider, type MenuHandlers } from './contextProvider';
import { entriesSource, manuscriptSource, marksSource, wordsSource, type ManuscriptLine } from './searchSources';

export type ScriptRegistryOptions = MenuHandlers & {
  /** The lines of every chapter read so far, for the manuscript source. */
  lines: () => readonly ManuscriptLine[];
  /** The Story Bible kinds a selection can be added as. */
  kinds: readonly string[];
  /** The chapter at the top of the reader. */
  currentChapterId: () => string | null;
};

/** A menu or a popover that takes Escape for itself: one is showing, or the key was pressed inside one. */
const LAYER = `[role="menu"], ${POPOVER_POPUP_SELECTOR}`;
const layerOpen = (target: EventTarget | null) => (target instanceof Element && target.closest(LAYER) !== null) || document.querySelector(LAYER) !== null;

/** The reader's scroller (`Reader.tsx`): Left and Right step prep only when it has focus itself, as in the mock. */
const isReader = (target: EventTarget | null) => target instanceof Element && target.querySelector(':scope > [data-reader]') !== null;

/** Escape closes Find when nothing else is open; else the drawer. A menu or popover closes itself and nothing else moves. */
const escapePatch =
  (otherLayerOpen: boolean) =>
  (state: ScriptViewState): Partial<ScriptViewState> => {
    if (otherLayerOpen) return {};
    if (escapeClosesFind(state, false)) return closeFind(state);
    return state.drawer === null ? {} : { drawer: null };
  };

/** Registers the Script page's search sources, context provider and keys while the caller is mounted. */
export function useScriptRegistry(options: ScriptRegistryOptions): void {
  const chapters = useChapters().value;
  const marks = useMarks();
  const entries = useEntries();
  const prep = useScriptPrep();
  const commands = useScriptCommands();
  const [, updateView] = useScriptView((state) => state.find);
  const { lines, kinds, currentChapterId, ...handlers } = options;
  // The sources and the provider read the latest handlers, so a new function from the page does not register them again.
  const latest = useRef(handlers);
  latest.current = handlers;
  const stable = useMemo(
    () => ({
      openFind: (term: string, index?: number) => latest.current.openFind(term, index),
      showMark: (mark: Mark) => latest.current.showMark(mark),
      showWord: (word: string) => latest.current.showWord(word),
      showEntry: (id: string) => latest.current.showEntry(id),
    }),
    [],
  );

  const chapterList = useMemo(() => chapters ?? [], [chapters]);
  const marksSnapshot = useMemo(() => ({ types: marks.types, marks: marks.marks }), [marks.types, marks.marks]);

  useSearchSource(useMemo(() => manuscriptSource({ lines, chapters: chapterList, onFind: stable.openFind }), [lines, chapterList, stable]));
  useSearchSource(useMemo(() => entriesSource(() => entries.entries, stable.showEntry), [entries.entries, stable]));
  useSearchSource(useMemo(() => marksSource(() => marksSnapshot, stable.showMark), [marksSnapshot, stable]));
  useSearchSource(useMemo(() => wordsSource(() => prep.words, stable.showWord), [prep.words, stable]));

  useContextProvider(
    useMemo(
      () =>
        scriptContextProvider({
          lists: () => ({ ...marksSnapshot, entries: entries.entries, kinds, chapters: chapterList, prepOf: prep.prepOf }),
          commands,
          handlers: () => latest.current,
        }),
      [marksSnapshot, entries.entries, kinds, chapterList, prep.prepOf, commands],
    ),
  );

  // Alt+Down and Alt+Up carry a modifier, so the router lets them through a field; the check is repeated here.
  const step = (delta: 1 | -1, target: EventTarget | null) => {
    if (target instanceof Element && target.closest(EDITABLE) !== null) return;
    const at = chapterList.findIndex((row) => row.id === currentChapterId());
    const next = chapterList[Math.max(0, Math.min(chapterList.length - 1, Math.max(0, at) + delta))];
    if (next) latest.current.goToChapter(next.id);
  };
  useCommand('editing.chapter.next', (e) => step(1, e.target));
  useCommand('editing.chapter.prev', (e) => step(-1, e.target));

  // Ctrl+F opens Find on the query it had, as the mock's does; a term comes from the menus' Find items instead.
  useCommand('script.find', () => updateView(openFind()));

  // The chapter in view, or the first, as the reader's own key handling has it.
  const stepPrep = (delta: 1 | -1, target: EventTarget | null) => {
    if (!isReader(target)) return;
    const chapter = chapterList.find((row) => row.id === currentChapterId()) ?? chapterList[0];
    if (chapter) void commands.stepPrep(chapter, delta);
  };
  useCommand('script.prep.prev', (e) => stepPrep(-1, e.target));
  useCommand('script.prep.next', (e) => stepPrep(1, e.target));

  useCommand('script.escape', (e) => updateView(escapePatch(layerOpen(e.target))));
}
