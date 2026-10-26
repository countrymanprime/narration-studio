// @vitest-environment node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';

// One-line controls on one row share one height (alignment audit rule A6, cause C): a select at 40.8px beside a 36px text box
// and button looked misaligned on every page that set them side by side. The height is one token, and it is the button's.
const read = (file: string) => readFileSync(join(__dirname, file), 'utf8');
const styles = readFileSync(join(__dirname, '../../styles.css'), 'utf8');

describe('one control height', () => {
  test('--control-height is the button height, and the small one the small button height', () => {
    expect(styles).toMatch(/--control-height: var\(--button-height\);/);
    expect(styles).toMatch(/--control-height-sm: var\(--button-height-sm\);/);
  });

  // Each one-line control takes its height from the token, never a literal of its own.
  for (const file of ['Select.tsx', 'TextField.tsx', 'DateField.tsx', 'Field.tsx']) {
    test(`${file} uses --control-height`, () => {
      const source = read(file);
      expect(source).toContain('h-[var(--control-height)]');
      expect(source).not.toMatch(/\bh-(8|9|10)\b|2\.55rem|py-\[0\.6rem\] \$\{CONTROL|min-h-\[var\(--control-height\)\]/);
    });
  }
});
