// @vitest-environment node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';

// Studio Next draws a floating surface and a key picture with `--line-strong`; the rows inside a surface and the
// footer's top rule stay the hairline `--border` (mock app.css lines 31, 179, 259, 537). The cap fill stays
// `--surface-2`: the mock's `--raised` has no token here and `--surface-2` is its role equivalent. Each entry names the
// edge classes a file must carry and the ones it must not.
const FRAME = 'border-[var(--line-strong)]';
const HAIRLINE = 'border-[var(--border)]';

const EDGES: Record<string, { strong: string[]; hairline: string[] }> = {
  'Popover.tsx': { strong: [`border ${FRAME}`], hairline: [] },
  'Menu.tsx': { strong: [`border ${FRAME}`], hairline: [] },
  'ContextMenu.tsx': { strong: [`border ${FRAME}`], hairline: [] },
  'Listbox.tsx': { strong: [`border ${FRAME}`], hairline: [`border-t ${HAIRLINE}`] },
  'Kbd.tsx': { strong: [`border-b-2 ${FRAME}`], hairline: [] },
  'KeyCap.tsx': { strong: [`border-b-2 ${FRAME}`], hairline: [] },
  'KeyHints.tsx': { strong: [], hairline: [`border-t ${HAIRLINE}`] },
};

const read = (file: string) => readFileSync(join(__dirname, file), 'utf8');

describe('floating surfaces and key pictures draw --line-strong', () => {
  for (const [file, { strong, hairline }] of Object.entries(EDGES)) {
    test(`${file} pins its line tokens`, () => {
      const source = read(file);
      for (const edge of strong) expect(source).toContain(edge);
      for (const edge of hairline) expect(source).toContain(edge);
      // A frame or a cap never falls back to `--border`: the only `--border` left is a divider the entry names.
      const borders = source.match(/border[a-z0-9-]*\s+border-\[var\(--border\)\]|border-\[var\(--border\)\]/g) ?? [];
      expect(borders).toHaveLength(hairline.length);
    });
  }
});
