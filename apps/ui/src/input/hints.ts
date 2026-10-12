import type { KeyHintItem } from '../components/primitives/KeyHints';
import type { CommandId } from './commands.catalog';
import { serializeGesture, type Gesture } from './gestures';
import type { Keymap } from './keymap';

// A resolved keyboard gesture's `code` is the physical key, not the character it types, so it reads "Slash" rather than
// "?"; this is the one place that turns a code back into a cap a narrator recognises. The sheet, the Settings key list and
// the footers all draw their caps from here (ADR 0780 decision 4: help is derived, not a second list).
const NAMED_CODES: Record<string, string> = {
  ArrowLeft: '←',
  ArrowRight: '→',
  ArrowUp: '↑',
  ArrowDown: '↓',
  BracketLeft: '[',
  BracketRight: ']',
  Slash: '/',
  Equal: '=',
  Minus: '-',
  NumpadAdd: 'Num +',
  NumpadSubtract: 'Num -',
  Space: 'Space',
  BrowserBack: 'Browser Back',
  BrowserForward: 'Browser Forward',
  PageUp: 'Page Up',
  PageDown: 'Page Down',
};

export function codeLabel(code: string): string {
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad') && code.length === 7) return `Num ${code.slice(6)}`;
  return NAMED_CODES[code] ?? code;
}

/** The caps for one gesture, modifiers first, named as `KeyChord` knows them. A MIDI or HID gesture has no key caps to
 * draw, so it falls back to its serialised form rather than pretending to be a keyboard chord. */
export function gestureKeys(gesture: Gesture): string[] {
  if (gesture.source !== 'keyboard') return [serializeGesture(gesture)];
  return [...gesture.modifiers, codeLabel(gesture.code)];
}

/** A fact about the screen that decides whether a conditional hint shows. */
type FooterCondition = 'pickupSession';

/**
 * One footer's hints: the command whose first gesture is drawn, any `with` commands whose caps follow it in one chord
 * ("↑ ↓"), and the short word beside them. A `when` hint shows only while that condition is active.
 */
export type FooterSpec = readonly { id: CommandId; with?: readonly CommandId[]; label: string; when?: FooterCondition }[];

/** A hint that is not a key ("Right-click"), drawn right after the hint of the command it names. */
type FooterExtra = readonly { after: CommandId; keys: string[]; label: string }[];

export type FooterSurface = 'booth';

/**
 * The footers' specs, in the order of the mock's key hints. A spec may name only an id the catalogue has (`hints.test.ts`
 * fails otherwise), so the Proof and Editing footers join this table in the slices that add their commands.
 */
export const FOOTER_SPECS: Record<FooterSurface, FooterSpec> = {
  booth: [
    { id: 'reading.toggle', label: 'Record / stop' },
    { id: 'booth.roll', label: 'Punch and roll from here' },
    { id: 'booth.phrase.prev', with: ['booth.phrase.next'], label: 'Phrase' },
    { id: 'booth.word.prev', with: ['booth.word.next'], label: 'Word' },
    { id: 'bookmark.here', label: 'Bookmark' },
    { id: 'bookmark.prev', with: ['bookmark.next'], label: 'Bookmarks' },
    { id: 'booth.pickup.next', label: 'Next pickup', when: 'pickupSession' },
    { id: 'booth.fullscreen', label: 'Full screen' },
    { id: 'booth.exit', label: 'Exit' },
  ],
};

const FOOTER_EXTRAS: Record<FooterSurface, FooterExtra> = {
  booth: [{ after: 'booth.roll', keys: ['Right-click'], label: 'Start from here' }],
};

/** The caps of commands drawn as one chord. A key that carries the same modifiers as the one before is drawn without them ("Alt [ ]", not "Alt [ Alt ]"). */
function chordKeys(gestures: readonly Gesture[]): string[] {
  return gestures.flatMap((gesture, i) => {
    const keys = gestureKeys(gesture);
    const before = gestures[i - 1];
    if (!before || gesture.source !== 'keyboard' || before.source !== 'keyboard') return keys;
    const same = gesture.modifiers.length === before.modifiers.length && gesture.modifiers.every((modifier, k) => modifier === before.modifiers[k]);
    return same ? keys.slice(gesture.modifiers.length) : keys;
  });
}

/**
 * `KeyHints` props for one footer from the narrator's keymap: the first gesture of each command in spec order. A command
 * with no gesture is left out, not drawn as an empty cap. `spec` and `extra` default to the surface's own; a test passes
 * others. `active` holds the conditions that are true now, so a `when` hint shows only while its condition is in it.
 */
export function footerHints(
  surface: FooterSurface,
  keymap: Keymap,
  spec: FooterSpec = FOOTER_SPECS[surface],
  extra: FooterExtra = FOOTER_EXTRAS[surface],
  active: ReadonlySet<FooterCondition> = new Set(),
): KeyHintItem[] {
  const hints: KeyHintItem[] = [];
  for (const { id, with: more = [], label, when } of spec) {
    if (when && !active.has(when)) continue;
    const gestures = [id, ...more].map((commandId) => keymap[commandId]?.[0]);
    if (gestures.every((gesture) => gesture)) {
      hints.push({ keys: chordKeys(gestures as Gesture[]), label, id: `hint-${id}` });
    }
    for (const hint of extra) if (hint.after === id) hints.push({ keys: hint.keys, label: hint.label });
  }
  return hints;
}
