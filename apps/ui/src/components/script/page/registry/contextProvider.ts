// The Script page's right-click menus (the mock's `pages/script/context.ts`): reader text (a selection, a mark, a name), the
// chapter list and boundary cards, and the words of the side panel. One provider answers for those targets and for nothing else,
// the first matching target wins, and every item runs a SN-B70 command or a handler the page passes, so it holds no state. A mark
// type or a Story Bible kind is never written here: both come from the lists passed in. The menu primitive draws one flat list,
// so the mock's submenus ("Mark as", "Change type", "My prep") are rows named after their submenu. An item whose handler the
// page did not pass (Bookmark here, Record from here before the Booth swap) is left out.

import type { Mark, MarkType } from '../../../../api/contracts/marks';
import type { PrepState } from '../../../../api/contracts/scriptPrep';
import type { GuideEntity } from '../../../../api/contracts/storyBible';
import type { ContextProvider } from '../../../../registries/context';
import type { ContextMenuItem } from '../../../primitives/ContextMenu';
import { PREP_LABELS, type LineRange } from '../data/scriptCommands';

/** The attributes the reader (`reader/Para.tsx`) and the lists put on what can be right-clicked. The first matching selector wins, in
 * this order: a mark is a `data-a` span with its style (`data-st`), a flagged word a `data-w` span, a chapter a list row (`data-jump`)
 * or a section of the reader (`data-bound`), and a word of the Words tab its row. */
const TARGETS = {
  line: 'p[data-pid]',
  mark: '[data-a][data-st]',
  flag: '[data-w]',
  name: '[data-ent]',
  chapter: '[data-jump], [data-bound][data-ch]',
  word: 'tr[data-w]',
} as const;

/** A selected range of one line, with its text. */
export type ReaderSelection = LineRange & { quote: string };

type MenuCommands = {
  setMarkType: (id: string, type: string) => Promise<unknown>;
  removeMark: (id: string) => Promise<unknown>;
  setStatus: (id: string, status: 'open' | 'resolved') => Promise<unknown>;
  removeWord: (word: string) => Promise<unknown>;
  flagWord: (range: LineRange) => Promise<unknown>;
  createEntryFrom: (category: string, text: string) => Promise<unknown>;
  setPrep: (chapter: { id: string; title: string; subtitle?: string }, state: PrepState) => Promise<unknown>;
};

export type MenuHandlers = {
  /** The selection under the right click, or the word under the pointer; null when there is none. */
  selectionAt: (target: Element) => ReaderSelection | null;
  /** Opens the Script's Find on the term, with the match at `index` current (the first by default). */
  openFind: (term: string, index?: number) => void;
  /** Selects the mark and shows it in the rail's tab for its type. */
  showMark: (mark: Mark) => void;
  showWord: (word: string) => void;
  showEntry: (entryId: string) => void;
  lookUp: (text: string, selection: ReaderSelection) => void;
  copy: (text: string) => void;
  goToChapter: (chapterId: string) => void;
  /** Opens the composer for a mark of `type` on the selection. */
  composeMark: (type: string, selection: ReaderSelection) => void;
  bookmarkHere?: (selection: ReaderSelection) => void;
  recordFromHere?: (selection: ReaderSelection) => void;
  recordChapter?: (chapterId: string) => void;
};

type MenuLists = {
  types: readonly MarkType[];
  marks: readonly Mark[];
  entries: readonly GuideEntity[];
  /** The Story Bible kinds a selection can be added as. */
  kinds: readonly string[];
  chapters: readonly { id: string; title: string; subtitle?: string }[];
  prepOf: (chapterId: string) => PrepState;
};

/** `lists` and `handlers` are read when a menu opens, so the page can hand over its latest without registering again. */
export type ScriptMenuDeps = { lists: () => MenuLists; commands: MenuCommands; handlers: () => MenuHandlers };

const PREP_ORDER = Object.keys(PREP_LABELS) as PrepState[];
const QUOTE_SHOWN = 28;

const item = (key: string, label: string, onSelect: () => void, unavailable?: string): ContextMenuItem => ({
  key,
  label,
  onSelect,
  ...(unavailable ? { unavailable } : {}),
});
const attr = (target: Element, selector: string, name: string): string | undefined => target.closest<HTMLElement>(selector)?.getAttribute(name) ?? undefined;
const shortQuote = (text: string): string => (text.length > QUOTE_SHOWN ? `${text.slice(0, QUOTE_SHOWN)}…` : text);

function markItems(mark: Mark, lists: MenuLists, commands: MenuCommands, handlers: MenuHandlers): ContextMenuItem[] {
  const asks = lists.types.find((row) => row.key === mark.type)?.asks ?? false;
  const out = [item('mark-open', asks ? 'Open the thread' : 'Edit the note', () => handlers.showMark(mark))];
  if (asks) {
    const resolved = mark.status === 'resolved';
    out.push(item('mark-status', resolved ? 'Reopen' : 'Mark resolved', () => void commands.setStatus(mark.id, resolved ? 'open' : 'resolved')));
  }
  for (const type of lists.types) {
    out.push(
      item(
        `mark-type-${type.key}`,
        `Change type: ${type.name}`,
        () => void commands.setMarkType(mark.id, type.key),
        type.key === mark.type ? 'Already this type' : undefined,
      ),
    );
  }
  out.push(item('mark-delete', 'Delete mark', () => void commands.removeMark(mark.id)));
  return out;
}

function selectionItems(selection: ReaderSelection, lists: MenuLists, commands: MenuCommands, handlers: MenuHandlers): ContextMenuItem[] {
  const q = shortQuote(selection.quote);
  const out: ContextMenuItem[] = [
    ...lists.types.map((type) => item(`mark-as-${type.key}`, `Mark as: ${type.name}`, () => handlers.composeMark(type.key, selection))),
    item('mark-as-word', 'Mark as: Pronunciation (a word)', () => void commands.flagWord(selection)),
    ...lists.kinds.map((kind) => item(`bible-as-${kind}`, `Add to the Story Bible as: ${kind}`, () => void commands.createEntryFrom(kind, selection.quote))),
    item('look-up', `Look up “${q}”`, () => handlers.lookUp(selection.quote, selection)),
    item('find', `Find “${q}” in the manuscript`, () => handlers.openFind(selection.quote)),
    item('copy', 'Copy', () => handlers.copy(selection.quote)),
  ];
  const { bookmarkHere, recordFromHere } = handlers;
  if (bookmarkHere) out.push(item('bookmark-here', 'Bookmark here', () => bookmarkHere(selection)));
  if (recordFromHere) out.push(item('record-from-here', 'Record from here', () => recordFromHere(selection)));
  return out;
}

/** Reader text: the mark, the flagged word or the name under the pointer first, then the selection's items. */
function lineItems(target: Element, deps: ScriptMenuDeps): ContextMenuItem[] {
  const lists = deps.lists();
  const handlers = deps.handlers();
  const { commands } = deps;
  const out: ContextMenuItem[] = [];
  const mark = lists.marks.find((row) => row.id === attr(target, TARGETS.mark, 'data-a'));
  const word = attr(target, TARGETS.flag, 'data-w');
  const entry = lists.entries.find((row) => row.id === attr(target, TARGETS.name, 'data-ent'));
  if (mark) out.push(...markItems(mark, lists, commands, handlers));
  else if (word) {
    out.push(
      item('word-show', 'Show in Words', () => handlers.showWord(word)),
      item('word-remove', 'Remove from my words', () => void commands.removeWord(word)),
    );
  } else if (entry) {
    out.push(
      item('entry-show', `Open “${entry.canonical_name}” in the side panel`, () => handlers.showEntry(entry.id)),
      item('entry-find', `Find “${entry.canonical_name}” in the manuscript`, () => handlers.openFind(entry.canonical_name)),
    );
  }
  const selection = handlers.selectionAt(target);
  if (selection) out.push(...selectionItems(selection, lists, commands, handlers));
  return out;
}

function chapterItems(id: string, { lists, commands, handlers: getHandlers }: ScriptMenuDeps): ContextMenuItem[] {
  const handlers = getHandlers();
  const { chapters, prepOf } = lists();
  const chapter = chapters.find((row) => row.id === id);
  if (!chapter) return [];
  const current = prepOf(id);
  const out = [item('chapter-go', 'Go to this chapter', () => handlers.goToChapter(id))];
  const { recordChapter } = handlers;
  if (recordChapter) out.push(item('chapter-record', 'Record in Booth', () => recordChapter(id)));
  for (const state of PREP_ORDER) {
    out.push(
      item(`prep-${state}`, `My prep: ${PREP_LABELS[state]}`, () => void commands.setPrep(chapter, state), state === current ? 'Already set' : undefined),
    );
  }
  return out;
}

/** The provider for the Script page's targets: `null`-like (no match) for anything else. */
export function scriptContextProvider(deps: ScriptMenuDeps): ContextProvider {
  const word = (target: Element) => attr(target, TARGETS.word, 'data-w');
  return {
    match: (target) => target.closest(`${TARGETS.line}, ${TARGETS.chapter}, ${TARGETS.word}`) !== null,
    items: (target) => {
      // The first matching target wins, innermost last: a line sits inside the reader, a chapter card outside it.
      if (target.closest(TARGETS.line)) return lineItems(target, deps);
      const chapter = attr(target, TARGETS.chapter, 'data-jump') ?? attr(target, TARGETS.chapter, 'data-ch');
      if (chapter) return chapterItems(chapter, deps);
      const w = word(target);
      if (w === undefined) return [];
      return [
        item('word-show', `Show “${w}”`, () => deps.handlers().showWord(w)),
        item('word-remove', 'Remove from my words', () => void deps.commands.removeWord(w)),
      ];
    },
  };
}
