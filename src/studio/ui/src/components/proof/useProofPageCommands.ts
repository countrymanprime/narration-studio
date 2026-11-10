import { headingName } from '../../chapterHeading';
import { usePageCommands, type PageItem } from '../../input/pageCommands';
import type { ManuscriptChapter } from '../../types';
import { ALL_CHAPTERS } from '../primitives/ChapterStepper';
import { CHECK_RECORDINGS_LABEL } from '../recordingcheck/CheckRecordingsButton';
import { DECISIONS, press } from './useProofKeys';
import { plural } from '../../plural';

const DECIDE = [
  { id: 'note.pickup', label: DECISIONS.pickup, icon: 'record' },
  { id: 'note.edit', label: DECISIONS.edit, icon: 'edit' },
  { id: 'note.waive', label: DECISIONS.waive, icon: 'dismiss' },
  { id: 'note.defer', label: DECISIONS.defer, icon: 'next' },
] as const;

/**
 * What the jump menu lists while Proof is showing: its chapters (choosing one stays on Proof, so they replace the global "Go to <chapter>" rows),
 * the decisions for the selected note and the recording check. Read each time the menu opens, from the chapter showing and the note selected.
 */
export function useProofPageCommands(page: {
  chapters: readonly ManuscriptChapter[];
  /** The chapter showing, or `ALL_CHAPTERS`. */
  scope: string;
  /** Open notes per chapter id, for the muted line. */
  openIn: (chapterId: string) => number;
  selectedId: string | null;
  choose: (chapterId: string) => void;
  /** Why the DAW cannot check recordings now (the shared button's gate), or undefined. */
  checkReason?: string;
  onCheck: (chapterIds: string[]) => void;
}): void {
  usePageCommands({ id: 'proof', label: 'Proof', supersedes: ['Chapters'] }, () => {
    const all = page.scope === ALL_CHAPTERS;
    const items: PageItem[] = [
      {
        id: 'chapter.all',
        label: 'All chapters',
        group: 'Chapters',
        icon: 'goToChapter',
        disabledReason: all ? 'All chapters is already showing.' : undefined,
        run: () => page.choose(ALL_CHAPTERS),
      },
    ];
    for (const chapter of page.chapters) {
      const open = page.openIn(chapter.id);
      items.push({
        id: `chapter.${chapter.id}`,
        label: headingName(chapter),
        group: 'Chapters',
        hint: plural(open, 'open note'),
        icon: 'goToChapter',
        disabledReason: page.scope === chapter.id ? 'Already showing this chapter.' : undefined,
        run: () => page.choose(chapter.id),
      });
    }

    const none = page.selectedId === null ? 'Select a note first.' : undefined;
    for (const decision of DECIDE) {
      items.push({
        id: decision.id,
        label: decision.label,
        group: 'Selected note',
        icon: decision.icon,
        disabledReason: none,
        run: () => press(decision.label),
      });
    }

    const shown = all ? undefined : page.chapters.find((c) => c.id === page.scope);
    items.push({
      id: 'check',
      label: shown ? `${CHECK_RECORDINGS_LABEL} of ${headingName(shown)}` : CHECK_RECORDINGS_LABEL,
      group: 'Checks',
      icon: 'checkRecordings',
      disabledReason: page.checkReason,
      run: () => page.onCheck(shown ? [shown.id] : []),
    });
    return items;
  });
}
