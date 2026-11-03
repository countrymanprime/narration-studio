import { describe, expect, it, vi } from 'vitest';
import { trackIntervals, type IntervalHost } from './leakedIntervals';

function fakeHost() {
  const armed = new Map<number, () => void>();
  let next = 1;
  const host = {
    setInterval: ((fn: () => void) => {
      const id = next++;
      armed.set(id, fn);
      return id;
    }) as IntervalHost['setInterval'],
    clearInterval: vi.fn((id: number) => void armed.delete(id)) as unknown as IntervalHost['clearInterval'],
  };
  return { host, armed };
}

describe('trackIntervals', () => {
  it('clears an interval armed at import when the file ends', () => {
    const { host, armed } = fakeHost();
    const dispose = trackIntervals(host);
    (host.setInterval as (fn: () => void) => number)(() => undefined);
    expect(armed.size).toBe(1);
    dispose();
    expect(armed.size).toBe(0);
  });

  it('clears every interval and returns the original setInterval', () => {
    const { host, armed } = fakeHost();
    const original = host.setInterval;
    const dispose = trackIntervals(host);
    const set = host.setInterval as (fn: () => void) => number;
    set(() => undefined);
    set(() => undefined);
    dispose();
    expect(armed.size).toBe(0);
    expect(host.setInterval).toBe(original);
  });

  it('hands back the id the host produced', () => {
    const { host } = fakeHost();
    trackIntervals(host);
    expect((host.setInterval as (fn: () => void) => number)(() => undefined)).toBe(1);
  });
});
