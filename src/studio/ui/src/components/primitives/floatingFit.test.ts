// @vitest-environment node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';

// A floating surface is fully on screen (definition of done, rule 1, "Overlays"): a menu or popover whose content is taller than the
// room Base UI leaves it caps its height at the positioner's `--available-height` and scrolls, and the navigation drawer scrolls when
// the window is shorter than the list. The Playwright overlay guard (tests/visual/overlays.spec.ts) proves it in a browser; this pins
// the classes that do it, so a restyle cannot drop one unseen.
const read = (file: string) => readFileSync(join(__dirname, file), 'utf8');

describe('floating surfaces fit the window', () => {
  for (const file of ['Menu.tsx', 'ContextMenu.tsx', 'Popover.tsx', 'ChapterStepper.tsx']) {
    test(`${file} caps its popup at the room the positioner leaves`, () => {
      expect(read(file)).toMatch(/max-h-\[(?:min\([^\]]*,)?var\(--available-height\)\)?\]/);
      expect(read(file)).toContain('overflow-y-auto');
    });
  }

  test('NavDrawer.tsx scrolls its panel when the window is shorter than the list', () => {
    expect(read('NavDrawer.tsx')).toContain('overflow-y-auto');
  });
});
