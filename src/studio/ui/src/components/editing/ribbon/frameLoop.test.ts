import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { frameSubscribers, subscribeFrames } from './frameLoop';

let queue: Map<number, FrameRequestCallback>;
let next: number;
const run = (now: number): void => {
  const due = [...queue.values()];
  queue.clear();
  for (const cb of due) cb(now);
};
beforeEach(() => {
  queue = new Map();
  next = 1;
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    queue.set(next, cb);
    return next++;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => queue.delete(id));
});
afterEach(() => vi.unstubAllGlobals());

describe('frameLoop', () => {
  it('schedules nothing until something subscribes', () => {
    expect(queue.size).toBe(0);
    expect(frameSubscribers()).toBe(0);
  });

  it('runs one requestAnimationFrame for any number of subscribers, and hands each the frame time', () => {
    const a = vi.fn();
    const b = vi.fn();
    const stopA = subscribeFrames(a);
    const stopB = subscribeFrames(b);
    expect(queue.size).toBe(1);
    run(16);
    expect(a).toHaveBeenCalledWith(16);
    expect(b).toHaveBeenCalledWith(16);
    expect(queue.size).toBe(1);
    run(32);
    expect(a).toHaveBeenCalledTimes(2);
    stopA();
    run(48);
    expect(a).toHaveBeenCalledTimes(2);
    expect(b).toHaveBeenCalledTimes(3);
    stopB();
  });

  it('cancels its pending frame when the last subscriber leaves, and starts again for the next', () => {
    const stop = subscribeFrames(vi.fn());
    expect(queue.size).toBe(1);
    stop();
    expect(queue.size).toBe(0);
    expect(frameSubscribers()).toBe(0);
    const again = subscribeFrames(vi.fn());
    expect(queue.size).toBe(1);
    again();
  });

  it('lets a callback unsubscribe itself mid-frame without skipping the others', () => {
    const seen: string[] = [];
    let stopFirst = (): void => {};
    stopFirst = subscribeFrames(() => {
      seen.push('first');
      stopFirst();
    });
    const stopSecond = subscribeFrames(() => seen.push('second'));
    run(1);
    run(2);
    expect(seen).toEqual(['first', 'second', 'second']);
    stopSecond();
    expect(queue.size).toBe(0);
  });
});
