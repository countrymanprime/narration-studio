import { describe, expect, it, vi } from 'vitest';
import type { StandardSchemaV1 } from '../api/wire/standardSchema';
import { createKeyedCache } from '../studio/store/keyedCache';
import { createStudioStore } from '../studio/store/createStudioStore';
import { withChapterListWrites, announceChapterListWritten, onChapterListWritten } from '../api/chapterListWrites';
import { withCoalescedReads } from '../api/withCoalescedReads';
import { createHostEvents, createSlots, createKeyedSlots } from '../studio/slots';
import { createMockApi } from '../api/mockApi';
import type { NarrationApi } from '../types';

const textSchema: StandardSchemaV1<unknown, string> = {
  '~standard': { version: 1, vendor: 'test', validate: (v) => (typeof v === 'string' ? { value: v } : { issues: [{ message: 'wrong shape', path: [] }] }) },
};
const length = (value: string) => value.length;
function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}
const flush = () => new Promise<void>((r) => setTimeout(r, 0));

describe('keyedCache', () => {
  it('K1 clear during a read then a new read of the same key', async () => {
    const gates = [deferred<unknown>(), deferred<unknown>()];
    let n = 0;
    const load = vi.fn(() => gates[n++]!.promise);
    const cache = createKeyedCache('t', { schema: textSchema, load, size: length });
    const old = cache.ensure('a');
    cache.clear();
    const fresh = cache.ensure('a');
    expect(load).toHaveBeenCalledTimes(2);
    gates[1]!.resolve('new project');
    await fresh;
    expect(cache.get('a')).toBe('new project');
    gates[0]!.resolve('old project');
    await old;
    await flush();
    expect(cache.get('a')).toBe('new project');
    // third ensure joins nothing and reads nothing
    await cache.ensure('a');
    expect(load).toHaveBeenCalledTimes(2);
  });
  it('K1b old ensure promise resolves although nothing is held after clear', async () => {
    const gate = deferred<unknown>();
    const cache = createKeyedCache('t', { schema: textSchema, load: () => gate.promise, size: length });
    const old = cache.ensure('a');
    cache.clear();
    gate.resolve('x');
    await old;
    console.log('K1b after resolved ensure, get =', cache.get('a'));
    expect(cache.get('a')).toBeDefined();
  });
  it('K1c old read FAILS after clear: promise outcome', async () => {
    const gate = deferred<unknown>();
    const cache = createKeyedCache('t', { schema: textSchema, load: () => gate.promise, size: length });
    const old = cache.ensure('a');
    cache.clear();
    gate.reject(new Error('boom'));
    const r = await old.then(() => 'resolved', () => 'rejected');
    console.log('K1c', r, cache.error('a'));
    expect(cache.error('a')).toBeUndefined();
  });
  it('K2 two overlapping load(k): the older answer arriving last must not replace the newer', async () => {
    const gates = [deferred<unknown>(), deferred<unknown>()];
    let n = 0;
    const cache = createKeyedCache('t', { schema: textSchema, load: () => gates[n++]!.promise, size: length });
    const first = cache.load('a');
    const second = cache.load('a');
    gates[1]!.resolve('newer');
    await second;
    gates[0]!.resolve('older');
    await first;
    expect(cache.get('a')).toBe('newer');
  });
  it('K2b stale re-read started by ensure, then explicit load(k); older lands last', async () => {
    const gates = [deferred<unknown>(), deferred<unknown>()];
    let n = -1;
    const cache = createKeyedCache('t', { schema: textSchema, load: () => (n++ < 0 ? Promise.resolve('v0') : gates[n - 1]!.promise), size: length });
    await cache.ensure('a');
    cache.invalidate();
    await cache.ensure('a'); // background re-read 0
    cache.invalidate();
    const l = cache.load('a'); // read 1 (after the second change)
    gates[1]!.resolve('after second change');
    await l;
    expect(cache.isStale('a')).toBe(false);
    gates[0]!.resolve('before second change');
    await flush();
    console.log('K2b get', cache.get('a'), 'stale', cache.isStale('a'));
    expect(cache.get('a')).toBe('after second change');
  });
  it('K3 invalidate during a read marks the answer stale and the next ensure re-reads', async () => {
    const gate = deferred<unknown>();
    const load = vi.fn<(k: string) => Promise<unknown>>(() => gate.promise);
    const cache = createKeyedCache('t', { schema: textSchema, load, size: length });
    const p = cache.ensure('a');
    cache.invalidate();
    gate.resolve('x');
    await p;
    expect(cache.isStale('a')).toBe(true);
    await cache.ensure('a');
    expect(load).toHaveBeenCalledTimes(2);
  });
  it('K4 a stale key evicted while its re-read is in flight: accounting stays right', async () => {
    const gate = deferred<unknown>();
    let phase = 0;
    const load = vi.fn(async (k: string) => (k === 'a' && phase === 1 ? gate.promise : `${k}`.padEnd(10, '.')));
    const cache = createKeyedCache('t', { schema: textSchema, load, size: length, budget: 20 });
    await cache.ensure('a');
    cache.invalidate();
    phase = 1;
    await cache.ensure('a'); // background re-read hangs
    await cache.ensure('b');
    await cache.ensure('c'); // evicts a (LRU) -> total 20
    expect(cache.get('a')).toBeUndefined();
    gate.resolve('a'.padEnd(10, '!'));
    await flush();
    console.log('K4 held', cache.held(), 'a', cache.get('a'), 'b', cache.get('b'), 'c', cache.get('c'));
    const sum = ['a', 'b', 'c'].reduce((s, k) => s + (cache.get(k)?.length ?? 0), 0);
    expect(cache.held()).toBe(sum);
    expect(cache.held()).toBeLessThanOrEqual(20);
  });
  it('K5 budget smaller than one value: held, no re-read on ensure', async () => {
    const load = vi.fn(async (k: string) => k.repeat(100));
    const cache = createKeyedCache('t', { schema: textSchema, load, size: length, budget: 10 });
    await cache.ensure('a');
    expect(cache.get('a')).toBeDefined();
    await cache.ensure('a');
    expect(load).toHaveBeenCalledTimes(1);
    await cache.ensure('b');
    expect(cache.get('a')).toBeUndefined();
    expect(cache.held()).toBe(100);
  });
  it('K6 hostile keys', async () => {
    const cache = createKeyedCache('t', { schema: textSchema, load: async (k) => `text:${k}`, size: length });
    for (const k of ['__proto__', 'constructor', 'toString', 'hasOwnProperty', '', ' ', 'a\u0000b', '‮abc', 'x'.repeat(10000)]) {
      expect(cache.get(k)).toBeUndefined();
      expect(cache.error(k)).toBeUndefined();
      await cache.ensure(k);
      expect(cache.get(k)).toBe(`text:${k}`);
    }
  });
  it('K7 400 concurrent keys under a budget', async () => {
    const load = vi.fn(async (k: string) => { await new Promise((r) => setTimeout(r, Math.random() * 5)); return k.padEnd(100, '.'); });
    const cache = createKeyedCache('t', { schema: textSchema, load, size: length, budget: 1000 });
    const keys = Array.from({ length: 400 }, (_, i) => `k${i}`);
    await Promise.all(keys.map((k) => cache.ensure(k)));
    const sum = keys.reduce((s, k) => s + (cache.get(k)?.length ?? 0), 0);
    expect(cache.held()).toBe(sum);
    expect(sum).toBeLessThanOrEqual(1000);
    expect(load).toHaveBeenCalledTimes(400);
  });
  it('K8 a size() that throws on the re-read must not drop the held value', async () => {
    let bad = false;
    const cache = createKeyedCache('t', { schema: textSchema, load: async () => 'v', size: (v) => { if (bad) throw new Error('size'); return v.length; } });
    await cache.ensure('a');
    bad = true;
    await cache.load('a').catch(() => undefined);
    console.log('K8 get', cache.get('a'), 'held', cache.held(), cache.error('a')?.message);
    expect(cache.get('a')).toBe('v');
  });
  it('K8b size NaN', async () => {
    const cache = createKeyedCache('t', { schema: textSchema, load: async (k) => k, size: () => NaN, budget: 100 });
    await cache.ensure('a'); await cache.ensure('b');
    console.log('K8b held', cache.held(), cache.get('a'), cache.get('b'));
  });
  it('K9 stale key whose re-read fails keeps the value; every later ensure retries (count)', async () => {
    let fail = false;
    const load = vi.fn(async () => { if (fail) throw new Error('down'); return 'v'; });
    const cache = createKeyedCache('t', { schema: textSchema, load, size: length });
    await cache.ensure('a');
    cache.invalidate(); fail = true;
    for (let i = 0; i < 10; i++) { await cache.ensure('a'); await flush(); }
    expect(cache.get('a')).toBe('v');
    expect(cache.error('a')?.message).toBe('down');
    console.log('K9 reads after 10 ensures of a stale failing key:', load.mock.calls.length - 1);
  });
  it('K10 a stale key whose re-read hangs: ensure resolves at once, one read only', async () => {
    let hang = false;
    const load = vi.fn(() => (hang ? new Promise<unknown>(() => undefined) : Promise.resolve('v')));
    const cache = createKeyedCache('t', { schema: textSchema, load, size: length });
    await cache.ensure('a');
    cache.invalidate(); hang = true;
    for (let i = 0; i < 10; i++) await cache.ensure('a');
    expect(load).toHaveBeenCalledTimes(2);
    // a first read that hangs: every ensure of that key hangs forever, with no timeout
    const never = cache.ensure('zzz');
    const r = await Promise.race([never.then(() => 'settled'), new Promise((res) => setTimeout(() => res('pending'), 50))]);
    console.log('K10 hung first read:', r);
  });
  it('K11 version changes on every held/failed change and listeners see consistent state', async () => {
    const cache = createKeyedCache('t', { schema: textSchema, load: async (k) => k, size: length, budget: 1 });
    const seen: Array<[number, string | undefined, string | undefined]> = [];
    cache.subscribe(() => seen.push([cache.version(), cache.get('a'), cache.get('b')]));
    await cache.ensure('a'); await cache.ensure('b');
    console.log('K11', JSON.stringify(seen));
    expect(new Set(seen.map((s) => s[0])).size).toBe(seen.length);
  });
});

describe('store.ensure', () => {
  const mk = (load: () => Promise<unknown>, onError = vi.fn()) => {
    const handlers = new Map<string, Set<() => void>>();
    const store = createStudioStore({
      registry: { chapters: { schema: textSchema, load, events: ['chapter-sync', 'chapters:written'] } },
      subscribe: (e, h) => { if (!handlers.has(e)) handlers.set(e, new Set()); handlers.get(e)!.add(h); return () => handlers.get(e)!.delete(h); },
      subscribeFocus: () => () => undefined,
      onError,
    });
    return { store, fire: (e: string) => handlers.get(e)?.forEach((h) => h()), onError };
  };
  it('S1 ensure joins a load already in flight that load() (App) or an event started', async () => {
    const gate = deferred<unknown>();
    const load = vi.fn(() => gate.promise);
    const { store } = mk(load);
    const a = store.load('chapters');
    const b = store.ensure('chapters');
    gate.resolve('x'); await Promise.all([a, b]);
    expect(load).toHaveBeenCalledTimes(1);
  });
  it('S2 failed read joined by many', async () => {
    const gate = deferred<unknown>();
    const load = vi.fn(() => gate.promise);
    const { store, onError } = mk(load);
    const all = Array.from({ length: 50 }, () => store.ensure('chapters').then(() => 'ok', () => 'rejected'));
    gate.reject(new Error('down'));
    expect(new Set(await Promise.all(all))).toEqual(new Set(['rejected']));
    expect(load).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledTimes(1);
    load.mockImplementation(() => Promise.resolve('v'));
    await store.ensure('chapters');
    expect(store.getState().slots.chapters).toBe('v');
    expect(store.getState().errors.chapters).toBeUndefined();
  });
  it('S3 reset mid-read: the old ensure resolves with nothing held; a new ensure reads; old answer not written', async () => {
    const gates = [deferred<unknown>(), deferred<unknown>()];
    let n = 0;
    const load = vi.fn(() => gates[n++]!.promise);
    const { store } = mk(load);
    const old = store.ensure('chapters');
    store.reset();
    const fresh = store.ensure('chapters');
    expect(load).toHaveBeenCalledTimes(2);
    gates[0]!.resolve('old project');
    const r = await old.then(() => 'resolved', () => 'rejected');
    console.log('S3 old ensure', r, 'held', store.getState().slots.chapters);
    expect(store.getState().slots.chapters).toBeUndefined();
    gates[1]!.resolve('new project'); await fresh;
    expect(store.getState().slots.chapters).toBe('new project');
  });
  it('S3b reset mid-read where the OLD read fails after the new one is ensured', async () => {
    const gates = [deferred<unknown>(), deferred<unknown>()];
    let n = 0;
    const { store, onError } = mk(() => gates[n++]!.promise);
    const old = store.ensure('chapters');
    store.reset();
    const fresh = store.ensure('chapters');
    gates[0]!.reject(new Error('old down'));
    await old.catch(() => undefined);
    await flush();
    const again = store.ensure('chapters');
    console.log('S3b same promise after old settles?', again === fresh, 'errors', store.getState().errors.chapters, onError.mock.calls.length);
    expect(again).toBe(fresh);
    gates[1]!.resolve('new'); await fresh;
  });
  it('S4 a burst of events = how many reads', async () => {
    const load = vi.fn(async () => { await new Promise((r) => setTimeout(r, 5)); return 'v'; });
    const { store, fire } = mk(load);
    const stop = store.start();
    await store.ensure('chapters');
    load.mockClear();
    for (let i = 0; i < 100; i++) fire('chapter-sync');
    for (let i = 0; i < 14; i++) fire('chapters:written');
    await new Promise((r) => setTimeout(r, 50));
    console.log('S4 reads for 100 sync events + 14 writer announcements in one tick:', load.mock.calls.length);
    expect(load.mock.calls.length).toBeLessThanOrEqual(2);
    stop();
  });
  it('S5 an event before anyone asked for the slot reads it anyway', async () => {
    const load = vi.fn(async () => 'v');
    const { store, fire } = mk(load);
    const stop = store.start();
    fire('chapter-sync');
    await flush();
    console.log('S5 reads with no reader:', load.mock.calls.length);
    stop();
  });
});

describe('writers', () => {
  it('W1 a list read asked by the announcement must not join a read that began before the writer answered', async () => {
    // the host: the chapter list changes when the writer commits
    let recorded = 'before';
    const readGate = deferred<void>();
    const writeGate = deferred<void>();
    const host = {
      manuscriptChapters: vi.fn(async () => { const seen = recorded; await readGate.promise; return seen; }),
      chapterTrackSet: vi.fn(async () => { await writeGate.promise; recorded = 'after'; return { ok: true }; }),
    } as unknown as NarrationApi;
    const api = withCoalescedReads(withChapterListWrites(host)); // main.tsx order
    const store = createStudioStore({
      registry: { chapters: { schema: textSchema, load: () => api.manuscriptChapters() as unknown as Promise<unknown>, events: ['chapters:written'] } },
      subscribe: createHostEvents({ subscribeJobEnded: () => () => undefined, subscribeChapterSync: () => () => undefined }),
      subscribeFocus: () => () => undefined,
    });
    const stop = store.start();
    const write = (api as unknown as { chapterTrackSet: () => Promise<unknown> }).chapterTrackSet();
    // a reader (a focus refresh, a page mounting) asks while the write is running: the host answers from before the commit
    const during = store.load('chapters');
    writeGate.resolve();
    await write;
    await flush();
    readGate.resolve();
    await during.catch(() => undefined);
    await flush(); await flush();
    console.log('W1 host reads', (host.manuscriptChapters as ReturnType<typeof vi.fn>).mock.calls.length, 'slot', store.getState().slots.chapters);
    expect(store.getState().slots.chapters).toBe('after');
    stop();
  });
  it('W1b same with the wrappers the other way round (coalescer inside)', async () => {
    let recorded = 'before';
    const readGate = deferred<void>();
    const writeGate = deferred<void>();
    const host = {
      manuscriptChapters: vi.fn(async () => { const seen = recorded; await readGate.promise; return seen; }),
      chapterTrackSet: vi.fn(async () => { await writeGate.promise; recorded = 'after'; return { ok: true }; }),
    } as unknown as NarrationApi;
    const api = withChapterListWrites(withCoalescedReads(host));
    const store = createStudioStore({
      registry: { chapters: { schema: textSchema, load: () => api.manuscriptChapters() as unknown as Promise<unknown>, events: ['chapters:written'] } },
      subscribe: createHostEvents({ subscribeJobEnded: () => () => undefined, subscribeChapterSync: () => () => undefined }),
      subscribeFocus: () => () => undefined,
    });
    const stop = store.start();
    const write = (api as unknown as { chapterTrackSet: () => Promise<unknown> }).chapterTrackSet();
    const during = store.load('chapters');
    writeGate.resolve();
    await write; await flush();
    readGate.resolve();
    await during.catch(() => undefined);
    await flush(); await flush();
    console.log('W1b slot', store.getState().slots.chapters);
    stop();
  });
  it('W2 a writer that settles after the store stopped reads nothing; listeners do not leak', async () => {
    const load = vi.fn(async () => 'v');
    const store = createStudioStore({
      registry: { chapters: { schema: textSchema, load, events: ['chapters:written'] } },
      subscribe: createHostEvents({ subscribeJobEnded: () => () => undefined, subscribeChapterSync: () => () => undefined }),
      subscribeFocus: () => () => undefined,
    });
    const gate = deferred<unknown>();
    const api = withChapterListWrites({ dawChoose: () => gate.promise } as unknown as NarrationApi);
    const stop = store.start();
    const w = (api as unknown as { dawChoose: () => Promise<unknown> }).dawChoose();
    stop();
    gate.reject(new Error('refused'));
    await w.catch(() => undefined); await flush();
    expect(load).not.toHaveBeenCalled();
  });
  it('W3 a listener that throws stops the announcement reaching the others and breaks the writer?', async () => {
    const heard = vi.fn();
    const off1 = onChapterListWritten(() => { throw new Error('listener'); });
    const off2 = onChapterListWritten(heard);
    const api = withChapterListWrites({ tracksSelect: () => 'sync' } as unknown as NarrationApi);
    let outcome: unknown;
    try { outcome = (api as unknown as { tracksSelect: () => unknown }).tracksSelect(); } catch (e) { outcome = e; }
    console.log('W3 sync writer outcome', outcome, 'second listener heard', heard.mock.calls.length);
    off1(); off2();
  });
  it('W4 with the real mock: a burst of writers and the reads of the list', async () => {
    const mock = createMockApi();
    const reads = vi.spyOn(mock, 'manuscriptChapters');
    const api = withCoalescedReads(withChapterListWrites(mock));
    const store = createStudioStore({
      registry: createSlots(api, api),
      keyed: createKeyedSlots(api),
      subscribe: createHostEvents({ subscribeJobEnded: api.subscribeJobEnded, subscribeChapterSync: (h) => api.subscribeChapterSync(h) }),
      subscribeFocus: () => () => undefined,
    });
    const stop = store.start();
    await store.ensure('chapters');
    await new Promise((r) => setTimeout(r, 400));
    console.log('W4 reads after start+ensure+400ms idle:', reads.mock.calls.length);
    reads.mockClear();
    const chapters = store.getState().slots.chapters!;
    await Promise.all(chapters.slice(0, 10).map((c) => api.chapterTrackUnlink(c.id).catch(() => undefined)));
    await new Promise((r) => setTimeout(r, 100));
    console.log('W4 host list reads for 10 concurrent unlinks:', reads.mock.calls.length);
    reads.mockClear();
    for (const c of chapters.slice(0, 10)) await api.chapterTrackUnlink(c.id).catch(() => undefined);
    await new Promise((r) => setTimeout(r, 100));
    console.log('W4 host list reads for 10 sequential unlinks:', reads.mock.calls.length);
    stop();
  });
});
