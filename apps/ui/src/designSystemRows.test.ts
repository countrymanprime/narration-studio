// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';

// Every primitive has a row in the "Primitive components" table of `docs/design/design-system.md`. The test reads
// `components/primitives/` and fails for any non-test, non-story `.tsx` file whose component name (the file's name, its main
// export) is not in a backticked cell of the table's first column. Because it reads the folder, a slice that adds a primitive
// while another slice is open fails its own PR until it adds its row there; rows are add-only, so a conflict is mechanical.
//
// A primitive with no row on purpose is named in `NO_ROW` with its reason; the entry is deleted when the row is written.
const NO_ROW: Record<string, string> = {
  ErrorBoundary:
    'a class component that catches render errors and draws a fallback; it has no props a page chooses between and is listed under "What is not wrapped"',
};

const primitivesDir = join(__dirname, 'components', 'primitives');
const docPath = join(__dirname, '..', '..', '..', 'docs', 'design', 'design-system.md');

const primitiveNames = readdirSync(primitivesDir)
  .filter((file) => file.endsWith('.tsx') && !/\.(test|stories)\.tsx$/.test(file))
  .map((file) => file.replace(/\.tsx$/, ''))
  .sort();

/** The names in backticks in the first cell of each row of the "Primitive components" table. */
function tableNames(markdown: string): Set<string> {
  const section = markdown.split(/^## /m).find((part) => part.startsWith('Primitive components'));
  if (!section) throw new Error('design-system.md has no "Primitive components" section');
  const names = new Set<string>();
  for (const line of section.split('\n')) {
    if (!line.startsWith('| `')) continue;
    const firstCell = line.split(' | ')[0];
    for (const match of firstCell.matchAll(/`([A-Za-z0-9]+)`/g)) names.add(match[1]);
  }
  return names;
}

describe('design-system.md primitive rows', () => {
  const rows = tableNames(readFileSync(docPath, 'utf8'));

  test('every-primitive-has-a-row', () => {
    const missing = primitiveNames.filter((name) => !rows.has(name) && !(name in NO_ROW));
    expect(missing, 'add a row to the "Primitive components" table in docs/design/design-system.md').toEqual([]);
  });

  test('no-row-entries-are-needed', () => {
    const stale = Object.keys(NO_ROW).filter((name) => !primitiveNames.includes(name) || rows.has(name));
    expect(stale, 'delete the NO_ROW entry: the file is gone or now has a row').toEqual([]);
  });

  test('the-reader-finds-the-existing-rows', () => {
    expect(rows.has('Dialog')).toBe(true);
    expect(rows.has('Tooltip')).toBe(true);
    expect(rows.has('Panel')).toBe(true);
  });
});
