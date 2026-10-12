// The key hints under the Script reader: the mock's `Legend.tsx`, drawn by the shared footer (`KeyHints`, ADR 0761) from the narrator's
// keymap, so a rebound key shows its new gesture and a command with no gesture leaves its hint out.

import type { CommandId } from '../../../../input/commands.catalog';
import { gestureKeys } from '../../../../input/hints';
import type { Keymap } from '../../../../input/keymap';
import type { KeyHintItem } from '../../../primitives/KeyHints';

type HintSpec = { id: CommandId; with?: readonly CommandId[]; label: string };

/** What the footer says first: the selection tools, which no key opens. */
const SELECT_HINT = 'Select text to mark it, add a note or query, or look it up.';

/** The reader's own scrolling is the browser's, so no command holds these two caps. */
const SCROLL_HINT: KeyHintItem = { keys: ['↑', '↓'], label: 'scroll' };

/** The commands after the scroll hint, in the mock's order. */
export const SCRIPT_FOOTER_SPEC: readonly HintSpec[] = [
  { id: 'script.prep.prev', with: ['script.prep.next'], label: 'prep state' },
  { id: 'editing.chapter.prev', with: ['editing.chapter.next'], label: 'chapter' },
  { id: 'bookmark.here', label: 'bookmark' },
  { id: 'bookmark.prev', with: ['bookmark.next'], label: 'bookmarks' },
  { id: 'script.find', label: 'find' },
];

/** The caps of commands drawn as one chord: a key with the modifiers of the one before is drawn without them ("Alt [ ]"). Null when a command has no gesture. */
function chord(commandIds: readonly CommandId[], keymap: Keymap): string[] | null {
  const gestures = commandIds.map((id) => keymap[id]?.[0]);
  if (!gestures.every(Boolean)) return null;
  const rows = gestures.map((gesture) => gestureKeys(gesture!));
  return rows.flatMap((keys, i) => {
    const modifiers = keys.slice(0, -1);
    const before = rows[i - 1]?.slice(0, -1);
    return before && modifiers.length === before.length && modifiers.every((key, k) => key === before[k]) ? keys.slice(-1) : keys;
  });
}

/** The footer's hints from the narrator's keymap. */
export function scriptKeyHints(keymap: Keymap): KeyHintItem[] {
  const hints: KeyHintItem[] = [{ keys: [], label: SELECT_HINT }, SCROLL_HINT];
  for (const { id, with: more = [], label } of SCRIPT_FOOTER_SPEC) {
    const keys = chord([id, ...more], keymap);
    if (keys) hints.push({ keys, label, id: `hint-${id}` });
  }
  return hints;
}
