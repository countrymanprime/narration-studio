import { describe, expect, it, vi } from 'vitest';
import type { StandardSchemaV1 } from '../../api/wire/standardSchema';
import { createKeyedCache } from './keyedCache';
import { createStudioStore } from './createStudioStore';

const textSchema: StandardSchemaV1<unknown, string> = {
  '~standard': { version: 1, vendor: 'test', validate: (v) => (typeof v === 'string' ? { value: v } : { issues: [{ message: 'wrong shape', path: [] }] }) },
};
const length = (value: string) => value.length;

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}
const flush = () => new Promise<void>((r) => setTimeout(r, 0));

describe('createKeyedCache (#3658)', () => {
  it('reads a key once for callers that ask together, and answers at once afterwards', async () => {
    const gate = deferred<unknown>();
    const load = vi.fn(() => gate.promise);
    const cache = createKeyedCache('text', { schema: textSchema, load, size: length });
    const a = cache.ensure('c1');
    const b = cache.ensure('c1');
    expect(load).toHaveBeenCalledTimes(1);
    gate.resolve('Once upon a time');
    await Promise.all([a, b]);
    await cache.ensure('c1');
    expect(load).toHaveBeenCalledTimes(1);
    expect(cache.get('c1')).toBe('Once upon a time');
  });

  it('keeps each key apart and checks each answer with the schema', async () => {
    const load = vi.fn(async (key: string) => (key === 'bad' ? 42 : `text of ${key}`));
    const cache = createKeyedCache('text', { schema: textSchema, load, size: length });
    await cache.ensure('c1');
    await cache.ensure('c2');
    await expect(cache.ensure('bad')).rejects.toThrow();
    expect(cache.get('c1')).toBe('text of c1');
    expect(cache.get('c2')).toBe('text of c2');
    expect(cache.get('bad')).toBeUndefined();
    expect(cache.error('bad')).toBeInstanceOf(Error);
  });

  it('drops the least recently used keys beyond the budget, never the one just read, and a use makes a key recent', async () => {
    const load = vi.fn(async (key: string) => key.repeat(10));
    const cache = createKeyedCache('text', { schema: textSchema, load, size: length, budget: 25 });
    await cache.ensure('a');
    await cache.ensure('b');
    await cache.ensure('a'); // a is now the more recent of the two
    await cache.ensure('c'); // 30 > 25: b, the least recently used, goes
    expect(cache.get('b')).toBeUndefined();
    expect(cache.get('a')).toBeDefined();
    expect(cache.get('c')).toBeDefined();
    expect(cache.held()).toBe(20);
  });

  it('holds a single value larger than the budget rather than dropping what was just read', async () => {
    const cache = createKeyedCache('text', { schema: textSchema, load: async () => 'x'.repeat(100), size: length, budget: 10 });
    await cache.ensure('big');
    expect(cache.get('big')).toHaveLength(100);
  });

  it('marks what is held stale on invalidate, serves it, and reads it again behind it', async () => {
    const reread = deferred<unknown>();
    const load = vi.fn().mockResolvedValueOnce('old').mockReturnValueOnce(reread.promise);
    const cache = createKeyedCache('text', { schema: textSchema, load, size: length });
    await cache.ensure('c1');
    expect(cache.isStale('c1')).toBe(false);
    cache.invalidate();
    expect(cache.isStale('c1')).toBe(true);
    await cache.ensure('c1'); // answers from the held value, the read behind it still out
    expect(cache.get('c1')).toBe('old');
    reread.resolve('new');
    await flush();
    expect(cache.get('c1')).toBe('new');
    expect(cache.isStale('c1')).toBe(false);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('keeps the held value when the read behind it fails, and a failed first read is not kept', async () => {
    const load = vi
      .fn()
      .mockResolvedValueOnce('kept')
      .mockRejectedValueOnce(new Error('offline'))
      .mockRejectedValueOnce(new Error('first'))
      .mockResolvedValueOnce('ok');
    const cache = createKeyedCache('text', { schema: textSchema, load, size: length });
    await cache.ensure('c1');
    cache.invalidate();
    await cache.ensure('c1');
    await flush();
    expect(cache.get('c1')).toBe('kept');
    await expect(cache.ensure('c2')).rejects.toThrow('first');
    expect(cache.get('c2')).toBeUndefined();
    await cache.ensure('c2');
    expect(cache.get('c2')).toBe('ok');
    expect(cache.error('c2')).toBeUndefined();
  });

  it('empties on clear (a project switch) and drops an answer that was still on its way', async () => {
    const gate = deferred<unknown>();
    const load = vi.fn().mockReturnValueOnce(gate.promise).mockResolvedValueOnce('new project');
    const cache = createKeyedCache('text', { schema: textSchema, load, size: length });
    const reading = cache.ensure('c1');
    cache.clear();
    gate.resolve('old project');
    await reading;
    expect(cache.get('c1')).toBeUndefined();
    await cache.ensure('c1');
    expect(cache.get('c1')).toBe('new project');
  });

  it('tells subscribers when something held or failed changes, and moves its version', async () => {
    const cache = createKeyedCache('text', { schema: textSchema, load: async () => 'x', size: length });
    const heard = vi.fn();
    const off = cache.subscribe(heard);
    const before = cache.version();
    await cache.ensure('c1');
    expect(heard).toHaveBeenCalled();
    expect(cache.version()).toBeGreaterThan(before);
    off();
    heard.mockClear();
    await cache.ensure('c2');
    expect(heard).not.toHaveBeenCalled();
  });
});

describe('createKeyedCache: reads that overlap, pins and bad sizes (#3658)', () => {
  it('an older read of a key that answers after a newer one writes nothing', async () => {
    const slow = deferred<unknown>();
    const load = vi.fn().mockReturnValueOnce(slow.promise).mockResolvedValueOnce('newer');
    const cache = createKeyedCache('text', { schema: textSchema, load, size: length });
    const older = cache.load('c1');
    await cache.load('c1');
    slow.resolve('older');
    await older;
    expect(cache.get('c1')).toBe('newer');
  });

  it('never drops a pinned key for the budget, and drops it once the pin is released', async () => {
    const load = vi.fn(async (key: string) => key.repeat(10));
    const cache = createKeyedCache('text', { schema: textSchema, load, size: length, budget: 15 });
    const release = cache.pin('a');
    await cache.ensure('a');
    await cache.ensure('b'); // 20 > 15: a is pinned, b was just read, nothing goes
    expect(cache.get('a')).toBeDefined();
    expect(cache.get('b')).toBeDefined();
    release();
    expect(cache.get('a')).toBeUndefined(); // over budget again and no longer pinned: the older one goes
    expect(cache.held()).toBe(10);
  });

  it('two pins on one key hold it until both are released', async () => {
    const cache = createKeyedCache('text', { schema: textSchema, load: async (key: string) => key.repeat(10), size: length, budget: 5 });
    const one = cache.pin('a');
    const two = cache.pin('a');
    await cache.ensure('a');
    await cache.ensure('b');
    one();
    one(); // releasing the same pin twice releases nothing more
    expect(cache.get('a')).toBeDefined();
    two();
    expect(cache.get('a')).toBeUndefined();
  });

  it('forgets a failure when something changes, so the key is tried once more, and measures a bad size as its JSON', async () => {
    const load = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue('ok');
    const cache = createKeyedCache('text', { schema: textSchema, load, size: () => Number.NaN, budget: 100 });
    await expect(cache.ensure('c1')).rejects.toThrow('offline');
    expect(cache.error('c1')).toBeDefined();
    cache.invalidate();
    expect(cache.error('c1')).toBeUndefined();
    await cache.ensure('c1');
    expect(cache.held()).toBe(JSON.stringify('ok').length);
  });
});

describe('a keyed cache in the store (#3658)', () => {
  const make = (config: Partial<Parameters<typeof createKeyedCache>[1]> = {}) => {
    const handlers = new Map<string, Set<() => void>>();
    const focus = new Set<() => void>();
    const store = createStudioStore({
      registry: {},
      keyed: { text: { schema: textSchema, load: async (key: string) => `text ${key}`, size: (value: unknown) => String(value).length, ...config } },
      subscribe: (event, handler) => {
        (handlers.get(event) ?? handlers.set(event, new Set()).get(event)!).add(handler);
        return () => handlers.get(event)?.delete(handler);
      },
      subscribeFocus: (handler) => {
        focus.add(handler);
        return () => focus.delete(handler);
      },
      onError: vi.fn(),
    });
    return { store, emit: (event: string) => handlers.get(event)?.forEach((h) => h()), focus: () => focus.forEach((h) => h()) };
  };

  it('is stale after a listed event, a listed topic or a focus, and cleared by reset', async () => {
    const { store, emit, focus } = make({ events: ['job:ended'], topics: ['manuscript:changed'], refreshOnFocus: true });
    store.start();
    const cache = store.keyed('text');
    await cache.ensure('c1');
    emit('job:ended');
    expect(cache.isStale('c1')).toBe(true);
    await cache.load('c1');
    expect(cache.isStale('c1')).toBe(false);
    store.publish('manuscript:changed');
    expect(cache.isStale('c1')).toBe(true);
    await cache.load('c1');
    focus();
    expect(cache.isStale('c1')).toBe(true);
    store.reset();
    expect(cache.get('c1')).toBeUndefined();
  });

  it('throws for a name nothing registered', () => {
    expect(() => make().store.keyed('nope')).toThrow('no keyed cache named nope');
  });
});
