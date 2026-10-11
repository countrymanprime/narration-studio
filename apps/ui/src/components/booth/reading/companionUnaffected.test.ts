// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// The Booth gets its own browse here (audit finding 4); the Companion's hand-scroll rule and reader stay as they are until SN-O10.
const FROZEN = /\b(useFollowCursor|ReaderText|readerModel)\b/;

describe('the-companion-is-unaffected', () => {
  it('nothing in this folder imports a Companion-shared reader file', () => {
    const folder = dirname(fileURLToPath(import.meta.url));
    const self = 'companionUnaffected.test.ts';
    const offenders = readdirSync(folder)
      .filter((file) => /\.(ts|tsx)$/.test(file) && file !== self)
      .filter((file) =>
        readFileSync(join(folder, file), 'utf8')
          .split('\n')
          .some((line) => /^\s*(import|export)\b.*\bfrom\b/.test(line) && FROZEN.test(line)),
      );
    expect(offenders).toEqual([]);
  });
});
