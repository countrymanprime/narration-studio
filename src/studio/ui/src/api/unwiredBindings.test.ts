import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createMockApi } from './mockApi';

const root = join(__dirname, '..');

// main.tsx boots the app and seeds the browser mock from `?mock…=` parameters: a binding named there is a seed key, not a screen's
// call, so it does not count as one.
function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    if (dir === root && name === 'main.tsx') return [];
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === 'api' || name === 'fixtures' ? [] : sources(path);
    return /\.(ts|tsx)$/.test(name) && !/\.(test|stories)\./.test(name) && !/\.(catalog|fixtures?)\.ts$/.test(name) ? [path] : [];
  });
}

/**
 * Host bindings no screen calls (audit cluster 25, docs/research/ui-function-audit/inventory-shell.md section 1.7): either retired or never
 * wired. The list only shrinks: wire a binding (or delete it from the host) and take its name out, and a new binding cannot arrive without a caller.
 */
const UNWIRED = ['masteringChooseProvider', 'systemCopyDiagnostics'];

const text = sources(root)
  .map((path) => readFileSync(path, 'utf8'))
  .join('\n');
const called = (name: string) => new RegExp(`\\b${name}\\b`).test(text);

describe('no-binding-arrives-without-a-screen-that-calls-it', () => {
  it('a name mentioned only in main.tsx (a mock seed key, not a screen) counts as unwired', () => {
    expect(sources(root).map((path) => relative(root, path))).not.toContain('main.tsx');
  });

  it('every host binding is called by a screen, or is on the shrinking list of unwired ones', () => {
    const api = createMockApi() as unknown as Record<string, unknown>;
    const bindings = Object.keys(api).filter((name) => typeof api[name] === 'function');
    const uncalled = bindings.filter((name) => !called(name)).sort();
    expect(uncalled).toEqual([...UNWIRED].sort());
  });
});
