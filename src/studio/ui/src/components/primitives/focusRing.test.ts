import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// The Studio Next mock draws one keyboard focus ring, `:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px }`,
// and components.css carries it as the global rule. A primitive that names its own outline beats that rule, so these tests
// pin which primitives may style focus themselves. jsdom does not resolve the cascade, so each check reads class strings.

const DIR = __dirname;
const sources = readdirSync(DIR)
  .filter((f) => f.endsWith('.tsx') && !f.endsWith('.test.tsx') && !f.endsWith('.stories.tsx'))
  .map((f) => ({ file: f, text: readFileSync(join(DIR, f), 'utf8') }));
const source = (name: string): string => readFileSync(join(DIR, `${name}.tsx`), 'utf8');

// Own focus styling a plain control must not carry: any `focus-visible:outline-*` utility other than `outline-none`.
const OWN_OUTLINE = /focus-visible:-?outline-(?!none)/;

describe('primitives-do-not-name-accent-for-focus', () => {
  it('no primitive draws a focus outline or ring in --accent', () => {
    const offenders = sources
      .filter(({ text }) => /outline-\[var\(--accent\)\]/.test(text) || /focus-visible:ring-\[var\(--accent\)\]/.test(text))
      .map(({ file }) => file);
    expect(offenders).toEqual([]);
  });
});

describe('global-ring-wins-on-plain-controls', () => {
  it.each(['Checkbox', 'Switch', 'RadioGroup', 'Select', 'TextField', 'Field', 'Disclosure', 'HeaderChip', 'StatusBadge'])(
    '%s carries no focus outline of its own',
    (name) => {
      expect(source(name)).not.toMatch(OWN_OUTLINE);
    },
  );
});

describe('inset-rings-use-focus', () => {
  it.each(['Dialog', 'SlideOver', 'WorkDialog'])('%s keeps its inset ring in --focus', (name) => {
    expect(source(name)).toContain('focus-visible:ring-[var(--focus)]');
  });
});

describe('offsets-kept-where-clipped', () => {
  it.each(['StageGrid', 'Table'])('%s keeps -outline-offset-2 in --focus', (name) => {
    const text = source(name);
    expect(text).toContain('focus-visible:-outline-offset-2');
    expect(text).toContain('focus-visible:outline-[var(--focus)]');
  });

  it('Timeline keeps outline-offset-2 in --focus', () => {
    const text = source('Timeline');
    expect(text).toContain('outline-offset-2');
    expect(text).toContain('focus-visible:outline-[var(--focus)]');
  });
});
