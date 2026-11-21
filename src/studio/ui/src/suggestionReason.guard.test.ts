// @vitest-environment node
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

// Class guard (issue 3277, reuse): the line a page shows for a local model's reason is written once, in `suggestionReasonLine`
// (components/manuscript/dialogueCues.selectors.ts), so the Script page's picker, the Story Bible's cue list and any later page
// word it the same. A page that writes its own "Suggested by the local model" (or "the local model suggested" before a reason)
// fails here. The toast's count sentence ("The local model suggested 3 of them.") is a different sentence and is allowed.
const SRC = join(__dirname);
const OWNER = join('components', 'manuscript', 'dialogueCues.selectors.ts');
const OWN_LABEL = /suggested by (?:the |a )?local model|local model(?:'s)? (?:suggestion|reason)\s*:|(?:the |a )local model suggested\s*:/i;

function* sources(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* sources(path);
    else if (/\.tsx?$/.test(name) && !/\.(test|stories)\.tsx?$/.test(name)) yield path;
  }
}

// Comments describe the label; only code may not write it.
const code = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('a-local-models-reason-line-is-written-once', () => {
  it('no page writes its own label for the reason', () => {
    const copies = [...sources(SRC)]
      .filter((path) => relative(SRC, path) !== OWNER && OWN_LABEL.test(code(readFileSync(path, 'utf8'))))
      .map((path) => relative(SRC, path).split(sep).join('/'));
    expect(copies).toEqual([]);
  });

  it('the guard sees each way a page could write it, and not the toast or a comment', () => {
    for (const copy of [
      'const line = `Suggested by the local model: ${reason}`;',
      '<p>Suggested by local model: {reason}</p>',
      "const label = 'Local model suggestion: ' + reason;",
      "const label = `Local model's reason: ${reason}`;",
      "notify('The local model suggested: ' + reason);",
    ]) {
      expect(OWN_LABEL.test(code(copy)), copy).toBe(true);
    }
    expect(OWN_LABEL.test(code('const model = ` The local model suggested ${n} of them.`;'))).toBe(false);
    expect(OWN_LABEL.test(code('  // shows "Suggested by the local model: ..." beneath Confirm'))).toBe(false);
  });
});
