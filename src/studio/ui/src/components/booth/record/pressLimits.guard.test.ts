import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PRESS_LIMITS_MS, type PressStage } from './pressLimits';

// #3321: a Record press never waits on a host call without a limit. Every host call the press awaits before or during the start is listed here
// with the stage that bounds it; the test finds each call in its source and requires it to sit inside `limited('<stage>', ...)`. A new await in
// the press goes in this list (and into `PRESS_LIMITS_MS`), or it hangs Record for good when the host never answers (#3221).
// A call written `void ...` is one nothing waits for (the DAW's own Record started a listening session), so it is not a wait.
// Not host calls, so not listed: `playTakeTone` (a fixed timer), `endColdRead` (its own 9 s STOP_WAIT_MS), the punch-target lookup (LOOKUP_MS in
// useRoll.ts) and the narrator's own answer to a question (`ask`).
const BOOTH = join(__dirname, '..');
const PRESS: ReadonlyArray<{ file: string; call: string; stage: PressStage }> = [
  { file: 'page/useBoothPage.ts', call: 'session.ensureModel()', stage: 'modelCheck' },
  { file: 'page/useBoothPage.ts', call: 'session.start(', stage: 'listening' },
  { file: 'page/useBoothPage.ts', call: 'voiceTracks.boothVoiceSet(', stage: 'voiceChoice' },
  { file: 'record/useRecordControl.ts', call: 'system.bootstrap()', stage: 'projectCheck' },
  { file: 'record/useRecordControl.ts', call: 'daw.recordStart(', stage: 'recordStart' },
];

describe('every host call a Record press awaits has a limit', () => {
  for (const { file, call, stage } of PRESS) {
    it(`${call} in ${file} is limited by '${stage}'`, () => {
      const lines = readFileSync(join(BOOTH, file), 'utf8').split('\n');
      const at = lines.flatMap((line, index) => (line.includes(call) && !line.trimStart().startsWith('//') && !line.includes('void ') ? [index] : []));
      expect(at.length, `${call} is not in ${file} any more: update this list`).toBeGreaterThan(0);
      for (const index of at) {
        // The `limited(` that opens the statement is on the call's own line or a few lines above it (prettier wraps the call onto its own lines).
        const around = lines.slice(Math.max(0, index - 4), index + 1).join('\n');
        expect(around, `${file}:${index + 1} awaits ${call} with no limit`).toMatch(new RegExp(`limited\\(\\s*'${stage}'`));
      }
    });
  }

  it('has a positive limit for each stage, and each stage guards a call', () => {
    for (const [stage, ms] of Object.entries(PRESS_LIMITS_MS)) {
      expect(ms, stage).toBeGreaterThan(0);
      expect(
        PRESS.some((entry) => entry.stage === stage),
        `${stage} guards nothing`,
      ).toBe(true);
    }
  });

  it('finds no other host call awaited in beginOnce or toggle', () => {
    // A new `await <something>.<host call>` in these two functions must be listed above or be named here as not a host call.
    const NOT_HOST = [
      'playTakeTone',
      'ended',
      'pending',
      'dropUnheardTake',
      'overlay.',
      'stoppedRef',
      'startedRef',
      'daw.recordStop',
      'hearing',
      'inflight',
      'ask(',
      // The press's own calls into the Record control and the Booth's one-at-a-time wrapper: each is bounded by the stages above.
      'control.toggle(',
      'beginOnce(',
    ];
    const unknown: string[] = [];
    for (const [file, from] of [
      ['page/useBoothPage.ts', 'const beginOnce'],
      ['record/useRecordControl.ts', 'const toggle = useCallback'],
    ] as const) {
      const text = readFileSync(join(BOOTH, file), 'utf8');
      const start = text.indexOf(from);
      const body = text.slice(start, text.indexOf('\n  );\n', start));
      for (const match of body.matchAll(/await ([^;\n]+)/g)) {
        const expression = match[1]!;
        if (expression.includes('limited(') || NOT_HOST.some((word) => expression.includes(word))) continue;
        if (/^\(?\s*$/.test(expression)) continue;
        unknown.push(`${file}: await ${expression}`);
      }
    }
    expect(unknown, 'an await in the press with no limit: wrap it in limited() and list it, or say why it is not a host call').toEqual([]);
  });
});
