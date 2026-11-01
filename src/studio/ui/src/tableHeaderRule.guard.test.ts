// Owner rule 5 (#2641): every table header goes through `TableHeader` (or `StageGrid`), which centres it. A page never sets a header's
// alignment, and no page draws its own `<th scope="col">`.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.tsx$/.test(name) && !/\.(test|stories)\.tsx$/.test(name) ? [path] : [];
  });
}

describe('table headers', () => {
  const files = sources(join(__dirname, 'components')).map((path) => ({ path, text: readFileSync(path, 'utf8') }));

  it('never take an align prop', () => {
    const offenders = files.filter(({ text }) => /<TableHeader\b[^>]*\balign=/.test(text)).map(({ path }) => path);
    expect(offenders).toEqual([]);
  });

  it('are never a hand-drawn column header', () => {
    const offenders = files
      .filter(({ path }) => !/primitives\/(Table|StageGrid)\.tsx$/.test(path))
      .filter(({ text }) => /<th\b[^>]*scope="col"/.test(text))
      .map(({ path }) => path);
    expect(offenders).toEqual([]);
  });
});
