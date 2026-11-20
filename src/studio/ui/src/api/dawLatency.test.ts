// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NarrationApi } from '../types';
import { DAW_CALLS, DAW_EVENTS, LinkClock, parseDawLatency, slows, withDawLatency } from './dawLatency';
import { createMockApi } from './mockApi';

// The host's parser reads the same file (TestParseSlowLink, src/studio/desktop/internal/bridge/slowlink_test.go): one profile is the same slowness in a Go test, a development run and the mock.
type Profile = { text: string; delayMs: number; jitterMs: number; stallForMs: number; stallEveryMs: number; drop: number; only: string[] };
const fixture = JSON.parse(readFileSync(join(__dirname, '../../../desktop/internal/bridge/testdata/slowlink_profiles.json'), 'utf8')) as {
  valid: Profile[];
  invalid: string[];
};

describe('parseDawLatency', () => {
  it.each(fixture.valid)('reads "$text" as the host does', (want) => {
    const got = parseDawLatency(want.text);
    expect(got).toEqual({
      delay: want.delayMs,
      jitter: want.jitterMs,
      stallFor: want.stallForMs,
      stallEvery: want.stallEveryMs,
      drop: want.drop,
      only: want.only,
    });
    expect(slows(got)).toBe(want.delayMs + want.jitterMs + want.stallForMs + want.drop > 0);
  });

  it.each(fixture.invalid)('refuses "%s" as the host does', (text) => {
    expect(() => parseDawLatency(text)).toThrow(/slow link profile/);
  });
});

describe('LinkClock', () => {
  const at = (text: string) => new LinkClock(parseDawLatency(text), 1000);

  it('holds each call for the delay, and a prompt link holds nothing', () => {
    expect(at('0ms').release('tracksLive', 1500)).toBe(1500);
    expect(at('300ms').release('tracksLive', 1500)).toBe(1800);
  });

  it('never releases a call before one made ahead of it', () => {
    const clock = at('delay=5ms,jitter=60ms');
    const releases = Array.from({ length: 8 }, (_, index) => clock.release('dawPlace', 1000 + index));
    expect(releases).toEqual([...releases].sort((a, b) => a - b));
    expect(new Set(releases).size).toBeGreaterThan(1);
    const only = at('delay=60ms,only=tracksLive');
    expect(only.release('tracksLive', 1000)).toBe(1060);
    expect(only.release('dawPlace', 1001)).toBe(1060);
  });

  it('holds every call until a stall ends, once or every period', () => {
    const once = at('stall=8s');
    expect(once.release('dawPlace', 1000)).toBe(9000);
    expect(once.release('dawPlace', 9500)).toBe(9500);
    expect(once.stallLeft(5000)).toBe(4000);
    const again = at('stall=2s/30s');
    expect(again.release('dawPlace', 20_000)).toBe(20_000);
    expect(again.release('dawPlace', 31_500)).toBe(33_000);
  });

  it('drops the first matching calls and no other', () => {
    const clock = at('drop=1,only=tracksLive');
    expect(clock.release('dawPlace', 1000)).toBe(1000);
    expect(clock.release('tracksLive', 1000)).toBe(Infinity);
    expect(clock.release('tracksLive', 1001)).toBe(1001);
  });
});

describe('withDawLatency', () => {
  beforeEach(() => void vi.useFakeTimers());
  afterEach(() => void vi.useRealTimers());

  /** A stand-in host that answers at once and counts what reached it. */
  function host() {
    const reached: string[] = [];
    const handlers: ((event: unknown) => void)[] = [];
    const call = (name: string, value: unknown) => () => {
      reached.push(name);
      return Promise.resolve(value);
    };
    const api = {
      tracksLive: call('tracksLive', { source: 'live' }),
      tracksList: call('tracksList', { tracks: ['saved'] }),
      readAloudRecordStop: call('readAloudRecordStop', { outcome: 'stopped' }),
      readAloudReaperState: call('readAloudReaperState', { status: 'ready' }),
      boothVoiceSet: call('boothVoiceSet', { outcome: 'selected' }),
      dawArmBoothVoice: call('dawArmBoothVoice', { ok: true }),
      settingsForScope: call('settingsForScope', {}),
      subscribeDawTransport: (handler: (event: unknown) => void) => {
        handlers.push(handler);
        return () => undefined;
      },
    } as unknown as NarrationApi;
    return { api, reached, emit: (event: unknown) => handlers.forEach((handler) => handler(event)) };
  }
  const slowed = (api: NarrationApi, text: string) => withDawLatency(api, parseDawLatency(text));
  /** What a call has answered so far: `undefined` while it waits. */
  function watch(promise: Promise<unknown>) {
    const seen: { answer?: unknown } = {};
    void promise.then((answer) => (seen.answer = answer));
    return seen;
  }

  it('holds nothing on a prompt link, and takes a new profile from the page', async () => {
    const { api } = host();
    const slow = slowed(api, '0ms');
    await expect(slow.readAloudRecordStop()).resolves.toEqual({ outcome: 'stopped' });
    window.__NARRATION_MOCK_DAW_LATENCY__?.('1s');
    const stop = watch(slow.readAloudRecordStop());
    await vi.advanceTimersByTimeAsync(999);
    expect(stop.answer).toBeUndefined();
    await vi.advanceTimersByTimeAsync(1);
    expect(stop.answer).toEqual({ outcome: 'stopped' });
    expect(() => window.__NARRATION_MOCK_DAW_LATENCY__?.('quick')).toThrow(/slow link profile/);
  });

  it('holds a DAW call for the delay and leaves every other call alone', async () => {
    const { api, reached } = host();
    const slow = slowed(api, '300ms');
    const tracks = watch(slow.tracksLive());
    await slow.settingsForScope('project');
    expect(reached).toEqual(['settingsForScope']);
    await vi.advanceTimersByTimeAsync(299);
    expect(tracks.answer).toBeUndefined();
    await vi.advanceTimersByTimeAsync(1);
    expect(tracks.answer).toEqual({ source: 'live' });
  });

  it('answers the saved tracks after the 7 s the host waits for the live list', async () => {
    const { api } = host();
    const tracks = watch(slowed(api, '10s').tracksLive());
    await vi.advanceTimersByTimeAsync(6_999);
    expect(tracks.answer).toBeUndefined();
    await vi.advanceTimersByTimeAsync(1);
    expect(tracks.answer).toMatchObject({ source: 'saved', reason: 'not_running', project: { tracks: ['saved'] } });
  });

  it('answers as the host does at its 3 s wait, and the command still reaches the DAW when the link lets it through', async () => {
    const { api, reached } = host();
    const stop = watch(slowed(api, '10s').readAloudRecordStop());
    await vi.advanceTimersByTimeAsync(3_000);
    expect(stop.answer).toMatchObject({ outcome: 'refused', reason: 'not_running' });
    expect(reached).toEqual([]);
    await vi.advanceTimersByTimeAsync(7_000);
    expect(reached).toEqual(['readAloudRecordStop']);
  });

  it('waits the long wait for a voice switch and for the arm, and reads the track list once for both', async () => {
    const { api, reached } = host();
    const slow = slowed(api, 'delay=4s,only=boothVoiceSet+dawArmBoothVoice');
    const voice = watch(slow.boothVoiceSet('c1', 'g2'));
    // The track list is read first (4 s, inside its 7 s), then the arm (4 s, inside the long wait): the switch is answered, late.
    await vi.advanceTimersByTimeAsync(8_000);
    expect(voice.answer).toEqual({ outcome: 'selected' });
    // The list is kept, so the arm is one command: 4 s, past the 3 s answer wait and inside the long wait of an arm REAPER has read.
    const arm = watch(slow.dawArmBoothVoice('c1'));
    await vi.advanceTimersByTimeAsync(3_999);
    expect(arm.answer).toBeUndefined();
    await vi.advanceTimersByTimeAsync(1);
    expect(arm.answer).toEqual({ ok: true });
    expect(reached).toEqual(['boothVoiceSet', 'dawArmBoothVoice']);
  });

  it('hands out a kept track list past its age while one read behind it brings the next, and never past the bound', async () => {
    const { api } = host();
    const slow = slowed(api, '2s');
    const state = () => watch(slow.readAloudReaperState('c1'));
    const first = state();
    await vi.advanceTimersByTimeAsync(4_000); // the list (2 s), then the state (2 s)
    expect(first.answer).toEqual({ status: 'ready' });
    await vi.advanceTimersByTimeAsync(11_000); // the list is 13 s old: past its age, inside the bound
    const stale = state();
    await vi.advanceTimersByTimeAsync(2_000); // the state alone: the list did not cost a round trip
    expect(stale.answer).toEqual({ status: 'ready' });
    await vi.advanceTimersByTimeAsync(40_000); // nothing read the list for longer than the bound
    const cold = state();
    await vi.advanceTimersByTimeAsync(2_000);
    expect(cold.answer).toBeUndefined();
    await vi.advanceTimersByTimeAsync(2_000);
    expect(cold.answer).toEqual({ status: 'ready' });
  });

  it('never delivers a dropped command', async () => {
    const { api, reached } = host();
    const slow = slowed(api, 'drop=1,only=readAloudRecordStop');
    const first = watch(slow.readAloudRecordStop());
    await vi.advanceTimersByTimeAsync(60_000);
    expect(first.answer).toMatchObject({ outcome: 'refused' });
    expect(reached).toEqual([]);
    await expect(slow.readAloudRecordStop()).resolves.toEqual({ outcome: 'stopped' });
  });

  it("holds REAPER's events during a stall and delivers them in order when it ends", async () => {
    const { api, emit } = host();
    const heard: unknown[] = [];
    slowed(api, 'stall=8s').subscribeDawTransport((event) => heard.push(event));
    emit('a');
    await vi.advanceTimersByTimeAsync(4_000);
    emit('b');
    expect(heard).toEqual([]);
    await vi.advanceTimersByTimeAsync(4_000);
    expect(heard).toEqual(['a', 'b']);
    emit('c');
    expect(heard).toEqual(['a', 'b', 'c']);
  });

  it('names only calls and events the api has', () => {
    const api = createMockApi() as unknown as Record<string, unknown>;
    const missing = [...Object.keys(DAW_CALLS), ...DAW_EVENTS].filter((name) => typeof api[name] !== 'function');
    expect(missing).toEqual([]);
  });
});
