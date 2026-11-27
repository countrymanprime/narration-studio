// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Class guard for #4100: a chapter that "counts" is asked of `isNarrationChapter` (an older manuscript leaves its content kind out, and that is narration),
// through `isNumberedChapter` for the chapters the book numbers. A hand-written `kind === 'narration'` here counted no chapters in such a book.
describe('the Schedule asks which chapters count in one place', () => {
  it('has no hand-written narration kind check under components/schedule', () => {
    const sources = readdirSync(__dirname).filter((f) => /\.(ts|tsx)$/.test(f) && !/\.(test|stories)\./.test(f));
    const offenders = sources.filter((f) => /kind\s*[!=]==?\s*'narration'/.test(readFileSync(join(__dirname, f), 'utf8')));
    expect(offenders).toEqual([]);
  });
});
