import type { KeyHintItem } from '../../primitives/KeyHints';
import type { CommandId } from '../../../input/commands.catalog';
import { gestureKeys } from '../../../input/hints';
import type { Keymap } from '../../../input/keymap';

/** One hint of the footer: the command whose first gesture is drawn, the commands whose caps join it in one chord, and the word beside them. */
type HintSpec = { id: CommandId; with?: readonly CommandId[]; label: string };

/** The Editing footer in the order of the mock's key hints. Only ids; the caps come from the narrator's keymap. */
export const EDITING_FOOTER_SPEC: readonly HintSpec[] = [
  { id: 'workspace.play', label: 'Play from here' },
  { id: 'workspace.word.prev', with: ['workspace.word.next'], label: 'Word' },
  { id: 'editing.word.extend.prev', with: ['editing.word.extend.next'], label: 'Select words' },
  { id: 'editing.delete', label: 'Delete words and audio' },
  { id: 'editing.fx', label: 'Add FX' },
  { id: 'editing.takes.next', label: 'Takes' },
  { id: 'editing.keep', label: 'Keep take' },
  { id: 'editing.hide-others', label: 'Hide others' },
  { id: 'editing.strip', label: 'Timeline' },
  { id: 'editing.escape', label: 'Clear' },
];

/** The commands the edit-off notice says are off (Delete, Mute and Add FX); Mute has no hint. */
const EDIT_OFF: ReadonlySet<CommandId> = new Set<CommandId>(['editing.delete', 'editing.fx']);

/** The footer without the hints of commands that are off, so the hints never offer what the notice above them says is off (R4TA-8). */
export function editOffHints(spec: readonly HintSpec[], off: boolean): HintSpec[] {
  return off ? spec.filter((hint) => !EDIT_OFF.has(hint.id)) : [...spec];
}

/**
 * What Enter does now, for its hint: it keeps the take the keys are on once T has opened the takes, opens the card on a flagged word, and
 * otherwise keeps the line's active take, so the hint points at T for choosing.
 */
export function enterHintLabel({ takesOpen, onFlag }: { takesOpen: boolean; onFlag: boolean }): string {
  if (takesOpen) return 'Keep take';
  return onFlag ? 'Open flag card' : 'Keep take (T picks which)';
}

/** "Escape" is drawn "Esc", as the mock draws it. */
const cap = (key: string): string => (key === 'Escape' ? 'Esc' : key);

/**
 * The footer's hints from the narrator's keymap: the first gesture of each command, so a rebound key shows its new gesture. A chord of two
 * commands that share modifiers draws them once ("Shift ← →"). A command with no gesture leaves its hint out.
 */
export function editingKeyHints(keymap: Keymap, spec: readonly HintSpec[] = EDITING_FOOTER_SPEC): KeyHintItem[] {
  const hints: KeyHintItem[] = [];
  for (const { id, with: more = [], label } of spec) {
    const gestures = [id, ...more].map((commandId) => keymap[commandId]?.[0]);
    if (!gestures.every(Boolean)) continue;
    const [first, ...rest] = gestures.map((gesture) => gestureKeys(gesture!));
    const keys = [...first];
    for (const next of rest) {
      const shared = next.filter((k, i) => i < next.length - 1 && first.includes(k));
      keys.push(...next.filter((k) => !shared.includes(k)));
    }
    hints.push({ keys: keys.map(cap), label, id: `hint-${id}` });
  }
  return hints;
}
