import { chapterName } from '../../chapterName';
import { usePageCommands, type PageItem } from '../../input/pageCommands';
import type { ManuscriptChapter } from '../../types';
import { ALL_CHAPTERS } from '../primitives/ChapterStepper';
import { DECISIONS, press } from './useProofKeys';

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
  review: { available: boolean; message?: string };
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
        label: chapterName(chapter),
        group: 'Chapters',
        hint: open === 1 ? '1 open note' : `${open} open notes`,
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
      label: shown ? `Check recordings of ${chapterName(shown)}` : 'Check recordings',
      group: 'Checks',
      icon: 'checkRecordings',
      disabledReason: page.review.available ? undefined : page.review.message || 'The DAW is not reachable.',
      run: () => page.onCheck(shown ? [shown.id] : []),
    });
    return items;
  });
}
