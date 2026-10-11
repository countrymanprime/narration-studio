// @vitest-environment node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';

// Studio Next draws a control's own edge with one of two line tokens, and the hairline `--border` only on cards and
// dividers. `--btn-line` is the default button and the checkbox; `--line-strong` is the quiet button, the text input and
// select, the chip, the segmented frame and the dialog frame (mock app.css lines 61-82, 200, 272; cx.ts line 10;
// Checkbox.tsx line 28). Each entry names the edge classes a file must carry and the `--border` dividers it may keep, so a
// new `border-[var(--border)]` on a control edge fails here.
const BTN = 'var(--btn-line)';
const STRONG = 'var(--line-strong)';

const EDGES: Record<string, { carries: string[]; hairlines: number }> = {
  'Button.tsx': {
    carries: [`secondary: 'border-[${BTN}]`, `ghost: 'border-[${STRONG}]`, "primary: 'border-transparent", "danger: 'border-[var(--danger)]"],
    hairlines: 0,
  },
  'Checkbox.tsx': { carries: [`border-2 border-[${BTN}]`, 'data-[checked]:border-[var(--accent)]'], hairlines: 0 },
  'TextField.tsx': { carries: [`border border-[${STRONG}]`], hairlines: 0 },
  'Field.tsx': { carries: [`border border-[${STRONG}]`, 'data-[invalid]:border-[var(--danger)]'], hairlines: 0 },
  'Select.tsx': { carries: [`border border-[${STRONG}]`], hairlines: 0 },
  'Pill.tsx': { carries: [`border-[${STRONG}]`, 'active border-[var(--accent)]'], hairlines: 0 },
  'ToggleGroup.tsx': { carries: [`border border-[${STRONG}]`], hairlines: 0 },
  'TagInput.tsx': { carries: [`1px solid ${STRONG}`, `border-dashed border-[${STRONG}]`], hairlines: 0 },
  'IconButton.tsx': { carries: [`default: 'border-[${STRONG}]`, "primary: 'border-[var(--accent)]", "danger: 'border-[var(--danger)]"], hairlines: 0 },
  // The frame is `--line-strong`; the header and footer dividers inside it stay the hairline.
  'Dialog.tsx': { carries: [`borderColor: '${STRONG}'`, 'border-b border-[var(--border)]', "borderColor: 'var(--border)'"], hairlines: 3 },
};

const read = (file: string) => readFileSync(join(__dirname, file), 'utf8');

describe('control edges draw the mock’s line weights', () => {
  for (const [file, { carries, hairlines }] of Object.entries(EDGES)) {
    test(`${file} pins its line tokens`, () => {
      const source = read(file);
      for (const edge of carries) expect(source).toContain(edge);
      const borders = source.match(/border-\[var\(--border\)\]|borderColor: 'var\(--border\)'/g) ?? [];
      expect(borders).toHaveLength(hairlines);
    });
  }

  test('the checkbox edge is 2 px, the default button’s is 1 px', () => {
    expect(read('Checkbox.tsx')).toContain('border-2');
    expect(read('Button.tsx')).not.toMatch(/border-2/);
  });

  test('a hovered or disabled button keeps its edge', () => {
    expect(read('Button.tsx')).not.toMatch(/(hover|disabled):border-/);
  });
});
