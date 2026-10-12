// What the Script page registers while it is mounted (SNB-7b): its four search sources, its right-click provider and the chapter
// keys. Each registration is removed when the page unmounts. The page passes the handlers that move its own view (open Find,
// show a mark, go to a chapter); the data and the commands come from the page's hooks, so nothing here holds state.
//
// Not registered here: the Script-scoped Ctrl+F, the reader's Left and Right, and Escape. The catalogue cannot give a page-scope
// row a gesture that a global or another page's row already holds (`findConflicts` reports it), and `jump.open` holds Ctrl+F,
// `workspace.word.*` the arrows and `editing.escape` Escape; see the pull request for the decision this waits on.

import { useMemo, useRef } from 'react';
import type { Mark } from '../../../../api/contracts/marks';
import { EDITABLE } from '../../../../input/targets';
import { useCommand } from '../../../../input/useCommand';
import { useContextProvider } from '../../../../registries/context';
import { useSearchSource } from '../../../../registries/search';
import { useChapters, useEntries, useMarks, useScriptCommands, useScriptPrep } from '../data/useScriptData';
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

/** Registers the Script page's search sources, context provider and chapter keys while the caller is mounted. */
export function useScriptRegistry(options: ScriptRegistryOptions): void {
  const chapters = useChapters().value;
  const marks = useMarks();
  const entries = useEntries();
  const prep = useScriptPrep();
  const commands = useScriptCommands();
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
}
