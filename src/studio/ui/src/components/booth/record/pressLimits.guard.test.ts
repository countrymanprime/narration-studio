import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PRESS_LIMITS_MS, recordStartLimit, type PressStage } from './pressLimits';

// #3321: a Record press never waits on a host call without a limit. Every host call the press awaits before or during the start is listed here
// with the stage that bounds it; the test finds each call in its source and requires it to sit inside `limited('<stage>', ...)`. A new await in
// the press goes in this list (and into `PRESS_LIMITS_MS`), or it hangs Record for good when the host never answers (#3221).
// A call written `void ...` is one nothing waits for (the DAW's own Record started a listening session), so it is not a wait.
// The other awaits of the press are named in OTHER_AWAITS, each with its reason. One is a host call that is NOT bounded here and is a
// known gap (follow-up, stated in the PR): `daw.roll`.
const BOOTH = join(__dirname, '..');
const PRESS: ReadonlyArray<{ file: string; call: string; stage: PressStage }> = [
  { file: 'page/useBoothPage.ts', call: 'session.ensureModel(', stage: 'modelCheck' },
  { file: 'page/useBoothPage.ts', call: 'session.start(', stage: 'listening' },
  { file: 'page/useBoothPage.ts', call: 'voiceTracks.boothVoiceSet(', stage: 'voiceChoice' },
  { file: 'page/useBoothPage.ts', call: 'daw.recordStop().catch(', stage: 'recordStop' },
  { file: 'page/useBoothPage.ts', call: 'daw.undoLast(TAKE_KIND, stopped', stage: 'undoLast' },
  { file: 'record/useRecordControl.ts', call: 'system.bootstrap()', stage: 'projectCheck' },
  { file: 'record/useRecordControl.ts', call: 'daw.recordStart(', stage: 'recordStart' },
  { file: 'record/useRecordControl.ts', call: 'daw.recordStop()', stage: 'recordStop' },
];

/** The functions of the press that are scanned for awaits, from the text that opens one to the text that follows it. */
const SCANNED: ReadonlyArray<readonly [file: string, from: string, to: string]> = [
  ['page/useBoothPage.ts', 'const beginOnce', '\n  // The press under way'],
  ['record/useRecordControl.ts', 'const toggle = useCallback', '\n  const settle'],
  ['roll/useRoll.ts', 'const startTake = useCallback', 'startTakeRef.current = startTake'],
];

/** Awaits in the scanned functions that are not a limited host call, by what the awaited expression starts with. */
const OTHER_AWAITS: ReadonlyArray<{ head: string; why: string }> = [
  { head: 'limited(', why: 'a limited wait: PRESS lists the call and its stage' },
  { head: '(', why: 'the listening and the Record control together (Promise.all / hearing.then): the listening is limited, control.toggle is below' },
  { head: 'control.toggle(', why: "the Record control's own waits are the limited ones in useRecordControl.ts" },
  { head: 'actionsRef.current.beginTake(', why: "the Booth's beginOnce, whose waits are limited" },
  { head: 'actionsRef.current.chooseVoice(', why: "the Booth's chooseVoice, whose host call is limited ('voiceChoice')" },
  { head: 'lookUp(', why: 'the punch-target lookup, limited by LOOKUP_MS in useRoll.ts' },
  { head: 'latest.current.session.stopAndWait(', why: "a session stop in flight: the hook's own wait ends at STOP_WAIT_MS even if the host never says" },
  { head: 'ask(', why: "the narrator's own answer to a question, not a host wait" },
  { head: 'playTakeTone(', why: 'a fixed timer (TAKE_TONE_MS), not a host call' },
  { head: 'stoppedRef.current', why: "the Booth's own bookkeeping callback after a stop, local work" },
  { head: 'dropUnheardTake(', why: "the Booth's stop of a take whose listening failed; its recordStop and undoLast are limited ('recordStop', 'undoLast')" },
];

describe('a model check the press gave up on never opens its question', () => {
  // Record and the cold read both give up on the check at its limit; a call that is not handed `over` would open the install question afterwards and
  // close it again (#3320). So every ensureModel call in the Booth page passes the third argument.
  it('every session.ensureModel( call in useBoothPage.ts is given the over token', () => {
    const text = readFileSync(join(BOOTH, 'page/useBoothPage.ts'), 'utf8');
    const calls = [...text.matchAll(/session\.ensureModel\(([^)]*)\)/g)];
    expect(calls.length).toBeGreaterThanOrEqual(2);
    for (const call of calls) expect(call[1], call[0]).toMatch(/\bover\b/);
  });
});

describe('every host call a Record press awaits has a limit', () => {
  for (const { file, call, stage } of PRESS) {
    it(`${call} in ${file} is limited by '${stage}'`, () => {
      const lines = readFileSync(join(BOOTH, file), 'utf8').split('\n');
      const at = lines.flatMap((line, index) => (line.includes(call) && !line.trimStart().startsWith('//') && !line.includes('void ') ? [index] : []));
      expect(at.length, `${call} is not in ${file} any more: update this list`).toBeGreaterThan(0);
      for (const index of at) {
        // The `limited(` that opens the statement is on the call's own line or a few lines above it (prettier wraps the call onto its own lines).
        const around = lines.slice(Math.max(0, index - 4), index + 1).join('\n');
        expect(around, `${file}:${index + 1} awaits ${call} with no limit`).toMatch(
          stage === 'recordStart' ? /limited\(\s*recordStartLimit\(/ : new RegExp(`limited\\(\\s*'${stage}'`),
        );
      }
    });
  }

  it('has a positive limit for each stage, and each stage guards a call', () => {
    for (const [stage, ms] of Object.entries(PRESS_LIMITS_MS)) {
      expect(ms, stage).toBeGreaterThan(0);
      expect(
        PRESS.some((entry) => entry.stage === stage) || (stage === 'recordStartInApp' && PRESS.some((entry) => entry.stage === 'recordStart')),
        `${stage} guards nothing`,
      ).toBe(true);
    }
  });

  it('every other await in the press is named, with why it is not an unbounded host wait', () => {
    const unknown: string[] = [];
    for (const [file, from, to] of SCANNED) {
      const text = readFileSync(join(BOOTH, file), 'utf8');
      const start = text.indexOf(from);
      expect(start, `${from} is not in ${file} any more: update SCANNED`).toBeGreaterThan(-1);
      const body = text.slice(start, text.indexOf(to, start));
      for (const match of body.matchAll(/await ([^;\n]+)/g)) {
        const expression = match[1]!;
        if (!OTHER_AWAITS.some((entry) => expression.startsWith(entry.head))) unknown.push(`${file}: await ${expression}`);
      }
    }
    expect(unknown, 'an await in the press with no limit: wrap it in limited() and list it in PRESS, or name it in OTHER_AWAITS with its reason').toEqual([]);
  });
});

// The limits against the host's own limits, read from the Go source so a host constant that grows past its UI limit fails here.
const GO = join(__dirname, '../../../../../desktop');
const seconds = (file: string, name: string): number => {
  const match = readFileSync(join(GO, file), 'utf8').match(new RegExp(`\\b${name}\\s*=\\s*(\\d+)\\s*\\*\\s*time\\.Second`));
  expect(match, `${name} is not in ${file} as N * time.Second: update this test`).not.toBeNull();
  return Number(match![1]) * 1000;
};

describe('each limit is above the host call it waits for', () => {
  const MARGIN_MS = 2_000;
  it('the DAW start of a DAW engine: readAloudRecordStartTimeout plus the live track list wait', () => {
    const host = seconds('bindings_readaloud_record.go', 'readAloudRecordStartTimeout') + seconds('tracks_live.go', 'tracksLiveTimeout');
    expect(PRESS_LIMITS_MS.recordStart).toBeGreaterThanOrEqual(host + MARGIN_MS);
  });
  it("the app's own recorder start: recorderDevicesTimeout", () => {
    expect(PRESS_LIMITS_MS.recordStartInApp).toBeGreaterThanOrEqual(seconds('bindings_recording.go', 'recorderDevicesTimeout') + MARGIN_MS);
  });
  it("the listening start: the previous session's grace (8 s) and wait (2 s), then listeningWait", () => {
    const host = seconds('internal/teleprompter/service.go', 'defaultGrace') + 2_000 + seconds('bindings.go', 'listeningWait');
    expect(PRESS_LIMITS_MS.listening).toBeGreaterThanOrEqual(host + MARGIN_MS);
  });
  it('the Booth picks recordStartInApp for the app recorder and recordStart for a DAW engine', () => {
    expect(recordStartLimit(true)).toBe('recordStartInApp');
    expect(recordStartLimit(false)).toBe('recordStart');
  });
});
