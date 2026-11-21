import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// #3869: "there is audio on the track" has ONE threshold, `hasAudio` in recordedThrough.ts (one whole second or more). A page that tests a recorded length against 0 itself brings
// back two thresholds, and a take under a second reads 0% on one page and "<0h 01m" or 1% on another. This scans the non-test sources under components, api and ports and the
// root modules for a recorded length (`recordedSeconds`, `measuredSeconds`) compared with 0 or 1 (either operand order), tested for truthiness, or, in the two files that name the
// length `seconds` (cardSelectors.ts and recordedThrough.ts), a bare `seconds` compared with 0 or 1.
// It does NOT catch: a length copied into another name first (`const s = chapter.recordedSeconds; if (s > 0)`) outside those two files, a comparison split over two lines, or a
// threshold other than 0 and 1 (a length compared with 30, say). Reviewers still read the diff for those.
//
// The allow-list is per line, `path:the line's trimmed text`, each with the reason it is not a "has audio" test.
const ALLOWED: Record<string, string> = {
  'recordedThrough.ts:export const hasAudio = (seconds: number | null | undefined): boolean => seconds !== null && seconds !== undefined && seconds >= 1;':
    'the rule itself',
};

const sourcesIn = (dir: string, deep: boolean): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return deep ? sourcesIn(path, true) : [];
    return /\.tsx?$/.test(name) && !/\.(test|stories)\.tsx?$/.test(name) ? [path] : [];
  });

const LENGTH = '(?:recordedSeconds|measuredSeconds)';
const COMPARE = '(?:<=?|>=?|===?|!==?)';
const PATTERNS: Array<[string, RegExp]> = [
  ['compared with 0 or 1', new RegExp(`${LENGTH}\\b[^;|&]*?${COMPARE}\\s*[01]\\b`)],
  ['compared with 0 or 1 (reversed)', new RegExp(`\\b[01]\\s*${COMPARE}\\s*[\\w.?]*${LENGTH}\\b`)],
  ['tested for truthiness', new RegExp(`!!?\\s*[\\w.?]*${LENGTH}\\b(?!\\s*(?:===?|!==?|\\?\\?))|${LENGTH}\\s*(?:&&|\\?(?![?.:]))`)],
];
const BARE: Array<[string, RegExp]> = [
  ['a bare seconds compared with 0 or 1', new RegExp(`\\bseconds\\b\\s*${COMPARE}\\s*[01]\\b|\\b[01]\\s*${COMPARE}\\s*seconds\\b`)],
];

describe('one threshold for audio on the track', () => {
  it('compares no recorded length with 0 or 1, or tests it for truthiness, outside the allow-list', () => {
    const root = __dirname;
    const paths = [
      ...sourcesIn(join(root, 'components'), true),
      ...sourcesIn(join(root, 'api'), true),
      ...sourcesIn(join(root, 'ports'), true),
      ...sourcesIn(root, false),
    ];
    const offenders: string[] = [];
    for (const path of paths) {
      const rel = path.slice(root.length + 1);
      const patterns = /(^|\/)(cardSelectors|recordedThrough)\.ts$/.test(rel) ? [...PATTERNS, ...BARE] : PATTERNS;
      readFileSync(path, 'utf8')
        .split('\n')
        .forEach((line, index) => {
          const text = line.trim();
          if (text.startsWith('//') || text.startsWith('*') || text.startsWith('/*') || `${rel.split('/').pop()}:${text}` in ALLOWED) return;
          for (const [why, pattern] of patterns) if (pattern.test(line)) offenders.push(`${rel}:${index + 1}: ${why}: ${text}`);
        });
    }
    expect(offenders).toEqual([]);
  });
});
