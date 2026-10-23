// What the Script page registers while it is mounted (SNB-7b): its three search sources, its items for the jump menu (chapters, Story Bible
// entries, mark types and, while a search shows, its steps), its right-click provider and its keys (Alt+Down and Alt+Up, F3 and Shift+F3,
// the reader's Left and Right, Escape; mock `pages/script/keys.ts`). Each registration is removed when the page unmounts. The page passes
// the handlers that move its own view (show a search on a term, show a mark, go to a chapter); the data, the commands and the search and
// drawer state come from the page's hooks, so nothing here holds state. Ctrl+F is the shell's `jump.page`, not a Script key. The reader's Left and Right are
// the `script.prep.*` rows, so the page passes the Reader no `onStepPrep` of its own.

import { useMemo, useRef } from 'react';
import type { Mark } from '../../../../api/contracts/marks';
import { EDITABLE } from '../../../../input/targets';
import { usePageCommands, type PageItem } from '../../../../input/pageCommands';
import { useCommand } from '../../../../input/useCommand';
import { POPOVER_POPUP_SELECTOR } from '../../../primitives/Popover';
import { useContextProvider } from '../../../../registries/context';
import { useSearchSource } from '../../../../registries/search';
import { chapterName, type ChapterNameInput } from '../../../../chapterName';
import type { ScriptViewState } from '../data/scriptView';
import { useChapters, useEntries, useMarks, useScriptCommands, useScriptPrep, useScriptView } from '../data/useScriptData';
import { closeFind, escapeClosesFind, stepFind } from '../tools/find/findState';
import { scriptContextProvider, type MenuHandlers } from './contextProvider';
import { manuscriptSource, marksSource, wordsSource, type ManuscriptLine } from './searchSources';

export type ScriptRegistryOptions = MenuHandlers & {
  /** The lines of every chapter read so far, for the manuscript source. */
  lines: () => readonly ManuscriptLine[];
  /** Where a match is, for its muted line in the menu ("Chapter 3 · ¶ 12"). */
  locationOf: (spot: { chapterId: string; paragraphId: string }) => string;
  /** How many matches the search showing in the reader has. */
  matchCount: () => number;
  /** The Story Bible kinds a selection can be added as. */
  kinds: readonly string[];
  /** The chapter at the top of the reader. */
  currentChapterId: () => string | null;
  /** What Alt+Up and Alt+Down step through and Left and Right step the prep of, in reading order, when the page draws more than the
   * chapters (the credits); the chapters alone when omitted. */
  stops?: ReadonlyArray<ChapterNameInput & { id: string }>;
};

/** A menu or a popover that takes Escape for itself: one is showing, or the key was pressed inside one. */
const LAYER = `[role="menu"], ${POPOVER_POPUP_SELECTOR}`;
const layerOpen = (target: EventTarget | null) => (target instanceof Element && target.closest(LAYER) !== null) || document.querySelector(LAYER) !== null;

/** The reader's scroller (`Reader.tsx`): Left and Right step prep only when it has focus itself, as in the mock. */
const isReader = (target: EventTarget | null) => target instanceof Element && target.querySelector(':scope > [data-reader]') !== null;

/** Escape closes Find when no menu is open and no drawer shows; else it closes the drawer, as the mock's does. A menu closes itself. */
const escapePatch =
  (otherLayerOpen: boolean) =>
  (state: ScriptViewState): Partial<ScriptViewState> => {
    if (escapeClosesFind(state, otherLayerOpen)) return closeFind(state);
    return state.drawer === null ? {} : { drawer: null };
  };

const typing = (target: EventTarget | null) => target instanceof Element && target.closest(EDITABLE) !== null;

/** Registers the Script page's search sources, context provider and keys while the caller is mounted. */
export function useScriptRegistry(options: ScriptRegistryOptions): void {
  const chapters = useChapters().value;
  const marks = useMarks();
  const entries = useEntries();
  const prep = useScriptPrep();
  const commands = useScriptCommands();
  const [find, updateView] = useScriptView((state) => state.find);
  const { lines, locationOf, matchCount, kinds, currentChapterId, stops, ...handlers } = options;
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

  useSearchSource(useMemo(() => manuscriptSource({ lines, locationOf, onFind: stable.openFind }), [lines, locationOf, stable]));
  useSearchSource(useMemo(() => marksSource(() => marksSnapshot, stable.showMark), [marksSnapshot, stable]));
  useSearchSource(useMemo(() => wordsSource(() => prep.words, stable.showWord), [prep.words, stable]));

  useContextProvider(
    useMemo(
      () =>
        scriptContextProvider({
          lists: () => ({ ...marksSnapshot, entries: entries.entries, kinds, chapters: stops ?? chapterList, prepOf: prep.prepOf }),
          commands,
          handlers: () => latest.current,
        }),
      [marksSnapshot, entries.entries, kinds, stops, chapterList, prep.prepOf, commands],
    ),
  );

  // What the jump menu lists first while the Script is showing. Read each time the menu opens, so the selection and the search are the ones it opens on.
  usePageCommands({ id: 'script', label: 'Script', supersedes: ['Chapters'] }, () => {
    const items: PageItem[] = [];
    if (find.open) {
      const count = matchCount();
      const none = count === 0 ? 'No matches' : undefined;
      const where = count === 0 ? `No matches for “${find.q}”` : `${Math.min(find.i, count - 1) + 1} of ${count} for “${find.q}”`;
      items.push(
        { id: 'search.next', label: 'Next match', group: 'Search', hint: where, icon: 'next', disabledReason: none, run: () => updateView(stepFind(1, count)) },
        {
          id: 'search.prev',
          label: 'Previous match',
          group: 'Search',
          hint: where,
          icon: 'previous',
          disabledReason: none,
          run: () => updateView(stepFind(-1, count)),
        },
        { id: 'search.clear', label: 'Clear the search', group: 'Search', icon: 'close', run: () => updateView(closeFind) },
      );
    }
    for (const chapter of stops ?? chapterList) {
      items.push({
        id: `chapter.${chapter.id}`,
        label: chapterName(chapter, 'full'),
        group: 'Chapters',
        icon: 'goToChapter',
        run: () => latest.current.goToChapter(chapter.id),
      });
    }
    for (const entry of entries.entries) {
      items.push({
        id: `entry.${entry.id}`,
        label: entry.canonical_name,
        group: 'Story Bible',
        hint: entry.category,
        keywords: entry.aliases.map((alias) => alias.text),
        icon: 'locate',
        run: () => stable.showEntry(entry.id),
      });
    }
    const picked = latest.current.selectionAt(document.body);
    for (const type of marks.types) {
      items.push({
        id: `mark-type.${type.key}`,
        label: `Mark the selection as ${type.name}`,
        group: 'Mark types',
        icon: 'markText',
        disabledReason: picked ? undefined : 'Select some text in the reader first',
        run: () => picked && latest.current.composeMark(type.key, picked),
      });
    }
    return items;
  });

  // Alt+Down and Alt+Up carry a modifier, so the router lets them through a field; the check is repeated here.
  const step = (delta: 1 | -1, target: EventTarget | null) => {
    if (typing(target)) return;
    const order = stops ?? chapterList;
    const at = order.findIndex((row) => row.id === currentChapterId());
    const next = order[Math.max(0, Math.min(order.length - 1, Math.max(0, at) + delta))];
    if (next) latest.current.goToChapter(next.id);
  };
  useCommand('editing.chapter.next', (e) => step(1, e.target));
  useCommand('editing.chapter.prev', (e) => step(-1, e.target));

  // F3 and Shift+F3 step the search the jump menu chose, only while one shows.
  useCommand('script.search.next', () => updateView(stepFind(1, matchCount())), find.open);
  useCommand('script.search.prev', () => updateView(stepFind(-1, matchCount())), find.open);

  // The chapter in view, or the first, as the reader's own key handling has it.
  const stepPrep = (delta: 1 | -1, target: EventTarget | null) => {
    if (!isReader(target)) return;
    const order = stops ?? chapterList;
    const chapter = order.find((row) => row.id === currentChapterId()) ?? order[0];
    if (chapter) void commands.stepPrep(chapter, delta);
  };
  useCommand('script.prep.prev', (e) => stepPrep(-1, e.target));
  useCommand('script.prep.next', (e) => stepPrep(1, e.target));

  useCommand('script.escape', (e) => updateView(escapePatch(layerOpen(e.target))));
}
