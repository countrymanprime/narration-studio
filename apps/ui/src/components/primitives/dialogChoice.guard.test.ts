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

// Issue 1706 / ADR 0048: whether a press outside a dialog closes it is a decision about what the dialog holds (a form or a
// confirm must survive a stray click, a reference sheet need not), so every Dialog says which. The prop is also required by type;
// this guard names the file when a call site slips through, and covers the specs the overlay service takes.
describe('every dialog declares whether an outside press closes it', () => {
  it('passes dismissOnOutsidePress to every <Dialog> element', () => {
    const missing = sources
      .filter(({ path }) => path !== 'components/primitives/Dialog.tsx')
      .flatMap(({ path, text }) => [...text.matchAll(/<Dialog\b([^>]*(?:=>[^>]*|\{[^}]*\}[^>]*)*)>/gs)].map((m) => ({ path, tag: m[0] })))
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
