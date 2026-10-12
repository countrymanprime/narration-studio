import { useCallback } from 'react';
import { useCommandProvider } from '../../input/commandProviders';
import { useCommand } from '../../input/useCommand';

/** The Inspector's decision buttons by name: a key presses the button, so the stale-evidence guard and the toast are the button's own. */
export const DECISIONS = { pickup: 'Needs pickup', edit: 'Fix in edit', waive: 'Waive', defer: 'Defer' } as const;

/** A dialog, menu or popover is showing: Escape is theirs. */
const layerOpen = () => document.querySelector('[role="dialog"], [role="alertdialog"], [role="menu"]') !== null;

/** Presses the Inspector's control that is named `name` (its text or its label), unless it is off. */
export function press(name: string): void {
  const inspector = document.querySelector('aside[aria-label="Note"]');
  const button = [...(inspector?.querySelectorAll<HTMLButtonElement>('button') ?? [])].find(
    (b) => b.getAttribute('aria-label') === name || b.textContent?.startsWith(name),
  );
  if (button && !button.disabled && button.getAttribute('aria-disabled') !== 'true') button.click();
}

/** The notes panel steps its own rows while focus is in it; the page's keys step only from elsewhere, so a key never moves twice. */
const inNotes = (target: EventTarget | null) => target instanceof Element && target.closest('section[aria-label="Notes"]') !== null;

/**
 * Proof's keys as catalogue commands (mock `registerKeys('proof')`): Up and Down (J and K) move through the notes, Left and Right step
 * the chapter, P E W D decide the selected note, Escape goes back to All chapters, and Ctrl+F is find in notes. Registered while the
 * page is mounted, so the footer, the shortcut sheet and Settings show them from the catalogue.
 */
export function useProofKeys({
  order,
  selectedId,
  select,
  step,
  allChapters,
  toAllChapters,
}: {
  order: readonly string[];
  selectedId: string | null;
  select: (id: string) => void;
  step: (direction: -1 | 1) => void;
  allChapters: boolean;
  toAllChapters: () => void;
}): void {
  const move = (delta: -1 | 1, target: EventTarget | null) => {
    if (inNotes(target) || order.length === 0) return;
    const at = selectedId === null ? -1 : order.indexOf(selectedId);
    const next = order[at < 0 ? (delta > 0 ? 0 : order.length - 1) : Math.min(order.length - 1, Math.max(0, at + delta))];
    if (next !== undefined) select(next);
  };
  useCommand('proof.note.next', ({ target }) => move(1, target));
  useCommand('proof.note.prev', ({ target }) => move(-1, target));
  useCommand('proof.chapter.next', () => step(1));
  useCommand('proof.chapter.prev', () => step(-1));
  useCommand('proof.decide.pickup', () => press(DECISIONS.pickup), selectedId !== null);
  useCommand('proof.decide.edit', () => press(DECISIONS.edit), selectedId !== null);
  useCommand('proof.decide.waive', () => press(DECISIONS.waive), selectedId !== null);
  useCommand('proof.decide.defer', () => press(DECISIONS.defer), selectedId !== null);
  useCommand(
    'proof.escape',
    () => {
      if (!layerOpen()) toAllChapters();
    },
    !allChapters,
  );
  // The notes panel opens find in notes on Ctrl+F itself; this row only keeps the key from opening the jump menu on Proof.
  useCommand('proof.find', () => {});
  // The jump menu offers the chapter steps with their keys while Proof is showing (mock `registerCommands`).
  useCommandProvider(
    useCallback(
      () => [
        { id: 'proof.jump.chapter.next', group: 'Proof', label: 'Next chapter', hint: '→', run: () => step(1) },
        { id: 'proof.jump.chapter.prev', group: 'Proof', label: 'Previous chapter', hint: '←', run: () => step(-1) },
      ],
      [step],
    ),
  );
}
