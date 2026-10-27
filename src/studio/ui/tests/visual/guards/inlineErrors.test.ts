import { describe, expect, it } from 'vitest';
import { INLINE_ERRORS } from './inline-errors-allowlist';
import { inlineErrorCounts } from './inlineErrors';

// An error drawn in a page's flow moves the layout when it appears. Errors go in a toast, a modal or an always-present fixed result box.
// The allowlist is today's debt by file; it may only shrink.
describe('errors drawn in a page’s flow', () => {
  const found = inlineErrorCounts();

  it('adds none beyond the allowlist', () => {
    const over = Object.entries(found)
      .filter(([file, n]) => n > (INLINE_ERRORS[file] ?? 0))
      .map(([file, n]) => `${file}: ${n} (listed ${INLINE_ERRORS[file] ?? 0})`);
    expect(
      over,
      'Show the error as a toast, in a modal, or in a result box that is always on the page. See .claude/skills/frontend-primitives/SKILL.md.',
    ).toEqual([]);
  });

  it('lowers the allowlist when an error is fixed', () => {
    const stale = Object.entries(INLINE_ERRORS)
      .filter(([file, n]) => (found[file] ?? 0) < n)
      .map(([file, n]) => `${file}: listed ${n}, found ${found[file] ?? 0}`);
    expect(stale, 'Lower or remove these entries in inline-errors-allowlist.ts.').toEqual([]);
  });
});
