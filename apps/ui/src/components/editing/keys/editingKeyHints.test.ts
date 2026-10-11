import { describe, expect, it } from 'vitest';
import { COMMAND_CATALOG } from '../../../input/commands.catalog';
import { gesture } from '../../../input/gestures';
import { defaultKeymap } from '../../../input/keymap';
import { EDITING_FOOTER_SPEC, editingKeyHints } from './editingKeyHints';

describe('key-hints-footer', () => {
  const keymap = defaultKeymap(COMMAND_CATALOG, false);

  it('names only commands the catalogue has', () => {
    const ids = new Set(COMMAND_CATALOG.map((c) => c.id));
    for (const { id, with: more = [] } of EDITING_FOOTER_SPEC) for (const x of [id, ...more]) expect(ids.has(x), x).toBe(true);
  });

  it('is built from the default keymap, in the order of the mock', () => {
    expect(editingKeyHints(keymap).map((h) => [h.keys, h.label])).toEqual([
      [['Space'], 'Play from here'],
      [['←', '→'], 'Word'],
      [['Shift', '←', '→'], 'Select words'],
      [['Delete'], 'Delete words and audio'],
      [['F'], 'Add FX'],
      [['T'], 'Takes'],
      [['Enter'], 'Keep take'],
      [['H'], 'Hide others'],
      [['S'], 'Timeline'],
      [['Esc'], 'Clear'],
    ]);
  });

  it('a rebound key shows its new gesture, and a command with no gesture leaves its hint out', () => {
    const rebound = { ...keymap, 'editing.fx': [gesture('keyboard', 'KeyX', ['Alt'])], 'editing.strip': [] };
    const hints = editingKeyHints(rebound);
    expect(hints.find((h) => h.label === 'Add FX')?.keys).toEqual(['Alt', 'X']);
    expect(hints.some((h) => h.label === 'Timeline')).toBe(false);
  });
});
