import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = join(__dirname, '..');

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === 'api' || name === 'fixtures' || name === 'node_modules' ? [] : sources(path);
    return /\.(ts|tsx)$/.test(name) && !/\.(test|stories)\./.test(name) ? [path] : [];
  });
}

/**
 * A rejection shown to the narrator through `String(reason)` reads "Error: <message>" (#3053): the prefix is the JavaScript class, not a sentence. A screen
 * shows `apiErrorMessage(reason)` (or `describeApiError`), which unwraps a wire error to its user message and an Error to its bare message. The
 * inline `reason instanceof Error ? reason.message : String(reason)` form is the same thing written out and passes. Nothing is allowed through.
 */
describe('a failure is shown without the "Error: " prefix', () => {
  it('no screen code writes String(reason), String(error) or String(err) on its own', () => {
    const hits = sources(root).flatMap((path) =>
      readFileSync(path, 'utf8')
        .split('\n')
        .map((line, index) => ({ line, at: `${relative(root, path)}:${index + 1}` }))
        .filter(
          ({ line }) =>
            /\bString\((reason|error|err)\)/.test(line) &&
            !/instanceof Error\s*\?[^:]*:\s*String\((reason|error|err)\)/.test(line) &&
            !/new Error\(String\(/.test(line),
        )
        .map(({ at }) => at),
    );
    expect(hits).toEqual([]);
  });
});
