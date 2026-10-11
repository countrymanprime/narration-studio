import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// ADR 0781 decision 3: the overlay service imports primitives, React and itself, nothing else in the app. The dependency-cruiser rule
// for src/overlay/** comes with SN-S2; this reads the folder's own import statements so the rule holds before and after it lands.
const folder = __dirname;
const sources = readdirSync(folder).filter((name) => /\.tsx?$/.test(name) && !/\.(test|stories)\.tsx?$/.test(name));

function specifiers(source: string): string[] {
  return [...source.matchAll(/(?:^|\n)\s*(?:import|export)\b[^'"`;]*?\bfrom\s*['"]([^'"]+)['"]/g)]
    .map((m) => m[1])
    .concat([...source.matchAll(/\bimport\(\s*['"]([^'"]+)['"]\s*\)/g)].map((m) => m[1]));
}
const allowed = (spec: string): boolean => spec === 'react' || spec.startsWith('./') || /^\.\.\/components\/primitives\/[^/]+$/.test(spec);

describe('src/overlay imports primitives only', () => {
  it('finds the service files', () => {
    expect(sources).toEqual(expect.arrayContaining(['overlayService.ts', 'OverlayHost.tsx', 'OverlayProvider.tsx']));
  });
  it.each(sources)('%s imports only components/primitives, react and this folder', (name) => {
    const bad = specifiers(readFileSync(join(folder, name), 'utf8')).filter((spec) => !allowed(spec));
    expect(bad).toEqual([]);
  });
  it('the check itself flags a feature import', () => {
    expect(specifiers(`import { x } from '../hooks/useToasts';\nimport type { Y } from 'react';`).filter((s) => !allowed(s))).toEqual(['../hooks/useToasts']);
  });
});
