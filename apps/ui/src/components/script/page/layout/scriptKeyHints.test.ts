import { describe, expect, it } from 'vitest';
import { COMMAND_CATALOG } from '../../../../input/commands.catalog';
import { gesture } from '../../../../input/gestures';
import { defaultKeymap } from '../../../../input/keymap';
import { SCRIPT_FOOTER_SPEC, scriptKeyHints } from './scriptKeyHints';

describe('the key hints under the Script reader', () => {
  const keymap = defaultKeymap(COMMAND_CATALOG, false);

  it('names only commands the catalogue has', () => {
    const ids = new Set(COMMAND_CATALOG.map((command) => command.id));
    for (const { id, with: more = [] } of SCRIPT_FOOTER_SPEC) for (const named of [id, ...more]) expect(ids.has(named), named).toBe(true);
  });

  it("are the mock Legend's, in its order, with the caps from the keymap", () => {
    expect(scriptKeyHints(keymap).map((hint) => [hint.keys, hint.label])).toEqual([
      [[], 'Select text to mark it, add a note or query, or look it up.'],
      [['↑', '↓'], 'scroll'],
      [['←', '→'], 'prep state'],
      [['Alt', '↑', '↓'], 'chapter'],
      [['B'], 'bookmark'],
      [['Alt', '[', ']'], 'bookmarks'],
      [['Ctrl', 'F'], 'find'],
    ]);
  });

  it('a rebound key shows its new gesture, and a command with no gesture leaves its hint out', () => {
    const rebound = { ...keymap, 'bookmark.here': [gesture('keyboard', 'KeyM')], 'script.find': [] };
    const hints = scriptKeyHints(rebound);
    expect(hints.find((hint) => hint.label === 'bookmark')?.keys).toEqual(['M']);
    expect(hints.some((hint) => hint.label === 'find')).toBe(false);
  });
});
