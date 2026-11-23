import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PLAY_DEADLINE_MS } from '../components/engine/ShowInDaw';
import type { DawCapabilities, DawCapabilityLevel } from '../api/contracts/daw';
import { DAW_SETUPS } from '../fixtures/daw';
import {
  APP,
  CHECKING,
  READ_FAILED,
  dawReadiness,
  playReadiness,
  playThrough,
  recordingSentence,
  quietWhileRecording,
  type PlayAttempt,
  type PlaybackProvider,
  type Readiness,
} from './providers';

type DawState = 'ready' | 'waiting' | 'read-failed' | 'undeclared' | 'unavailable';
type DawPlay = 'plays' | 'fails' | 'fails-final';
type AppState = 'ready' | 'unavailable';

const DAW_READINESS: Record<DawState, Readiness> = {
  ready: { ready: true },
  waiting: { ready: false, why: CHECKING, wait: true },
  'read-failed': { ready: false, why: READ_FAILED },
  undeclared: { ready: false, why: null },
  unavailable: { ready: false, why: 'REAPER is not answering.' },
};
const DAW_PLAY: Record<DawPlay, PlayAttempt> = {
  plays: { played: true },
  fails: { played: false, why: 'REAPER could not play it.' },
  'fails-final': { played: false, why: 'REAPER is recording.', final: true },
};

function provider(name: string, readiness: Readiness, attempt: PlayAttempt) {
  const play = vi.fn(() => Promise.resolve(attempt));
  const p: PlaybackProvider<number> = { name, readiness: () => readiness, play };
  return { p, play };
}

/** What the rule must do, worked out cell by cell from docs/design/editing-daw-transport-sync.md (Who plays). */
function expected(daw: DawState, dawPlay: DawPlay, app: AppState, dawSpecific: boolean, recording: boolean) {
  if (daw === 'waiting') return { by: null, notice: CHECKING, dawAsked: false, appAsked: false };
  if (daw === 'ready') {
    if (dawPlay === 'plays') return { by: 'REAPER', notice: null, dawAsked: true, appAsked: false };
    if (dawPlay === 'fails-final') return { by: null, notice: 'REAPER is recording.', dawAsked: true, appAsked: false };
  }
  const readiness = DAW_READINESS[daw];
  const why = daw === 'ready' ? 'REAPER could not play it.' : readiness.ready ? null : readiness.why;
  const dawAsked = daw === 'ready';
  if (dawSpecific) return { by: null, notice: [why, 'Nothing played: this can only be done in REAPER.'].filter(Boolean).join(' '), dawAsked, appAsked: false };
  if (app === 'unavailable') return { by: null, notice: [why, 'No file.'].filter(Boolean).join(' '), dawAsked, appAsked: false };
  if (recording) return { by: null, notice: 'REAPER is recording, so nothing plays. Stop recording first.', dawAsked, appAsked: false };
  return { by: APP, notice: why ? `${why} Played in ${APP} instead.` : null, dawAsked, appAsked: true };
}

describe('the-selection-rule-over-every-readiness-combination', () => {
  const states: DawState[] = ['ready', 'waiting', 'read-failed', 'undeclared', 'unavailable'];
  const plays: DawPlay[] = ['plays', 'fails', 'fails-final'];
  const cells = states.flatMap((daw) =>
    plays.flatMap((dawPlay) =>
      (['ready', 'unavailable'] as AppState[]).flatMap((app) =>
        [false, true].flatMap((dawSpecific) => [false, true].map((recording) => ({ daw, dawPlay, app, dawSpecific, recording }))),
      ),
    ),
  );
  it.each(cells)('DAW $daw ($dawPlay), app $app, DAW-specific $dawSpecific, recording $recording', async ({ daw, dawPlay, app, dawSpecific, recording }) => {
    const first = provider('REAPER', DAW_READINESS[daw], DAW_PLAY[dawPlay]);
    const second = provider(APP, app === 'ready' ? { ready: true } : { ready: false, why: 'No file.' }, { played: true });
    const keepQuiet = quietWhileRecording(() => Promise.resolve({ playState: recording ? 'recording' : 'stopped' }), 'REAPER');
    const outcome = await playThrough([first.p, second.p], 0, { dawSpecific, keepQuiet });
    const want = expected(daw, dawPlay, app, dawSpecific, recording);
    expect({ by: outcome.by, notice: outcome.notice }).toEqual({ by: want.by, notice: want.notice });
    expect(first.play.mock.calls.length > 0).toBe(want.dawAsked);
    expect(second.play.mock.calls.length > 0).toBe(want.appAsked);
  });
});

describe('the-narrator-stops-while-a-provider-is-asked', () => {
  it('tries nothing more and says nothing', async () => {
    let wanted = true;
    const first = provider('REAPER', { ready: true }, { played: false, why: 'No.' });
    first.play.mockImplementation(() => {
      wanted = false;
      return Promise.resolve({ played: false, why: 'No.' });
    });
    const second = provider(APP, { ready: true }, { played: true });
    expect(await playThrough([first.p, second.p], 0, { stillWanted: () => wanted })).toEqual({ by: null, notice: null, passed: ['No.'] });
    expect(second.play).not.toHaveBeenCalled();
  });
  it('a waiting provider that is not the first is passed over as not ready', async () => {
    const first = provider(APP, { ready: false, why: 'No file.' }, { played: true });
    const second = provider('REAPER', { ready: false, why: CHECKING, wait: true }, { played: true });
    expect(await playThrough([first.p, second.p], 0)).toEqual({ by: null, notice: `No file. ${CHECKING}`, passed: ['No file.', CHECKING] });
  });
  it('no providers plays nothing and says nothing', async () => {
    expect(await playThrough([], 0)).toEqual({ by: null, notice: null, passed: [] });
  });
});

describe('dawReadiness', () => {
  const withLevel = (level: DawCapabilityLevel, available: boolean, reachable = true): DawCapabilities => ({
    ...DAW_SETUPS.reaper,
    reachable,
    capabilities: { ...DAW_SETUPS.reaper.capabilities, transport_sync: { level, available, ...(available ? {} : { message: 'Off.' }) } },
  });
  it('waits for the first answer, and says a failed read without waiting', () => {
    expect(dawReadiness(null, 'transport_sync')).toEqual({ ready: false, why: CHECKING, wait: true });
    expect(dawReadiness(null, 'transport_sync', true)).toEqual({ ready: false, why: READ_FAILED });
  });
  it('is quiet for an engine that never declared the capability: Audacity, the built-in recorder, no DAW', () => {
    expect(dawReadiness(DAW_SETUPS.audacity, 'transport_sync')).toEqual({ ready: false, why: null });
    expect(dawReadiness(DAW_SETUPS.builtin, 'transport_sync')).toEqual({ ready: false, why: null });
    expect(dawReadiness({ ...DAW_SETUPS.builtin, daw: 'none' }, 'file_preview')).toEqual({ ready: false, why: null });
    expect(dawReadiness(withLevel('unsupported', false), 'transport_sync')).toEqual({ ready: false, why: null });
    expect(dawReadiness(withLevel('not_yet_available', false), 'transport_sync')).toEqual({ ready: false, why: null });
    expect(dawReadiness(DAW_SETUPS.reaper, 'no_such_capability')).toEqual({ ready: false, why: null });
  });
  it("gives a declared capability's sentence while it is not usable, and ready when it is", () => {
    expect(dawReadiness(withLevel('experimental', false), 'transport_sync')).toEqual({ ready: false, why: 'Off.' });
    expect(dawReadiness(withLevel('experimental', true, false), 'transport_sync')).toEqual({ ready: false, why: 'REAPER is not answering.' });
    expect(dawReadiness(DAW_SETUPS['reaper-off'], 'transport_sync').ready).toBe(false);
    expect(dawReadiness(withLevel('experimental', true), 'transport_sync')).toEqual({ ready: true });
    expect(dawReadiness(withLevel('supported', true), 'transport_sync')).toEqual({ ready: true });
  });
  it('Audacity needs no change here when it declares the capability', () => {
    const audacity: DawCapabilities = {
      ...DAW_SETUPS.audacity,
      capabilities: { ...DAW_SETUPS.audacity.capabilities, transport_sync: { level: 'experimental', available: true } },
    };
    expect(dawReadiness(audacity, 'transport_sync')).toEqual({ ready: true });
  });
});

describe('quietWhileRecording', () => {
  it('a read that fails does not hold the play back', async () => {
    expect(await quietWhileRecording(() => Promise.reject(new Error('gone')), 'REAPER')()).toBeNull();
  });
});

describe('the-port-never-names-a-daw', () => {
  it('playback/providers.ts has no DAW name and no branch on the kind', () => {
    const source = readFileSync(fileURLToPath(new URL('./providers.ts', import.meta.url)), 'utf8')
      .split('\n')
      .filter((line) => !line.trim().startsWith('//') && !line.trim().startsWith('*') && !line.trim().startsWith('/**'))
      .join('\n');
    expect(source).not.toMatch(/REAPER|Audacity|Built-in/);
    expect(source).not.toMatch(/\.daw\s*[!=]==|\bkind\b/);
  });
});

describe('playReadiness', () => {
  it('asks a DAW that has not yet said what it can do at once, with no check in between', () => {
    expect(playReadiness(null, 'file_preview')).toEqual({ ready: true });
  });
  it('still says a failed read and leaves the rest to what the DAW declared', () => {
    expect(playReadiness(null, 'file_preview', true)).toEqual({ ready: false, why: READ_FAILED });
    expect(playReadiness({ daw: 'REAPER', reachable: true, capabilities: {} } as never, 'file_preview')).toEqual({ ready: false, why: null });
  });
});

// #4076 (owner decision on #4077): a DAW call that never answers is never silent. The deadline is the page's own limit on a DAW call (`PLAY_DEADLINE_MS`).
describe('a-provider-that-never-answers-is-passed-over', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());
  it('waits without a limit when the caller names none (the take and the script keep their own)', async () => {
    const hung = { name: 'REAPER', readiness: () => ({ ready: true as const }), play: () => new Promise<never>(() => {}) };
    const app = provider(APP, { ready: true }, { played: true });
    let done = false;
    void playThrough([hung, app.p], 0).then(() => (done = true));
    await vi.advanceTimersByTimeAsync(10 * PLAY_DEADLINE_MS);
    expect(done).toBe(false);
  });
  it('moves on to the app after the deadline and says the DAW did not answer', async () => {
    const hung = { name: 'REAPER', readiness: () => ({ ready: true as const }), play: () => new Promise<never>(() => {}) };
    const app = provider(APP, { ready: true }, { played: true });
    const pending = playThrough([hung, app.p], 0, { deadlineMs: PLAY_DEADLINE_MS });
    await vi.advanceTimersByTimeAsync(PLAY_DEADLINE_MS);
    expect(await pending).toMatchObject({ by: APP, notice: 'REAPER did not answer. Played in the app instead.' });
  });
  it('tells a provider that answers after the deadline that it is late', async () => {
    let answer: (a: { played: true }) => void = () => {};
    const seen = { before: true, after: false };
    const slow = {
      name: 'REAPER',
      readiness: () => ({ ready: true as const }),
      play: (_: number, ctx: { late: () => boolean }) => {
        seen.before = ctx.late();
        return new Promise<{ played: true }>((resolve) => (answer = (a) => ((seen.after = ctx.late()), resolve(a))));
      },
    };
    const app = provider(APP, { ready: true }, { played: true });
    const pending = playThrough([slow, app.p], 0, { deadlineMs: PLAY_DEADLINE_MS });
    await vi.advanceTimersByTimeAsync(PLAY_DEADLINE_MS);
    await pending;
    answer({ played: true });
    expect(seen).toEqual({ before: false, after: true });
  });
  it('opens the sentence with a capital when the DAW has no name yet', async () => {
    const hung = { name: 'the DAW', readiness: () => ({ ready: true as const }), play: () => new Promise<never>(() => {}) };
    const app = provider(APP, { ready: true }, { played: true });
    const pending = playThrough([hung, app.p], 0, { deadlineMs: PLAY_DEADLINE_MS });
    await vi.advanceTimersByTimeAsync(PLAY_DEADLINE_MS);
    expect((await pending).notice).toBe('The DAW did not answer. Played in the app instead.');
    expect(recordingSentence('the DAW')).toBe('The DAW is recording, so nothing plays. Stop recording first.');
  });
  it('a keepQuiet that never answers does not hold the app back', async () => {
    const fails = provider('REAPER', { ready: true }, { played: false, why: 'Refused.' });
    const app = provider(APP, { ready: true }, { played: true });
    const pending = playThrough([fails.p, app.p], 0, { keepQuiet: () => new Promise<never>(() => {}), deadlineMs: PLAY_DEADLINE_MS });
    await vi.advanceTimersByTimeAsync(PLAY_DEADLINE_MS);
    expect(await pending).toMatchObject({ by: APP });
  });
});
