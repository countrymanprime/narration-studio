import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// The page's own source files, tests, stories and the shared fixtures left out.
const DIR = __dirname;
const sources = readdirSync(DIR)
  .filter((file) => /\.(ts|tsx)$/.test(file) && !/\.(test|stories)\.tsx?$/.test(file) && file !== 'testPage.tsx')
  .map((file) => ({ file, text: readFileSync(join(DIR, file), 'utf8') }));
// Comments may name a DAW to say why; only code and strings may not.
const code = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');

describe('no-daw-name-is-typed', () => {
  it('finds no "REAPER", "Audacity" or "built-in" in the page outside fixtures', () => {
    expect(sources.length).toBeGreaterThan(3);
    for (const { file, text } of sources) expect({ file, hit: code(text).match(/REAPER|Audacity|built-in/i)?.[0] ?? null }).toEqual({ file, hit: null });
  });
});

describe('keys-register-through-the-catalogue', () => {
  it('binds the Booth commands with useCommand and listens for no key itself', () => {
    const page = code(sources.map(({ text }) => text).join('\n'));
    for (const id of [
      'reading.toggle',
      'booth.phrase.next',
      'booth.phrase.prev',
      'booth.word.next',
      'booth.word.prev',
      'booth.roll',
      'booth.view.down',
      'booth.view.up',
      'booth.text.larger',
      'booth.text.smaller',
      'booth.exit',
      'booth.fullscreen',
    ])
      expect(page).toContain(`useCommand('${id}'`);
    expect(page).not.toMatch(/['"]keydown['"]|onKeyDown|\.key\s*===|\.code\s*===/);
  });
});

describe('there-is-no-mirror-text', () => {
  // The mock has no mirrored (flipped) text for a beam-splitter prompter, and the Booth builds nothing the mock lacks (D98).
  it('has no mirror text', () => {
    const booth = join(DIR, '..');
    const surfaces = ['page', 'reading', 'frame'].flatMap((dir) =>
      readdirSync(join(booth, dir))
        .filter((file) => /\.(ts|tsx)$/.test(file) && !/\.(test|stories)\.tsx?$/.test(file))
        .map((file) => ({ file: `${dir}/${file}`, text: code(readFileSync(join(booth, dir, file), 'utf8')) })),
    );
    expect(surfaces.length).toBeGreaterThan(10);
    for (const { file, text } of surfaces)
      expect({ file, hit: text.match(/mirror|scaleX\(\s*-1|scale\(\s*-1|-scale-x-100/i)?.[0] ?? null }).toEqual({ file, hit: null });
  });
});
