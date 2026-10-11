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

/** One footer's hints: which commands it reminds, in which order, and the short word beside each cap. */
export type FooterSpec = readonly { id: CommandId; label: string }[];

export type FooterSurface = 'booth';

/**
 * The footers' specs. A spec may name only an id the catalogue has (`hints.test.ts` fails otherwise), so the Proof and
 * Editing footers join this table in the slices that add their commands.
 */
export const FOOTER_SPECS: Record<FooterSurface, FooterSpec> = {
  booth: [
    { id: 'reading.toggle', label: 'Play or pause' },
    { id: 'booth.fullscreen', label: 'Full screen' },
  ],
};

/**
 * `KeyHints` props for one footer from the narrator's keymap: the first gesture of each command in spec order. A command
 * with no gesture is left out, not drawn as an empty cap. `spec` defaults to the surface's own; a test passes another.
 */
export function footerHints(surface: FooterSurface, keymap: Keymap, spec: FooterSpec = FOOTER_SPECS[surface]): KeyHintItem[] {
  const hints: KeyHintItem[] = [];
  for (const { id, label } of spec) {
    const gesture = keymap[id]?.[0];
    if (gesture) hints.push({ keys: gestureKeys(gesture), label, id: `hint-${id}` });
  }
  return hints;
}
