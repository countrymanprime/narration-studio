import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = join(__dirname, '..', '..');
const isSource = (file: string) => /\.tsx?$/.test(file) && !/\.(test|stories)\.tsx?$/.test(file);
const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : isSource(path) ? [path] : [];
  });
const sources = walk(SRC).map((path) => ({ path: relative(SRC, path), text: readFileSync(path, 'utf8') }));

// The text of each `<Dialog ...>` opening tag: from `<Dialog` to the first `>` outside braces and not part of `=>`. A linear scan,
// because a regular expression for a tag with nested braces backtracks badly.
function dialogTags(text: string): string[] {
  const tags: string[] = [];
  for (let at = text.indexOf('<Dialog'); at >= 0; at = text.indexOf('<Dialog', at + 1)) {
    if (/\w/.test(text[at + '<Dialog'.length] ?? '')) continue;
    let depth = 0;
    let end = at;
    for (; end < text.length; end++) {
      const char = text[end];
      if (char === '{') depth++;
      else if (char === '}') depth--;
      else if (char === '>' && depth === 0 && text[end - 1] !== '=') break;
    }
    tags.push(text.slice(at, end + 1));
  }
  return tags;
}

// Issue 1706 / ADR 0048: whether a press outside a dialog closes it is a decision about what the dialog holds (a form or a
// confirm must survive a stray click, a reference sheet need not), so every Dialog says which. The prop is also required by type;
// this guard names the file when a call site slips through, and covers the specs the overlay service takes.
describe('every dialog declares whether an outside press closes it', () => {
  it('passes dismissOnOutsidePress to every <Dialog> element', () => {
    const missing = sources
      .filter(({ path }) => path !== 'components/primitives/Dialog.tsx')
      .flatMap(({ path, text }) => dialogTags(text).map((tag) => ({ path, tag })))
      .filter(({ tag }) => !tag.includes('dismissOnOutsidePress'));
    expect(missing.map(({ path }) => path)).toEqual([]);
  });

  it('passes dismissOnOutsidePress in every overlay.open({ kind: "dialog" }) spec', () => {
    const missing = sources.flatMap(({ path, text }) =>
      [...text.matchAll(/\.open\(\{\s*kind: 'dialog'[\s\S]*?render:/g)].filter((m) => !m[0].includes('dismissOnOutsidePress')).map(() => path),
    );
    expect(missing).toEqual([]);
  });
});
