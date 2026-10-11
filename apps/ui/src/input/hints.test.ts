import { describe, expect, it } from 'vitest';
import { COMMAND_CATALOG, findCommand } from './commands.catalog';
import { gesture } from './gestures';
import { codeLabel, FOOTER_SPECS, footerHints, gestureKeys } from './hints';
import { defaultKeymap } from './keymap';

describe('codeLabel', () => {
  it('strips the Key/Digit prefix a letter or number code carries', () => {
    expect(codeLabel('KeyR')).toBe('R');
    expect(codeLabel('Digit7')).toBe('7');
  });

  it('names an arrow, bracket, page and browser-navigation code', () => {
    expect(codeLabel('ArrowLeft')).toBe('←');
    expect(codeLabel('BracketRight')).toBe(']');
    expect(codeLabel('PageDown')).toBe('Page Down');
    expect(codeLabel('BrowserForward')).toBe('Browser Forward');
  });

  it('names the zoom keys a narrator reads on the cap', () => {
    expect(codeLabel('Equal')).toBe('=');
    expect(codeLabel('NumpadAdd')).toBe('Num +');
    expect(codeLabel('Numpad0')).toBe('Num 0');
  });

  it('falls back to the raw code for one it does not know', () => {
    expect(codeLabel('F13')).toBe('F13');
  });
});

describe('gestureKeys', () => {
  it("puts a keyboard gesture's modifiers before its key", () => {
    expect(gestureKeys(gesture('keyboard', 'KeyS', ['Ctrl']))).toEqual(['Ctrl', 'S']);
  });

  it('falls back to the serialised gesture for a source with no key caps (MIDI, HID)', () => {
    expect(gestureKeys(gesture('midi', 'cc/1/64'))).toEqual(['midi:cc/1/64']);
  });
});

describe('footerHints', () => {
  const keymap = defaultKeymap(COMMAND_CATALOG, false);

  it('footer-specs-name-real-commands: every id in every spec is a catalogue row', () => {
    for (const [surface, spec] of Object.entries(FOOTER_SPECS)) {
      for (const id of spec.flatMap((hint) => [hint.id, ...(hint.with ?? [])])) expect(findCommand(id), `${surface} footer names "${id}"`).toBeDefined();
    }
  });

  it('footer-spec-is-the-mocks: the Booth footer follows the mock, from the keymap, with pickups off', () => {
    expect(footerHints('booth', keymap)).toEqual([
      { keys: ['Space'], label: 'Record / stop', id: 'hint-reading.toggle' },
      { keys: ['R'], label: 'Punch and roll from here', id: 'hint-booth.roll' },
      { keys: ['Right-click'], label: 'Start from here' },
      { keys: ['↑', '↓'], label: 'Phrase', id: 'hint-booth.phrase.prev' },
      { keys: ['←', '→'], label: 'Word', id: 'hint-booth.word.prev' },
      { keys: ['F11'], label: 'Full screen', id: 'hint-booth.fullscreen' },
      { keys: ['Escape'], label: 'Exit', id: 'hint-booth.exit' },
    ]);
  });

  it('the-pickup-hint-is-conditional: "Next pickup" shows only while a pickup session is active', () => {
    expect(footerHints('booth', keymap).map((hint) => hint.label)).not.toContain('Next pickup');
    const withPickups = footerHints('booth', keymap, undefined, undefined, new Set(['pickupSession' as const]));
    expect(withPickups.map((hint) => hint.label)).toContain('Next pickup');
    expect(withPickups.find((hint) => hint.label === 'Next pickup')?.keys).toEqual(['N']);
  });

  it('non-key-hints-are-extra: an extra hint follows the hint it names and carries no command id', () => {
    const spec = [
      { id: 'booth.roll', label: 'Roll' },
      { id: 'booth.exit', label: 'Exit' },
    ];
    expect(footerHints('booth', keymap, spec, [{ after: 'booth.roll', keys: ['Right-click'], label: 'Start from here' }])).toEqual([
      { keys: ['R'], label: 'Roll', id: 'hint-booth.roll' },
      { keys: ['Right-click'], label: 'Start from here' },
      { keys: ['Escape'], label: 'Exit', id: 'hint-booth.exit' },
    ]);
  });

  it("remapped-keys-show-in-the-footer: the cap follows the narrator's keymap", () => {
    const remapped = { ...keymap, 'booth.roll': [gesture('keyboard', 'KeyG', ['Ctrl'])], 'booth.fullscreen': [gesture('keyboard', 'KeyF', ['Ctrl'])] };
    const hints = footerHints('booth', remapped);
    expect(hints.find((hint) => hint.id === 'hint-booth.roll')?.keys).toEqual(['Ctrl', 'G']);
    expect(hints.find((hint) => hint.id === 'hint-booth.fullscreen')?.keys).toEqual(['Ctrl', 'F']);
  });

  it('unbound-command-drops-out-of-a-footer: a command with no gesture is omitted, not drawn empty', () => {
    const unbound = { ...keymap, 'reading.toggle': [], 'booth.phrase.next': [] };
    const labels = footerHints('booth', unbound).map((hint) => hint.label);
    expect(labels).not.toContain('Record / stop');
    expect(labels).not.toContain('Phrase');
    expect(labels).toContain('Word');
  });

  it('a spec naming an id that is not in the catalogue is caught by the catalogue check', () => {
    const spec = [{ id: 'no.such.command', label: 'Nope' }];
    expect(spec.filter(({ id }) => !findCommand(id))).toHaveLength(1);
    expect(footerHints('booth', keymap, spec, [])).toEqual([]);
  });
});
