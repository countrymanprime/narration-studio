import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// #3869: "there is audio on the track" has ONE threshold, `hasAudio` in recordedThrough.ts (one whole second or more). A page that tests a recorded length against 0 itself brings
// back two thresholds, and a take under a second reads 0% on one page and "<0h 01m" or 1% on another. This scans the non-test sources under components, api and ports and the
// root modules for a recorded length (`recordedSeconds`, `measuredSeconds`) compared with 0 or 1 (either operand order), tested for truthiness, or, in the two files that name the
// length `seconds` (cardSelectors.ts and recordedThrough.ts), a bare `seconds` compared with 0 or 1.
// It also flags a raw sum of a length (`reduce` or `sum` on the same line). It does NOT catch: a length copied into another name first (`const s = chapter.recordedSeconds; if (s > 0)`)
// outside those two files, a comparison or a sum split over two lines, `.filter(Boolean)` over lengths, or a threshold other than 0 and 1 (a length compared with 30, say). The
// behaviour test next to this one is what catches those; reviewers still read the diff.
//
// The allow-list is per line, `path:the line's trimmed text`, each with the reason it is not a "has audio" test.
const ALLOWED: Record<string, string> = {
  'overviewFixtures.ts:const hours = (chapters: readonly ProductionChapter[]): number => chapters.reduce((a, c) => a + (c.recordedSeconds ?? 0), 0);':
    'story fixture totals, not a page figure',
  'productionMock.ts:const recordedSeconds = chapters.reduce((sum, chapter) => sum + (chapter.recordedSeconds ?? 0), 0);':
    'the mock host computing its own totals (the host side, #3909), not a page',
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
  ['compared with 0 or 1', new RegExp(`${LENGTH}(?:\\s*\\?\\?\\s*\\d+\\)?)?\\s*${COMPARE}\\s*[01]\\b`)],
  ['compared with 0 or 1 (reversed)', new RegExp(`\\b[01]\\s*${COMPARE}\\s*\\(?[\\w.?]*${LENGTH}\\b`)],
  [
    'tested for truthiness',
    new RegExp(`!!?\\s*[\\w.?]*${LENGTH}\\b(?!\\s*(?:===?|!==?|\\?\\?))|${LENGTH}\\s*(?:&&|\\|\\||\\?(?![?.:]))|Boolean\\(\\s*[\\w.?]*${LENGTH}\\s*\\)`),
  ],
  ['summed raw (use audibleSeconds or recordedAudioHours)', new RegExp(`\\b(?:reduce|sum)\\b[^;]*${LENGTH}\\b`)],
];
const BARE: Array<[string, RegExp]> = [
  ['a bare seconds compared with 0 or 1', new RegExp(`\\bseconds\\b\\s*${COMPARE}\\s*[01]\\b|\\b[01]\\s*${COMPARE}\\s*seconds\\b`)],
];

const flagged = (line: string, patterns = [...PATTERNS, ...BARE]): string[] =>
  patterns.filter(([why, pattern]) => pattern.test(line) && !(why.startsWith('summed') && line.includes('audibleSeconds('))).map(([why]) => why);

describe('one threshold for audio on the track', () => {
  it('flags each spelling it claims to catch, and not the helpers', () => {
    for (const line of [
      'if (chapter.recordedSeconds > 0) {',
      'if (0 < chapter.recordedSeconds) {',
      'if ((chapter.recordedSeconds ?? 0) > 0) {',
      'if (c.measuredSeconds === 0) {',
      'if (!chapter.recordedSeconds) {',
      'const has = chapter.recordedSeconds && true;',
      'const has = Boolean(chapter.recordedSeconds);',
      'const total = chapters.reduce((a, c) => a + (c.recordedSeconds ?? 0), 0);',
      'const total = sum(chapters.map((c) => c.measuredSeconds));',
    ])
      expect(flagged(line), line).not.toEqual([]);
    for (const line of ['if (seconds >= 1) {', 'if (1 > seconds) {']) expect(flagged(line, BARE), line).not.toEqual([]);
    for (const line of [
      'if (hasAudio(chapter.recordedSeconds)) {',
      'const s = audibleSeconds(chapter.recordedSeconds);',
      'const total = chapters.reduce((a, c) => a + audibleSeconds(c.recordedSeconds), 0);',
      'const clock = format(chapter.recordedSeconds);',
    ])
      expect(flagged(line), line).toEqual([]);
  });

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
          for (const why of flagged(line, patterns)) offenders.push(`${rel}:${index + 1}: ${why}: ${text}`);
        });
    }
    expect(offenders).toEqual([]);
  });
});
