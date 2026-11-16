import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The words that say who holds a track in a picker ("linked to X", "Name (linked to X)") are written in `mapping/trackChoices.ts` only (`heldNote`,
 * `heldLabel`), so the Chapter links list, the Link chapters dialog, the tree picker and the pickers say it one way (#3398). A picker that wrote its own
 * copy went unnoticed twice. The sentences about a chapter ("Chapter 1 is linked to …") are a different thing and are not matched.
 */
const OWNER = 'components/mapping/trackChoices.ts';
const COPY = /`[^`]*\blinked to \$\{[^}]*(held|holder)[^}]*\}[^`]*`/i;
const root = join(__dirname, '..', '..');

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.(ts|tsx)$/.test(name) && !/\.(test|stories)\.tsx?$/.test(name) ? [path] : [];
  });
}

/** The files that write the holder template themselves, relative to `src`. */
export function holderTemplateCopies(files: Array<{ path: string; text: string }>): string[] {
  return files
    .filter((f) => COPY.test(f.text))
    .map((f) => f.path)
    .sort();
}

describe('the holder template', () => {
  it('is written in trackChoices only', () => {
    const files = sources(join(root, 'components')).map((path) => ({ path: relative(root, path).split('\\').join('/'), text: readFileSync(path, 'utf8') }));
    expect(holderTemplateCopies(files)).toEqual([OWNER]);
  });
  it('sees each spelling it guards and not a sentence about a chapter', () => {
    expect(holderTemplateCopies([{ path: 'a.tsx', text: 'label: `${name} (linked to ${c.heldBy})`' }])).toEqual(['a.tsx']);
    expect(holderTemplateCopies([{ path: 'b.tsx', text: "note: `linked to ${entry.heldBy}` + ' · '" }])).toEqual(['b.tsx']);
    expect(holderTemplateCopies([{ path: 'c.tsx', text: '`${short} is linked to ${found.name}`' }])).toEqual([]);
  });
});
