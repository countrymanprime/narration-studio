import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { STATUS_ORDER, reached } from './chapterStatus';

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.(ts|tsx)$/.test(name) && !/\.(test|stories)\./.test(name) ? [path] : [];
  });
}

/** The wire schemas and the type name the same five words; the order they are walked in is not theirs to keep. */
const SPELLS_THE_WORDS = ['chapterStatus.ts', 'api/contracts/manuscript.ts', 'api/contracts/credits.ts', 'api/schemas/'];

describe('one-stage-order', () => {
  it('only chapterStatus.ts lists the five stages in order; every walk over them reads STATUS_ORDER', () => {
    const root = __dirname;
    const listing = sources(root)
      .filter((path) => /'not_started',\s*'recording',\s*'editing',\s*'proofing',\s*'finalized'/.test(readFileSync(path, 'utf8')))
      .map((path) => path.slice(root.length + 1).replaceAll('\\', '/'))
      .filter((path) => !SPELLS_THE_WORDS.some((allowed) => path.startsWith(allowed)));
    expect(listing).toEqual([]);
  });

  it('reached() says whether a chapter is at or past a stage', () => {
    expect(STATUS_ORDER).toHaveLength(5);
    expect(reached('editing', 'recording')).toBe(true);
    expect(reached('recording', 'recording')).toBe(true);
    expect(reached('not_started', 'recording')).toBe(false);
    expect(reached('finalized', 'proofing')).toBe(true);
  });
});
