import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LinkClock, parseDawLatency, slows } from './dawLatency';

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
