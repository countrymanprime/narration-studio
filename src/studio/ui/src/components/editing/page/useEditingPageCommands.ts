import { gestureKeys } from '../../../input/hints';
import type { Keymap } from '../../../input/keymap';
import type { CommandId } from '../../../input/commands.catalog';
import { usePageCommands, type PageItem } from '../../../input/pageCommands';
import type { DrawerTab } from '../drawer/drawerTabs';
import { summarize, type ChapterDoc } from '../model';
import type { CutWords } from '../range/cut/useCutWords';
import type { FxWords } from '../range/fx/useFxWords';
import { docCutsOf } from '../range/common/locate';
import type { EditCut } from '../../../api/contracts/editCuts';

const PAGE = { id: 'editing', label: 'Editing' } as const;
const NO_SELECTION = 'Select some words in the script first.';

/**
 * The chapters, in the jump menu's "On this page". Choosing one opens it here, so the global "Go to <chapter>" rows (which open the Script) give
 * way to these. Registered by the page itself, so they are offered while the first chapter is still loading.
 */
export function useEditingChapterCommands(
  chapters: ReadonlyArray<{ id: string; name: string }>,
  current: string | undefined,
  choose: (id: string) => void,
): void {
  usePageCommands({ ...PAGE, supersedes: ['Chapters'] }, () =>
    chapters.map((chapter): PageItem => ({
      id: `chapter.${chapter.id}`,
      label: chapter.name,
      group: 'Chapters',
      hint: chapter.id === current ? 'Open now' : undefined,
      icon: 'goToChapter',
      run: () => choose(chapter.id),
    })),
  );
}

export interface EditingActionCommands {
  doc: ChapterDoc;
  /** The selected words, or the cursor's word alone: what the Delete, M and F keys act on. */
  selected: readonly string[];
  cuts: readonly EditCut[];
  cut: Pick<CutWords, 'remove' | 'mute' | 'refusalOf'>;
  fx: Pick<FxWords, 'fx' | 'refusalOf'>;
  /** Opens the recording check; absent until the chapter's record is read. */
  checkRecording: (() => void) | undefined;
  /** The drawer tabs the DAW offers, with their names. */
  tabs: ReadonlyArray<readonly [DrawerTab, string]>;
  openTab: (tab: DrawerTab) => void;
  keymap: Keymap;
}

/**
 * What the loaded chapter offers: actions for the selection (off, with the reason, when they cannot run now), the recording check and the drawer's
 * tabs. Read each time the menu opens, so the selection and the DAW's answer are the ones it opens on.
 */
export function useEditingActionCommands(page: EditingActionCommands): void {
  usePageCommands(PAGE, () => {
    const { doc, selected, cuts, cut, fx, checkRecording, tabs, openTab, keymap } = page;
    const keyOf = (id: CommandId): string | undefined => {
      const first = keymap[id]?.[0];
      return first ? gestureKeys(first).join('+') : undefined;
    };
    // The same words and reasons the bar's buttons use, so the menu and the bar never disagree.
    const summary = selected.length ? summarize(doc, [...selected], docCutsOf(cuts), (t) => t) : null;
    const reason = (refusalOf: (sum: NonNullable<typeof summary>) => string): string | undefined => (summary ? refusalOf(summary) || undefined : NO_SELECTION);
    const items: PageItem[] = [
      {
        id: 'selection.delete',
        label: 'Delete the selected words and audio',
        group: 'Selection',
        hint: keyOf('editing.delete'),
        icon: 'delete',
        disabledReason: reason(cut.refusalOf),
        run: cut.remove,
      },
      {
        id: 'selection.mute',
        label: 'Mute the selected words (keep the audio)',
        group: 'Selection',
        hint: keyOf('editing.mute'),
        disabledReason: reason(cut.refusalOf),
        run: cut.mute,
      },
      {
        id: 'selection.fx',
        label: 'Add FX to the selected words',
        group: 'Selection',
        hint: keyOf('editing.fx'),
        icon: 'addFx',
        disabledReason: reason(fx.refusalOf),
        run: fx.fx,
      },
      {
        id: 'check.recording',
        label: 'Check the recording of this chapter',
        group: 'Checks',
        icon: 'checkRecordings',
        disabledReason: checkRecording ? undefined : 'The chapter list is still loading. Try again in a moment.',
        run: () => checkRecording?.(),
      },
    ];
    for (const [tab, label] of tabs.filter(([key]) => key !== 'timeline')) {
      items.push({ id: `drawer.${tab}`, label: `Open ${label} in the drawer`, group: 'Drawer', run: () => openTab(tab) });
    }
    return items;
  });
}
