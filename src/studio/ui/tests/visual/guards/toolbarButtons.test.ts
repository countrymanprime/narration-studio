import { describe, expect, it } from 'vitest';
import { TOOLBAR_TEXT_BUTTONS } from './toolbar-text-buttons-allowlist';
import { toolbarTextButtons } from './toolbarButtons';

// A toolbar or ribbon holds icon buttons with a tooltip and an aria-label, not words (owner rule: if the narrator can't tell from the
// icon and its tooltip, the icon is wrong). Held over the whole app the way inFlowProse.test.ts holds prose.
describe('text buttons in a toolbar', () => {
  const found = toolbarTextButtons().map((b) => `${b.file} | ${b.text}`);

  it('adds none beyond the allowlist', () => {
    expect(
      found.filter((k) => !TOOLBAR_TEXT_BUTTONS.includes(k)),
      'Use an IconButton with a tooltip and an aria-label. Allowlist only a button whose meaning no icon can carry, with the owner’s say-so.',
    ).toEqual([]);
  });

  it('lists nothing that is gone', () => {
    expect(
      TOOLBAR_TEXT_BUTTONS.filter((k) => !found.includes(k)),
      'Remove these from toolbar-text-buttons-allowlist.ts.',
    ).toEqual([]);
  });
});
