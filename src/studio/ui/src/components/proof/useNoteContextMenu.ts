import { useMemo, useRef } from 'react';
import { addMarkersLabel } from '../engine/AddMarkers';
import type { Finding } from '../../api/contracts/findings';
import { useContextProvider } from '../../registries/context';
import { HEAR_LABEL, STOP_HEARING_LABEL } from './inspector/HearIt';
import { TRIM_LABEL, trimmableGap } from './inspector/TrimGap';
import { DECISIONS, press } from './useProofKeys';

/** The Inspector's button whose name starts `prefix` ("Show in ", "Add marker in "): the menu says what it says and is off for the reason it is off (#2826, #2830). */
const inspectorButton = (prefix: string): HTMLButtonElement | null =>
  document.querySelector<HTMLButtonElement>(`aside[aria-label="Note"] button[aria-label^="${prefix}"]`);
const SHOW_IN = 'Show in ';
const ADD_MARKER = 'Add marker in ';
const dawShown = (prefix: string): string => inspectorButton(prefix)?.getAttribute('aria-label')?.slice(prefix.length) ?? 'the DAW';

/** Why that Inspector button is off, in its own words, or undefined while it is on. */
const offReason = (prefix: string): string | undefined => {
  const button = inspectorButton(prefix);
  if (button?.getAttribute('aria-disabled') !== 'true' && !button?.disabled) return undefined;
  const reason = document.getElementById(button?.getAttribute('aria-describedby') ?? '')?.textContent;
  return reason || 'The DAW cannot do this for this note now.';
};

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
 * The right-click menu of a note on Proof (mock `registerContext` for the Proof page): hear it, decide it, reopen it, go to it in the
 * DAW, trim a gap note's gap, or open its chapter in Script or the Booth. Hear it, the decisions, the DAW action and the trim press the
 * Inspector's own controls, so the stale-evidence guard and the DAW's capability apply to the menu as they do to the buttons.
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
          { key: 'note-hear', label: HEAR_LABEL, onSelect: () => press(HEAR_LABEL, STOP_HEARING_LABEL) },
          { key: 'note-pickup', label: 'Needs pickup', onSelect: () => press(DECISIONS.pickup) },
          { key: 'note-edit', label: 'Fix in edit', onSelect: () => press(DECISIONS.edit) },
          { key: 'note-waive', label: DECISIONS.waive, onSelect: () => press(DECISIONS.waive) },
          { key: 'note-defer', label: 'Defer', onSelect: () => press(DECISIONS.defer) },
          { key: 'note-reopen', label: 'Reopen', unavailable: decided ? undefined : 'Not decided yet.', onSelect: () => press('Reopen') },
          { key: 'note-goto', label: `Show in ${dawShown(SHOW_IN)}`, unavailable: offReason(SHOW_IN), onSelect: () => press(SHOW_IN) },
          {
            key: 'note-marker',
            label: addMarkersLabel(dawShown(ADD_MARKER), { kind: 'finding', id: note.id }),
            unavailable: offReason(ADD_MARKER),
            onSelect: () => press(ADD_MARKER),
          },
          ...(trimmableGap(note) ? [{ key: 'note-trim', label: TRIM_LABEL, onSelect: () => press(TRIM_LABEL) }] : []),
          { key: 'note-script', label: 'Open this chapter in Script', unavailable: noChapter, onSelect: () => goToScript(chapterId) },
          { key: 'note-booth', label: 'Open this chapter in Booth', unavailable: noChapter, onSelect: () => goToBooth(chapterId) },
        ];
      },
    };
  }, []);
  useContextProvider(provider);
}
