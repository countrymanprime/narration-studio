import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { MOCK_DAY, pinnedDayScript } from './lib/pinnedDay';

// A page whose real clock reads `realNowMs` when the script runs, ticking by `tickMs` before the page reads it.
function readsOn(realNowMs: number, tickMs = 0): { today: string; now: number; asString: string; iso: string; fixedArg: number } {
  let real = realNowMs;
  class FakeReal extends Date {
    constructor(...args: unknown[]) {
      super(...((args.length === 0 ? [real] : args) as [number]));
    }
    static override now(): number {
      return real;
    }
  }
  const sandbox: { Date: typeof Date } = { Date: FakeReal as unknown as typeof Date };
  runInNewContext(pinnedDayScript(MOCK_DAY.getTime()), Object.assign(sandbox, { globalThis: sandbox }));
  real += tickMs;
  const read = runInNewContext(
    `({ today: new Date().toISOString().slice(0, 10), now: Date.now(), asString: typeof Date(), iso: new Date(0).toISOString(), fixedArg: new Date(2020, 0, 2).getFullYear() })`,
    sandbox,
  );
  return read;
}

describe('pinnedDayScript', () => {
  it('reads the same day whichever day the real clock is on', () => {
    const before = readsOn(Date.UTC(2026, 10, 11, 23, 55));
    const after = readsOn(Date.UTC(2026, 10, 12, 0, 5));
    expect(after.today).toBe(before.today);
    expect(before.today).toBe(MOCK_DAY.toISOString().slice(0, 10));
  });
  it('keeps ticking from that day', () => {
    const start = readsOn(Date.UTC(2026, 10, 12), 0).now;
    expect(readsOn(Date.UTC(2026, 10, 12), 5_000).now - start).toBe(5_000);
  });
  it('leaves a Date built from arguments alone, and Date() a string', () => {
    const read = readsOn(Date.UTC(2026, 10, 12));
    expect(read).toMatchObject({ iso: '1970-01-01T00:00:00.000Z', fixedArg: 2020, asString: 'string' });
  });
});
