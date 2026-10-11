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
      for (const { id } of spec) expect(findCommand(id), `${surface} footer names "${id}"`).toBeDefined();
    }
  });

  it('the Booth footer lists the booth-scope commands that exist, in spec order, from the keymap', () => {
    expect(footerHints('booth', keymap)).toEqual([
      { keys: ['Space'], label: 'Play or pause', id: 'hint-reading.toggle' },
      { keys: ['F11'], label: 'Full screen', id: 'hint-booth.fullscreen' },
    ]);
  });

  it("draws the narrator's gesture, not the default, once the keymap is remapped", () => {
    const remapped = { ...keymap, 'booth.fullscreen': [gesture('keyboard', 'KeyF', ['Ctrl'])] };
    expect(footerHints('booth', remapped).map((hint) => hint.keys)).toEqual([['Space'], ['Ctrl', 'F']]);
  });

  it('unbound-command-drops-out-of-a-footer: a command with no gesture is omitted, not drawn empty', () => {
    const unbound = { ...keymap, 'reading.toggle': [] };
    expect(footerHints('booth', unbound)).toEqual([{ keys: ['F11'], label: 'Full screen', id: 'hint-booth.fullscreen' }]);
  });

  it('a spec naming an id that is not in the catalogue is caught by the catalogue check', () => {
    const spec = [{ id: 'no.such.command', label: 'Nope' }];
    expect(spec.filter(({ id }) => !findCommand(id))).toHaveLength(1);
    expect(footerHints('booth', keymap, spec)).toEqual([]);
  });
});
