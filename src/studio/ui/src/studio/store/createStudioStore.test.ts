// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WireError } from '../../api/wire/WireError';
import type { StandardSchemaV1 } from '../../api/wire/standardSchema';
import { createStudioStore, type SlotConfig, type StudioStore } from './createStudioStore';

// Hand-written Standard Schemas: the store takes any, and src/studio does not import Zod (zod-only-in-api).
function schemaOf<T>(check: (v: unknown) => v is T): StandardSchemaV1<unknown, T> {
  return { '~standard': { version: 1, vendor: 'test', validate: (v) => (check(v) ? { value: v } : { issues: [{ message: 'wrong shape', path: [] }] }) } };
}
const isCount = schemaOf((v): v is { count: number } => typeof v === 'object' && v !== null && typeof (v as { count?: unknown }).count === 'number');
const isName = schemaOf((v): v is string => typeof v === 'string');

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** A fake of the host's event bus: `emit` calls every handler registered for the name. */
function fakeEvents() {
  const handlers = new Map<string, Set<() => void>>();
  return {
    subscribe: (event: string, handler: () => void) => {
      (handlers.get(event) ?? handlers.set(event, new Set()).get(event)!).add(handler);
      return () => handlers.get(event)?.delete(handler);
    },
    emit: (event: string) => handlers.get(event)?.forEach((h) => h()),
    listeners: (event: string) => handlers.get(event)?.size ?? 0,
  };
}
function fakeFocus() {
  const set = new Set<() => void>();
  return {
    subscribeFocus: (h: () => void) => {
      set.add(h);
      return () => set.delete(h);
    },
    focus: () => set.forEach((h) => h()),
    count: () => set.size,
  };
}
const flush = () => new Promise<void>((r) => setTimeout(r, 0));

type TestRegistry = Record<string, SlotConfig>;
type Loose = StudioStore<TestRegistry> & { load(slot: string): Promise<void> };

function make(registry: TestRegistry) {
  const events = fakeEvents();
  const focus = fakeFocus();
  const onError = vi.fn();
  const store: Loose = createStudioStore({ registry, subscribe: events.subscribe, subscribeFocus: focus.subscribeFocus, onError });
  return { store, events, focus, onError };
}

afterEach(() => vi.restoreAllMocks());

describe('store-starts-empty-and-hydrates', () => {
  it('is empty until the injected loader resolves, then holds what the schema returned', async () => {
    const gate = deferred<unknown>();
    const { store } = make({ jobs: { schema: isCount, load: () => gate.promise } });
    expect(store.getState().slots.jobs).toBeUndefined();
    const loading = store.load('jobs');
    expect(store.getState().slots.jobs).toBeUndefined();
    gate.resolve({ count: 3 });
    await loading;
    expect(store.getState().slots.jobs).toEqual({ count: 3 });
  });

  it('fails loudly on a wrong shape: the load rejects with a WireError, the error is reported and recorded, and nothing is cached', async () => {
    const { store, onError } = make({ jobs: { schema: isCount, load: () => Promise.resolve({ count: 'three' }) } });
    await expect(store.load('jobs')).rejects.toBeInstanceOf(WireError);
    expect(store.getState().slots.jobs).toBeUndefined();
    expect(store.getState().errors.jobs).toBeInstanceOf(WireError);
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it('keeps the last good value when a later load fails, and clears the error on the next good load', async () => {
    let answer: unknown = { count: 1 };
    const { store } = make({ jobs: { schema: isCount, load: () => Promise.resolve(answer) } });
    await store.load('jobs');
    answer = { nope: true };
    await expect(store.load('jobs')).rejects.toBeInstanceOf(WireError);
    expect(store.getState().slots.jobs).toEqual({ count: 1 });
    answer = { count: 2 };
    await store.load('jobs');
    expect(store.getState().slots.jobs).toEqual({ count: 2 });
    expect(store.getState().errors.jobs).toBeUndefined();
  });

  it('keeps the identity of every other slot when one slot loads', async () => {
    const { store } = make({
      jobs: { schema: isCount, load: () => Promise.resolve({ count: 1 }) },
      name: { schema: isName, load: () => Promise.resolve('Ada') },
    });
    await store.load('jobs');
    const before = store.getState().slots.jobs;
    await store.load('name');
    expect(store.getState().slots.jobs).toBe(before);
  });
});

describe('event-refreshes-the-slot', () => {
  it.each(['job:ended', 'pickups:state', 'daw_capabilities_changed'])('%s reloads the mapped slot once', async (event) => {
    const load = vi.fn().mockResolvedValue({ count: 1 });
    const { store, events } = make({ slot: { schema: isCount, load, events: [event] } });
    const stop = store.start();
    events.emit(event);
    await flush();
    expect(load).toHaveBeenCalledTimes(1);
    expect(store.getState().slots.slot).toEqual({ count: 1 });
    stop();
    expect(events.listeners(event)).toBe(0);
  });

  it('does nothing for a name no slot maps, and one event reloads every slot mapped to it', async () => {
    const a = vi.fn().mockResolvedValue({ count: 1 });
    const b = vi.fn().mockResolvedValue('x');
    const { store, events } = make({
      a: { schema: isCount, load: a, events: ['job:ended'] },
      b: { schema: isName, load: b, events: ['job:ended', 'pickups:state'] },
    });
    store.start();
    events.emit('something:else');
    await flush();
    expect(a).not.toHaveBeenCalled();
    events.emit('job:ended');
    await flush();
    expect([a.mock.calls.length, b.mock.calls.length]).toEqual([1, 1]);
  });

  it('a failed event reload is reported, not thrown', async () => {
    const { store, events, onError } = make({ a: { schema: isCount, load: () => Promise.reject(new Error('host down')), events: ['job:ended'] } });
    store.start();
    events.emit('job:ended');
    await flush();
    expect(onError).toHaveBeenCalledWith('a', expect.objectContaining({ message: 'host down' }));
    expect(store.getState().errors.a).toBeInstanceOf(Error);
  });

  it('a newer load wins over an older one that resolves later', async () => {
    const first = deferred<unknown>();
    const second = deferred<unknown>();
    const loads = [first, second];
    const { store } = make({ a: { schema: isCount, load: () => loads.shift()!.promise } });
    const p1 = store.load('a');
    const p2 = store.load('a');
    second.resolve({ count: 2 });
    await p2;
    first.resolve({ count: 1 });
    await p1;
    expect(store.getState().slots.a).toEqual({ count: 2 });
  });
});

describe('focus-refetches', () => {
  it('reloads only the slots declared refreshOnFocus when the window regains focus', async () => {
    const focused = vi.fn().mockResolvedValue({ count: 1 });
    const other = vi.fn().mockResolvedValue('x');
    const { store, focus } = make({ f: { schema: isCount, load: focused, refreshOnFocus: true }, o: { schema: isName, load: other } });
    const stop = store.start();
    focus.focus();
    await flush();
    expect(focused).toHaveBeenCalledTimes(1);
    expect(other).not.toHaveBeenCalled();
    stop();
    expect(focus.count()).toBe(0);
  });

  it('the default source follows window focus and visibility, throttled to once per interval, like useRefreshOnFocus', async () => {
    vi.useFakeTimers();
    try {
      const load = vi.fn().mockResolvedValue({ count: 1 });
      const events = fakeEvents();
      const store = createStudioStore({ registry: { f: { schema: isCount, load, refreshOnFocus: true } }, subscribe: events.subscribe });
      const stop = store.start();
      vi.setSystemTime(new Date('2026-10-11T10:00:00Z'));
      window.dispatchEvent(new Event('focus'));
      window.dispatchEvent(new Event('focus'));
      await vi.advanceTimersByTimeAsync(10_000);
      window.dispatchEvent(new Event('focus'));
      expect(load).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(30_000);
      document.dispatchEvent(new Event('visibilitychange'));
      expect(load).toHaveBeenCalledTimes(2);
      stop();
      window.dispatchEvent(new Event('focus'));
      expect(load).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('ensure settled', () => {
  const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

  it('waits for a refresh in flight when a value is held, and serves at once without the option', async () => {
    const gate = deferred<unknown>();
    let calls = 0;
    const { store } = make({ a: { schema: isCount, load: () => (++calls === 1 ? Promise.resolve({ count: 1 }) : gate.promise) } });
    await store.load('a');
    const refresh = store.load('a');
    let served = false;
    void store.ensure('a').then(() => (served = true));
    let settled = false;
    void store.ensure('a', { settled: true }).then(() => (settled = true));
    await flush();
    expect(served).toBe(true);
    expect(settled).toBe(false);
    gate.resolve({ count: 2 });
    await refresh;
    await flush();
    expect(settled).toBe(true);
    expect(store.getState().slots.a).toEqual({ count: 2 });
  });

  it('keeps the held value when the refresh it waited for fails', async () => {
    const gate = deferred<unknown>();
    let calls = 0;
    const { store } = make({ a: { schema: isCount, load: () => (++calls === 1 ? Promise.resolve({ count: 1 }) : gate.promise) } });
    await store.load('a');
    const refresh = store.load('a').catch(() => undefined);
    const waiting = store.ensure('a', { settled: true });
    gate.reject(new Error('offline'));
    await refresh;
    await expect(waiting).resolves.toBeUndefined();
    expect(store.getState().slots.a).toEqual({ count: 1 });
  });

  it('waits for the read an event queued behind the flight it joined', async () => {
    const first = deferred<unknown>();
    const second = deferred<unknown>();
    let calls = 0;
    const { store } = make({
      a: { schema: isCount, load: () => (++calls === 1 ? Promise.resolve({ count: 1 }) : calls === 2 ? first.promise : second.promise), topics: ['t'] },
    });
    await store.load('a');
    store.publish('t');
    store.publish('t');
    let settled = false;
    void store.ensure('a', { settled: true }).then(() => (settled = true));
    first.resolve({ count: 2 });
    await flush();
    expect(settled).toBe(false);
    second.resolve({ count: 3 });
    await flush();
    expect(settled).toBe(true);
    expect(store.getState().slots.a).toEqual({ count: 3 });
  });

  it('serves the held value once the read it waits for is as old as the store would still join', async () => {
    vi.useFakeTimers();
    try {
      const never = deferred<unknown>();
      let calls = 0;
      const { store } = make({ a: { schema: isCount, load: () => (++calls === 1 ? Promise.resolve({ count: 1 }) : never.promise) } });
      await store.load('a');
      void store.load('a');
      let settled = false;
      void store.ensure('a', { settled: true }).then(() => (settled = true));
      await vi.advanceTimersByTimeAsync(4000);
      expect(settled).toBe(false);
      await vi.advanceTimersByTimeAsync(1500);
      expect(settled).toBe(true);
      expect(store.getState().slots.a).toEqual({ count: 1 });
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('store-is-throwaway', () => {
  it('counts each reset in generation(), so a reader can tell the project it read for', () => {
    const { store } = make({ a: { schema: isCount, load: () => Promise.resolve({ count: 1 }) } });
    expect(store.generation()).toBe(0);
    store.reset();
    store.reset();
    expect(store.generation()).toBe(2);
  });

  it('reset() empties every slot and an in-flight load of the old project writes nothing', async () => {
    const gate = deferred<unknown>();
    const { store } = make({ a: { schema: isCount, load: () => gate.promise }, b: { schema: isName, load: () => Promise.resolve('Ada') } });
    await store.load('b');
    const inFlight = store.load('a');
    store.reset();
    expect(store.getState().slots).toEqual({});
    expect(store.getState().errors).toEqual({});
    gate.resolve({ count: 9 });
    await inFlight;
    expect(store.getState().slots.a).toBeUndefined();
  });

  it('an in-flight failure after reset is not recorded either, and subscribers hear about the reset', async () => {
    const gate = deferred<unknown>();
    const { store, onError } = make({ a: { schema: isCount, load: () => gate.promise } });
    const listener = vi.fn();
    store.subscribe(listener);
    const inFlight = store.load('a');
    store.reset();
    expect(listener).toHaveBeenCalledTimes(1);
    gate.reject(new Error('late'));
    await inFlight;
    expect(store.getState().errors).toEqual({});
    expect(onError).not.toHaveBeenCalled();
  });

  it('keeps its event subscriptions across a reset, so the new project hydrates on the next event', async () => {
    const load = vi.fn().mockResolvedValue({ count: 1 });
    const { store, events } = make({ a: { schema: isCount, load, events: ['job:ended'] } });
    store.start();
    store.reset();
    events.emit('job:ended');
    await flush();
    expect(store.getState().slots.a).toEqual({ count: 1 });
  });
});

describe('publish-refreshes-the-slots-that-list-the-topic', () => {
  const counted = () => {
    let n = 0;
    return { load: vi.fn(async () => ({ count: ++n })), reads: () => n };
  };

  it('reads the slots that list the topic, and only those, with no start() and no host subscription', async () => {
    const chapters = counted();
    const other = counted();
    const { store, events } = make({
      chapters: { schema: isCount, load: chapters.load, topics: ['manuscript:changed'] },
      other: { schema: isCount, load: other.load, topics: ['other:changed'] },
    });
    store.publish('manuscript:changed');
    await flush();
    expect(chapters.reads()).toBe(1);
    expect(other.reads()).toBe(0);
    expect(store.getState().slots.chapters).toEqual({ count: 1 });
    expect(events.listeners('manuscript:changed')).toBe(0);
  });

  it('ignores a topic no slot lists, and a host event of the same name does not stand in for it', async () => {
    const chapters = counted();
    const { store, events } = make({ chapters: { schema: isCount, load: chapters.load, topics: ['manuscript:changed'] } });
    store.start();
    store.publish('nobody:listens');
    events.emit('manuscript:changed');
    await flush();
    expect(chapters.reads()).toBe(0);
  });

  it('a lost publish costs nothing: the next focus still reads, and a duplicate publish ends on the newest answer', async () => {
    const first = deferred<unknown>();
    const second = deferred<unknown>();
    const answers = [first, second];
    const load = vi.fn(() => answers.shift()!.promise);
    const { store } = make({ chapters: { schema: isCount, load, topics: ['t'], refreshOnFocus: true } });
    store.publish('t');
    store.publish('t');
    second.resolve({ count: 2 });
    await flush();
    first.resolve({ count: 1 });
    await flush();
    expect(store.getState().slots.chapters).toEqual({ count: 2 });
  });

  it('a failed read is recorded and reported, keeps the last good value and throws nothing', async () => {
    const load = vi.fn().mockResolvedValueOnce({ count: 1 }).mockRejectedValueOnce(new Error('host down'));
    const { store, onError } = make({ chapters: { schema: isCount, load, topics: ['t'] } });
    await store.load('chapters');
    expect(() => store.publish('t')).not.toThrow();
    await flush();
    expect(onError).toHaveBeenCalledTimes(1);
    expect(store.getState().slots.chapters).toEqual({ count: 1 });
    expect(store.getState().errors.chapters).toBeInstanceOf(Error);
  });

  it('a publish that is answered after the project switched writes nothing', async () => {
    const late = deferred<unknown>();
    const { store } = make({ chapters: { schema: isCount, load: () => late.promise, topics: ['t'] } });
    store.publish('t');
    store.reset();
    late.resolve({ count: 9 });
    await flush();
    expect(store.getState().slots.chapters).toBeUndefined();
  });
});

describe('ensure: a mounting page does not read what the store holds (#3658)', () => {
  it('reads an empty slot once for callers that mount together, and answers at once afterwards', async () => {
    const gate = deferred<unknown>();
    const load = vi.fn(() => gate.promise);
    const { store } = make({ jobs: { schema: isCount, load } });
    const first = store.ensure('jobs');
    const second = store.ensure('jobs');
    expect(load).toHaveBeenCalledTimes(1);
    gate.resolve({ count: 3 });
    await Promise.all([first, second]);
    await store.ensure('jobs');
    expect(load).toHaveBeenCalledTimes(1);
    expect(store.getState().slots.jobs).toEqual({ count: 3 });
  });

  it('serves a loaded slot while what made it stale refreshes it in the background', async () => {
    const refresh = deferred<unknown>();
    const load = vi.fn().mockResolvedValueOnce({ count: 1 }).mockReturnValueOnce(refresh.promise);
    const { store, events } = make({ jobs: { schema: isCount, load, events: ['job:ended'] } });
    store.start();
    await store.ensure('jobs');
    events.emit('job:ended');
    await store.ensure('jobs'); // answers at once from the held value, the refresh still out
    expect(store.getState().slots.jobs).toEqual({ count: 1 });
    refresh.resolve({ count: 2 });
    await flush();
    expect(store.getState().slots.jobs).toEqual({ count: 2 });
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('rejects every caller that joined a failed read, then reads again for the next one', async () => {
    const load = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ count: 5 });
    const { store } = make({ jobs: { schema: isCount, load } });
    const a = store.ensure('jobs');
    const b = store.ensure('jobs');
    await expect(a).rejects.toThrow('offline');
    await expect(b).rejects.toThrow('offline');
    await store.ensure('jobs');
    expect(store.getState().slots.jobs).toEqual({ count: 5 });
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('reads again after reset (a project switch), not from the old project', async () => {
    const load = vi.fn().mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 9 });
    const { store } = make({ jobs: { schema: isCount, load } });
    await store.ensure('jobs');
    store.reset();
    await store.ensure('jobs');
    expect(store.getState().slots.jobs).toEqual({ count: 9 });
    expect(load).toHaveBeenCalledTimes(2);
  });
});

describe('a burst of events and an ensure beside other reads (#3658)', () => {
  it('reads once and once more for a burst of events, not once for each', async () => {
    const gate = deferred<unknown>();
    const load = vi.fn().mockReturnValueOnce(gate.promise).mockResolvedValue({ count: 2 });
    const { store, events } = make({ jobs: { schema: isCount, load, events: ['sync'] } });
    store.start();
    for (let i = 0; i < 50; i += 1) events.emit('sync');
    expect(load).toHaveBeenCalledTimes(1);
    gate.resolve({ count: 1 });
    await flush();
    await flush();
    expect(load).toHaveBeenCalledTimes(2);
    expect(store.getState().slots.jobs).toEqual({ count: 2 });
  });

  it('ensure joins a read that a load or an event started', async () => {
    const gate = deferred<unknown>();
    const load = vi.fn().mockReturnValue(gate.promise);
    const { store } = make({ jobs: { schema: isCount, load } });
    const loading = store.load('jobs');
    const ensuring = store.ensure('jobs');
    expect(load).toHaveBeenCalledTimes(1);
    gate.resolve({ count: 4 });
    await Promise.all([loading, ensuring]);
    expect(store.getState().slots.jobs).toEqual({ count: 4 });
  });
});

describe('a read that never answers does not freeze a slot (#3658)', () => {
  it('reads again for an event after a refresh has been out longer than the stuck age, and an ensure does not join it', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      const never = new Promise<unknown>(() => undefined);
      const load = vi.fn().mockReturnValueOnce(never).mockResolvedValue({ count: 2 });
      const { store, events } = make({ jobs: { schema: isCount, load, events: ['sync'] } });
      store.start();
      events.emit('sync');
      for (let i = 0; i < 100; i += 1) events.emit('sync');
      expect(load).toHaveBeenCalledTimes(1);
      vi.setSystemTime(Date.now() + 5001);
      events.emit('sync');
      await vi.advanceTimersByTimeAsync(0);
      await flush();
      expect(load).toHaveBeenCalledTimes(2);
      expect(store.getState().slots.jobs).toEqual({ count: 2 });
    } finally {
      vi.useRealTimers();
    }
  });

  it('a slow read that answers while events keep starting newer ones still fills the slot (older answers are not dropped)', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      const gates: Array<ReturnType<typeof deferred<unknown>>> = [];
      const load = vi.fn(() => {
        const g = deferred<unknown>();
        gates.push(g);
        return g.promise;
      });
      const { store, events } = make({ jobs: { schema: isCount, load, events: ['sync'] } });
      store.start();
      events.emit('sync');
      vi.setSystemTime(Date.now() + 5500);
      events.emit('sync'); // the first read is stuck: a newer one starts
      expect(load).toHaveBeenCalledTimes(2);
      gates[0]!.resolve({ count: 1 }); // the older one answers, no newer answer yet
      await vi.advanceTimersByTimeAsync(0);
      await flush();
      expect(store.getState().slots.jobs).toEqual({ count: 1 });
      gates[1]!.resolve({ count: 2 });
      await vi.advanceTimersByTimeAsync(0);
      await flush();
      expect(store.getState().slots.jobs).toEqual({ count: 2 });
    } finally {
      vi.useRealTimers();
    }
  });

  it('an older read that answers after a newer one answered writes nothing', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      const gates: Array<ReturnType<typeof deferred<unknown>>> = [];
      const load = vi.fn(() => {
        const g = deferred<unknown>();
        gates.push(g);
        return g.promise;
      });
      const { store, events } = make({ jobs: { schema: isCount, load, events: ['sync'] } });
      store.start();
      events.emit('sync');
      vi.setSystemTime(Date.now() + 5500);
      events.emit('sync');
      gates[1]!.resolve({ count: 2 });
      await vi.advanceTimersByTimeAsync(0);
      await flush();
      gates[0]!.resolve({ count: 1 });
      await vi.advanceTimersByTimeAsync(0);
      await flush();
      expect(store.getState().slots.jobs).toEqual({ count: 2 });
    } finally {
      vi.useRealTimers();
    }
  });

  it('an ensure after the read has been out longer than the stuck age starts a new read, and one joined earlier settles with it', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      const never = new Promise<unknown>(() => undefined);
      const load = vi.fn().mockReturnValueOnce(never).mockResolvedValue({ count: 4 });
      const { store } = make({ jobs: { schema: isCount, load } });
      void store.ensure('jobs');
      vi.setSystemTime(Date.now() + 5001);
      await store.ensure('jobs');
      expect(load).toHaveBeenCalledTimes(2);
      expect(store.getState().slots.jobs).toEqual({ count: 4 });
    } finally {
      vi.useRealTimers();
    }
  });

  it('a clock set back counts as stuck, not as young forever', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      const never = new Promise<unknown>(() => undefined);
      const load = vi.fn().mockReturnValueOnce(never).mockResolvedValue({ count: 5 });
      const { store } = make({ jobs: { schema: isCount, load } });
      void store.ensure('jobs');
      vi.setSystemTime(Date.now() - 60_000);
      await store.ensure('jobs');
      expect(load).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('an event that arrives while a load is in flight is read after it, even when an earlier refresh never answers', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      const gates: Array<ReturnType<typeof deferred<unknown>>> = [];
      const load = vi.fn(() => {
        const g = deferred<unknown>();
        gates.push(g);
        return g.promise;
      });
      const { store, events } = make({ jobs: { schema: isCount, load, events: ['sync'] } });
      store.start();
      events.emit('sync'); // R1 never answers
      vi.setSystemTime(Date.now() + 6000);
      void store.load('jobs').catch(() => undefined); // L
      vi.setSystemTime(Date.now() + 500);
      events.emit('sync'); // announced while L is out
      gates[1]!.resolve({ count: 1 }); // L answers with what it read before the event
      await vi.advanceTimersByTimeAsync(0);
      await flush();
      expect(load).toHaveBeenCalledTimes(3);
      gates[2]!.resolve({ count: 2 });
      await vi.advanceTimersByTimeAsync(0);
      await flush();
      expect(store.getState().slots.jobs).toEqual({ count: 2 });
    } finally {
      vi.useRealTimers();
    }
  });

  it('an event that arrives while a load is merely slow is read after the load, whatever the refresh before it does', async () => {
    const gates: Array<ReturnType<typeof deferred<unknown>>> = [];
    const load = vi.fn(() => {
      const g = deferred<unknown>();
      gates.push(g);
      return g.promise;
    });
    const { store, events } = make({ jobs: { schema: isCount, load, events: ['sync'] } });
    store.start();
    events.emit('sync'); // R1
    void store.load('jobs').catch(() => undefined); // L
    events.emit('sync');
    gates[1]!.resolve({ count: 1 });
    await flush();
    expect(load).toHaveBeenCalledTimes(3);
  });

  it('an ensure does not make a read joinable past the stuck age by joining it late', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      const never = new Promise<unknown>(() => undefined);
      const load = vi.fn().mockReturnValueOnce(never).mockResolvedValue({ count: 6 });
      const { store } = make({ jobs: { schema: isCount, load, events: ['sync'] } });
      store.start();
      void store.load('jobs').catch(() => undefined); // out from 0
      vi.setSystemTime(Date.now() + 4900);
      void store.ensure('jobs'); // joins legitimately
      vi.setSystemTime(Date.now() + 4100); // 9 s after the read started
      await store.ensure('jobs');
      expect(load).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('ensure of a name that is not a registered slot rejects, even a name Object.prototype has', async () => {
    const { store } = make({ jobs: { schema: isCount, load: vi.fn().mockResolvedValue({ count: 1 }) } });
    await expect((store as unknown as { ensure: (n: string) => Promise<void> }).ensure('constructor')).rejects.toThrow(/no slot/);
  });

  it('a refresh dropped by a reset does not release the refresh of the new project', async () => {
    const first = deferred<unknown>();
    const second = deferred<unknown>();
    const load = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise).mockResolvedValue({ count: 3 });
    const { store, events } = make({ jobs: { schema: isCount, load, events: ['sync'] } });
    store.start();
    events.emit('sync'); // R0
    store.reset();
    events.emit('sync'); // R1, the new project's
    first.resolve({ count: 1 }); // R0 answers late and ends
    await flush();
    for (let i = 0; i < 5; i += 1) events.emit('sync');
    expect(load).toHaveBeenCalledTimes(2); // no third read while R1 is out
    second.resolve({ count: 2 });
    await flush();
    await flush();
  });
});
