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

describe('store-is-throwaway', () => {
  it('counts each reset in generation(), so a reader can tell the project it read for', () => {
    const { store } = make({ a: { schema: isCount, load: () => Promise.resolve({ count: 1 }) } });
    expect(store.generation()).toBe(0);
    store.reset();
    store.reset();
    expect(store.generation()).toBe(2);
  });

  it('reset() empties every slot, and an in-flight load of the old project writes nothing: the load reads again for the project it is on', async () => {
    const gate = deferred<unknown>();
    const load = vi.fn().mockReturnValueOnce(gate.promise).mockResolvedValue({ count: 2 });
    const { store } = make({ a: { schema: isCount, load }, b: { schema: isName, load: () => Promise.resolve('Ada') } });
    await store.load('b');
    const inFlight = store.load('a');
    store.reset();
    expect(store.getState().slots).toEqual({});
    expect(store.getState().errors).toEqual({});
    gate.resolve({ count: 9 });
    await inFlight;
    // The answer the reset dropped was never written; the read the load made again was.
    expect(store.getState().slots.a).toEqual({ count: 2 });
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('an in-flight failure after reset is not recorded either, and subscribers hear about the reset', async () => {
    const gate = deferred<unknown>();
    const load = vi.fn().mockReturnValueOnce(gate.promise).mockResolvedValue({ count: 1 });
    const { store, onError } = make({ a: { schema: isCount, load } });
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

  it('a load that every reset drops is read at most three times, then settles with nothing held', async () => {
    const gates = [deferred<unknown>(), deferred<unknown>(), deferred<unknown>(), deferred<unknown>()];
    let n = 0;
    const { store } = make({ a: { schema: isCount, load: () => gates[n++]!.promise } });
    const inFlight = store.load('a');
    for (const g of gates.slice(0, 3)) {
      store.reset();
      g.resolve({ count: 1 });
      await flush();
    }
    await inFlight;
    expect(n).toBe(3);
    expect(store.getState().slots.a).toBeUndefined();
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

// The ownership rules hold for both forms of slot: one that reads with the host's stamp (the chapter list, #4040) and one that does not and is held under the
// project the store believes it is on (the bookmarks).
describe.each(['read', 'load'] as const)('the store knows which project a held list belongs to (#3998), over a slot with %s', (form) => {
  type Stamped = () => Promise<{ project: string; payload: unknown }>;
  /** The slot's config over a stamped read: `read` keeps the stamp, `load` is the same host answer without it. */
  const slotOver = (read: Stamped): SlotConfig => (form === 'read' ? { schema: isCount, read } : { schema: isCount, load: async () => (await read()).payload });
  /** A slot whose read answers with the project the host is on now and says so, as `manuscriptChapters` does: the host, not the page, decides (#4040). */
  const hostOn = (initial: string) => {
    const host = { project: initial };
    const read = vi.fn(async () => ({ project: host.project, payload: { count: host.project === 'A' ? 1 : 2 } }));
    return { host, read, slot: slotOver(read) };
  };

  it('records the project each held value was read for', async () => {
    const { slot } = hostOn('A');
    const { store } = make({ a: slot });
    store.setProject('A');
    await store.ensure('a', { project: 'A' });
    expect(store.projectOf('a')).toBe('A');
    expect(store.project()).toBe('A');
  });

  it('the same folder spelled another way is the same project: nothing held is dropped and a reader on that spelling is served (#4099)', async () => {
    const { slot, read } = hostOn('C:/P/X');
    const { store } = make({ a: slot });
    store.setProject('C:/P/X');
    await store.ensure('a', { project: 'C:/P/X' });
    store.setProject('C:\\P\\X\\');
    expect(store.getState().slots.a).toEqual({ count: 2 });
    await store.ensure('a', { project: 'C:\\P\\X' });
    expect(read).toHaveBeenCalledTimes(1);
    store.setProject('C:/P/Y');
    expect(store.getState().slots.a).toBeUndefined();
  });

  it('the folder changes before the store resets: the store is told, empties, and reads fresh for the new folder (R10-10)', async () => {
    const { host, read, slot } = hostOn('A');
    const { store } = make({ a: slot });
    store.setProject('A');
    await store.ensure('a', { project: 'A' });
    host.project = 'B';
    const asked = store.ensure('a', { project: 'B' });
    store.setProject('B'); // the app's effect, in the same commit as the page's mount
    await asked;
    expect(store.getState().slots.a).toEqual({ count: 2 });
    expect(store.projectOf('a')).toBe('B');
    expect(read).toHaveBeenCalledTimes(2);
  });

  it('the store resets before the folder changes: a reader on the old folder reads nothing until the host answers, then is told the project changed (R9-1, R10-1)', async () => {
    const { host, read, slot } = hostOn('A');
    const { store } = make({ a: slot });
    store.setProject('A');
    await store.ensure('a', { project: 'A' });
    host.project = 'B';
    store.reset(); // system:attached, before the bootstrap names B
    const asked = store.ensure('a', { project: 'A' });
    await flush();
    expect(read).toHaveBeenCalledTimes(1); // nothing was read for A under B's list
    store.setProject('B');
    await expect(asked).rejects.toThrow('The project changed');
    expect(read).toHaveBeenCalledTimes(1);
  });

  it('a re-attach of the same project resets the store: the reader waits for the answer, then is served, with no error (R10-4)', async () => {
    const { slot } = hostOn('A');
    const { store } = make({ a: slot });
    store.setProject('A');
    await store.ensure('a', { project: 'A' });
    store.reset();
    const asked = store.ensure('a', { project: 'A' });
    store.setProject('A');
    await asked;
    expect(store.getState().slots.a).toEqual({ count: 1 });
    expect(store.projectOf('a')).toBe('A');
  });

  it('a read in flight when the same project is attached again is read again for the reader, not dropped into an empty answer', async () => {
    const first = deferred<unknown>();
    const read = vi
      .fn()
      .mockReturnValueOnce(first.promise)
      .mockResolvedValue({ project: 'A', payload: { count: 5 } });
    const { store } = make({ a: slotOver(read) });
    store.setProject('A');
    const asked = store.ensure('a', { project: 'A' });
    store.reset();
    store.setProject('A');
    first.resolve({ project: 'A', payload: { count: 1 } });
    await asked;
    expect(store.getState().slots.a).toEqual({ count: 5 });
  });

  it('a reader that never hears the host answer is refused after the stuck age, not left waiting', async () => {
    vi.useFakeTimers();
    try {
      const { read, slot } = hostOn('A');
      const { store } = make({ a: slot });
      store.setProject('A');
      store.reset();
      const asked = store.ensure('a', { project: 'A' });
      const outcome = expect(asked).rejects.toThrow('still being opened');
      await vi.advanceTimersByTimeAsync(5001);
      await outcome;
      expect(read).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  // Only a slot without a stamp is held under the store's belief, and while the host's answer to an attach is not heard that belief is no project at all.
  it.runIf(form === 'load')('an unstamped read that starts while the store is unconfirmed is not held under the old project', async () => {
    const { host, read, slot } = hostOn('A');
    const { store } = make({ a: slot });
    store.setProject('A');
    await store.ensure('a', { project: 'A' });
    host.project = 'B';
    store.reset(); // system:attached: the store waits for the bootstrap
    await store.ensure('a'); // B's list, read before the store heard of B
    expect(store.projectOf('a')).toBeUndefined();
    store.setProject('A'); // the news names the old folder again: B's list is not A's
    await store.ensure('a', { project: 'A' });
    expect(read).toHaveBeenCalledTimes(3);
  });

  it('a reader that names no project reads as before, whatever the store is waiting for', async () => {
    const { slot } = hostOn('A');
    const { store } = make({ a: slot });
    store.setProject('A');
    store.reset();
    await store.ensure('a');
    expect(store.getState().slots.a).toEqual({ count: 1 });
  });
});

describe('the store keeps what a failed or slow read leaves (#3998)', () => {
  it('settled: a held list whose re-read failed is an error for the reader, and the store keeps the list for the pages that show it', async () => {
    const load = vi.fn().mockResolvedValueOnce({ count: 1 }).mockRejectedValue(new Error('host down'));
    const { store, events } = make({ a: { schema: isCount, load, events: ['job:ended'] } });
    store.start();
    await store.load('a');
    events.emit('job:ended');
    await expect(store.ensure('a', { settled: true })).rejects.toThrow('host down');
    expect(store.getState().slots.a).toEqual({ count: 1 });
    await expect(store.ensure('a')).resolves.toBeUndefined();
  });

  it('settled: a held list is served once the re-read in flight answers, and a list nobody is re-reading is served at once', async () => {
    const reread = deferred<unknown>();
    const load = vi.fn().mockResolvedValueOnce({ count: 1 }).mockReturnValueOnce(reread.promise);
    const { store, events } = make({ a: { schema: isCount, load, events: ['job:ended'] } });
    store.start();
    await store.load('a');
    await store.ensure('a', { settled: true });
    expect(load).toHaveBeenCalledTimes(1);
    events.emit('job:ended');
    let served = false;
    const asked = store.ensure('a', { settled: true }).then(() => (served = true));
    await flush();
    expect(served).toBe(false);
    reread.resolve({ count: 7 });
    await asked;
    expect(store.getState().slots.a).toEqual({ count: 7 });
  });

  it('a read the host never answers gives way: the reader fails, and its Retry reads again (qa R-3)', async () => {
    vi.useFakeTimers();
    try {
      const load = vi
        .fn()
        .mockReturnValueOnce(new Promise(() => undefined))
        .mockResolvedValue({ count: 3 });
      const { store } = make({ a: { schema: isCount, load } });
      const asked = store.ensure('a');
      const outcome = expect(asked).rejects.toThrow('did not answer');
      await vi.advanceTimersByTimeAsync(15_001);
      await outcome;
      await store.load('a');
      expect(store.getState().slots.a).toEqual({ count: 3 });
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('the host says which project a list was read from (#4040)', () => {
  /** A stamped slot over a host whose project is `host.project` at the moment a read starts. */
  const stamped = (initial: string) => {
    const host = { project: initial };
    const read = vi.fn(async () => ({ project: host.project, payload: { count: host.project === 'A' ? 1 : 2 } }));
    return { host, read };
  };
  const rig = async () => {
    const { host, read } = stamped('A');
    const made = make({ a: { schema: isCount, read, events: ['job:ended'] } });
    made.store.start();
    made.store.setProject('A');
    await made.store.ensure('a', { project: 'A' });
    return { ...made, host, read };
  };

  it('the gap: an answer read from B while the store is on A is not held, and the readers wait for the news', async () => {
    const { store, events, host, read } = await rig();
    host.project = 'B'; // the host changed its project; system:attached is not out yet
    events.emit('job:ended');
    await flush();
    expect(read).toHaveBeenCalledTimes(2);
    expect(store.getState().slots.a).toEqual({ count: 1 }); // A's list, still owned by A
    expect(store.projectOf('a')).toBe('A');
    const waiting = store.load('a', { project: 'A' });
    const outcome = expect(waiting).rejects.toThrow('The project changed');
    await flush();
    expect(read).toHaveBeenCalledTimes(2);
    store.reset();
    store.setProject('B');
    await outcome;
    expect(read).toHaveBeenCalledTimes(2); // no loop of reads
  });

  it('A to B to A: a gap answer from B, then the host is on A again: the reader is served A after one more read', async () => {
    const { store, events, host, read } = await rig();
    host.project = 'B';
    events.emit('job:ended');
    await flush();
    const reader = store.load('a', { project: 'A' });
    host.project = 'A';
    store.reset();
    store.setProject('A');
    await reader;
    expect(read).toHaveBeenCalledTimes(3);
    expect(store.getState().slots.a).toEqual({ count: 1 });
    expect(store.projectOf('a')).toBe('A');
  });

  it('after a reset the answer is held with its own stamp, not with none', async () => {
    const { store, host } = await rig();
    host.project = 'B';
    store.reset(); // system:attached: the bootstrap has not named the project yet
    await store.ensure('a');
    expect(store.projectOf('a')).toBe('B');
    expect(store.getState().slots.a).toEqual({ count: 2 });
    store.setProject('B'); // the store believed A: what it holds is emptied, as for any switch, and read again for B
    expect(store.getState().slots.a).toBeUndefined();
  });

  it('a store never told a project holds the stamp and does not adopt it', async () => {
    const { read } = stamped('A');
    const { store } = make({ a: { schema: isCount, read } });
    await store.ensure('a');
    expect(store.projectOf('a')).toBe('A');
    expect(store.project()).toBeUndefined();
  });

  it('a reader that names no project waits in the gap too, and a reset lets it go', async () => {
    const { store, events, host, read } = await rig();
    host.project = 'B';
    events.emit('job:ended');
    await flush();
    let served = false;
    const asked = store.ensure('a').then(() => (served = true));
    await flush();
    expect(served).toBe(false);
    expect(read).toHaveBeenCalledTimes(2);
    store.reset();
    await asked;
    expect(served).toBe(true);
    expect(store.projectOf('a')).toBe('B');
  });

  it('a list stamped B and held while the store is unconfirmed does not survive setProject(A)', async () => {
    const { store, host, read } = await rig();
    host.project = 'B';
    store.reset();
    await store.ensure('a'); // held, stamped B
    expect(store.projectOf('a')).toBe('B');
    store.setProject('A'); // the folder looks unchanged to the store, but what it holds is B's
    expect(store.getState().slots.a).toBeUndefined();
    host.project = 'A';
    await store.ensure('a'); // goes to the host
    expect(read).toHaveBeenCalledTimes(3);
    expect(store.getState().slots.a).toEqual({ count: 1 });
    expect(store.projectOf('a')).toBe('A');
  });

  it('the same holds for a store never told a project', async () => {
    const { host, read } = stamped('B');
    const { store } = make({ a: { schema: isCount, read } });
    await store.ensure('a');
    expect(store.projectOf('a')).toBe('B');
    store.setProject('A');
    expect(store.getState().slots.a).toBeUndefined();
    host.project = 'A';
    await store.ensure('a');
    expect(read).toHaveBeenCalledTimes(2);
    expect(store.projectOf('a')).toBe('A');
  });

  // #4085 item 1: the read starts while the store is unconfirmed, so what it answers may be another project's even though nothing held is foreign.
  it('a read started while unconfirmed that answers B after setProject(A) is dropped and read again, not held as ahead (#4085)', async () => {
    const { store, host, read } = await rig();
    store.reset(); // attach B
    host.project = 'B';
    const slow = deferred<{ project: string; payload: { count: number } }>();
    read.mockReturnValueOnce(slow.promise);
    const asked = store.ensure('a'); // starts while unconfirmed
    host.project = 'A'; // the host went back
    store.setProject('A'); // the news: A again
    slow.resolve({ project: 'B', payload: { count: 2 } }); // the read answers from B
    await asked;
    expect(store.getState().slots.a).toEqual({ count: 1 });
    expect(store.projectOf('a')).toBe('A');
    await expect(store.ensure('a', { project: 'A' })).resolves.toBeUndefined(); // no wait for an ahead that never ends
  });

  // #4085 item 2
  it('reset() then setProject(other) in the same turn: a named reader whose read was dropped is told the project changed at once (#4085)', async () => {
    vi.useFakeTimers();
    try {
      const slow = deferred<{ project: string; payload: unknown }>();
      const made = make({ a: { schema: isCount, read: () => slow.promise } });
      made.store.setProject('A');
      const asked = made.store.load('a', { project: 'A' });
      made.store.reset();
      made.store.setProject('B');
      const outcome = expect(asked).rejects.toThrow('The project changed');
      await vi.advanceTimersByTimeAsync(0); // no 5 s wait
      await outcome;
    } finally {
      vi.useRealTimers();
    }
  });

  it('whatever the order of resets, answers and news, a held list belongs to the project the store is on', async () => {
    const projects = ['A', 'B', 'C'];
    let seed = 7;
    const next = (n: number) => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return (seed >>> 12) % n;
    };
    for (let run = 0; run < 40; run += 1) {
      const { host, read } = stamped('A');
      const { store } = make({ a: { schema: isCount, read } });
      for (let step = 0; step < 12; step += 1) {
        const action = next(4);
        if (action === 0) store.reset();
        else if (action === 1) store.setProject(projects[next(3)]!);
        else if (action === 2) host.project = projects[next(3)]!;
        else void store.ensure('a').catch(() => undefined); // not awaited: a reader may wait for the news
        await flush();
        // After the store hears of a project, nothing it holds is another project's.
        if (store.project() !== undefined && action === 1 && store.getState().slots.a !== undefined) expect(store.projectOf('a')).toBe(store.project());
      }
    }
  });
});

// #4085 item 3: a slot without a stamp, and the keyed text, read while unconfirmed come from a project the store has not heard of.
describe('what is read without a stamp while unconfirmed is not kept when the project is confirmed (#4085)', () => {
  it('a slot with no stamp, read while unconfirmed, is dropped by setProject(A), so A-B-A does not serve B to an unnamed reader', async () => {
    const host = { project: 'A' };
    const load = vi.fn(async () => ({ count: host.project === 'A' ? 1 : 2 }));
    const { store } = make({ a: { schema: isCount, load } });
    store.setProject('A');
    await store.ensure('a');
    host.project = 'B';
    store.reset();
    await store.ensure('a'); // read while unconfirmed: B's
    host.project = 'A';
    store.setProject('A');
    expect(store.getState().slots.a).toBeUndefined();
    await store.ensure('a');
    expect(store.getState().slots.a).toEqual({ count: 1 });
  });

  it('chapter text read while unconfirmed is dropped by setProject(A)', async () => {
    const host = { project: 'A' };
    const load = vi.fn(async (id: string) => `${host.project}:${id}`);
    const events = fakeEvents();
    const store = createStudioStore({ registry: {}, keyed: { text: { schema: isName, load } }, subscribe: events.subscribe, onError: vi.fn() });
    store.setProject('A');
    host.project = 'B';
    store.reset();
    await store.keyed('text').ensure('c1');
    expect(store.keyed('text').get('c1')).toBe('B:c1');
    host.project = 'A';
    store.setProject('A');
    expect(store.keyed('text').get('c1')).toBeUndefined();
  });

  it('a read with no stamp that starts while unconfirmed and answers after setProject(A) is dropped and read again', async () => {
    const slow = deferred<unknown>();
    const load = vi.fn().mockReturnValueOnce(slow.promise).mockResolvedValue({ count: 1 });
    const { store } = make({ a: { schema: isCount, load } });
    store.setProject('A');
    store.reset();
    const asked = store.ensure('a');
    store.setProject('A');
    slow.resolve({ count: 2 });
    await asked;
    expect(store.getState().slots.a).toEqual({ count: 1 });
  });
});
