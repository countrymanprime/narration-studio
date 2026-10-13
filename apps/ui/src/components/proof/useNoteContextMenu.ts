import { useMemo, useRef } from 'react';
import type { Finding } from '../../api/contracts/findings';
import { useContextProvider } from '../../registries/context';
import { TRIM_LABEL, trimmableGap } from './inspector/TrimGap';
import { DECISIONS, press } from './useProofKeys';

/** The DAW the Inspector's "Show in …" names: the menu says "Go to <DAW>" as the mock does. */
const SHOW_IN = 'Show in ';
const dawShown = (): string =>
  document.querySelector('aside[aria-label="Note"] button[aria-label^="Show in "]')?.getAttribute('aria-label')?.slice(SHOW_IN.length) ?? 'the DAW';

/** A note's row in the notes table, or its pin on the waveform. */
const NOTE = 'section[aria-label="Notes"] tr[data-row], [data-pin]';

type NoteMenu = {
  findings: readonly Finding[];
  /** The note a right click selected: the page selects the row under the pointer before the menu asks. */
  selectedId: () => string | null;
  select: (id: string) => void;
  goToScript: (chapterId: string) => void;
  goToBooth: (chapterId: string) => void;
};

/**
 * The right-click menu of a note on Proof (mock `registerContext` for the Proof page): decide it, reopen it, go to it in the DAW, trim
 * a gap note's gap, or open its chapter in Script or the Booth. The decisions, the DAW action and the trim press the Inspector's own
 * controls, so the stale-evidence guard and the DAW's capability apply to the menu as they do to the buttons. There is no Play ±3 s
 * (not built, PRD).
 */
export function useNoteContextMenu(menu: NoteMenu): void {
  const live = useRef(menu);
  live.current = menu;
  const provider = useMemo(() => {
    const noteOf = (target: Element): Finding | undefined => {
      const hit = target.closest<HTMLElement>(NOTE);
      if (!hit) return undefined;
      const id = hit.getAttribute('data-pin') ?? live.current.selectedId();
      return live.current.findings.find((f) => f.id === id);
    };
    return {
      match: (target: Element) => noteOf(target) !== undefined,
      items: (target: Element) => {
        const note = noteOf(target)!;
        const { select, goToScript, goToBooth } = live.current;
        select(note.id);
        const chapterId = note.manuscript?.chapter_id ?? '';
        const noChapter = chapterId ? undefined : 'This note names no chapter.';
        const decided = note.review.status !== 'unreviewed';
        return [
          { key: 'note-pickup', label: 'Needs pickup', onSelect: () => press(DECISIONS.pickup) },
          { key: 'note-edit', label: 'Fix in edit', onSelect: () => press(DECISIONS.edit) },
          { key: 'note-waive', label: 'Waive', onSelect: () => press(DECISIONS.waive) },
          { key: 'note-defer', label: 'Defer', onSelect: () => press(DECISIONS.defer) },
          { key: 'note-reopen', label: 'Reopen', unavailable: decided ? undefined : 'Not decided yet.', onSelect: () => press('Reopen') },
          { key: 'note-goto', label: `Go to ${dawShown()}`, onSelect: () => press(SHOW_IN) },
          ...(trimmableGap(note) ? [{ key: 'note-trim', label: TRIM_LABEL, onSelect: () => press(TRIM_LABEL) }] : []),
          { key: 'note-script', label: 'Open this chapter in Script', unavailable: noChapter, onSelect: () => goToScript(chapterId) },
          { key: 'note-booth', label: 'Open this chapter in Booth', unavailable: noChapter, onSelect: () => goToBooth(chapterId) },
        ];
      },
    };
  }, []);
  useContextProvider(provider);
}
