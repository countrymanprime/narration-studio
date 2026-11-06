import { describe, expect, it } from 'vitest';
import { createTipsStore } from './tipsStore';

type Save = { value: string; resolve: () => void; reject: (error: Error) => void };

/** A system port whose saves wait to be settled by the test, so overlapping writes can be ordered on purpose. */
function port(initial: string, readFails = false) {
  let host = initial;
  const saves: Save[] = [];
  const system = {
    settingsForScope: async () => {
      if (readFails) throw new Error('no read');
      return { Tips: [{ key: 'seen', effectiveValue: host }] };
    },
    saveSettings: (_tool: string, _scope: string, values: Record<string, string>) =>
      new Promise<void>((resolve, reject) => {
        saves.push({
          value: values.seen!,
          resolve: () => {
            host = values.seen!;
            resolve();
          },
          reject,
        });
      }),
  };
  return { system: system as never, saves, host: () => host };
}
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
const ids = (store: ReturnType<typeof createTipsStore>) => [...(store.snapshot() ?? [])].sort();

describe('the tips store keeps the list the host holds', () => {
  it('a failed dismiss does not bring back tips a later reset cleared', async () => {
    const { system, saves } = port('a');
    const store = createTipsStore(system);
    await store.load();
    const dismissed = store.dismiss('b');
    const cleared = store.reset();
    await tick();
    saves[0]!.reject(new Error('disk full'));
    expect(await dismissed).toBe('disk full');
    await tick();
    saves[1]!.resolve();
    expect(await cleared).toBeNull();
    expect(ids(store)).toEqual([]);
  });

  it('a failed reset keeps tips dismissed while it was in flight', async () => {
    const { system, saves } = port('a');
    const store = createTipsStore(system);
    await store.load();
    const cleared = store.reset();
    const dismissed = store.dismiss('b');
    await tick();
    saves[0]!.reject(new Error('disk full'));
    expect(await cleared).toBe('disk full');
    await tick();
    saves[1]!.resolve();
    expect(await dismissed).toBeNull();
    expect(ids(store)).toEqual(['a', 'b']);
  });

  it('shows a change at once, before its save settles', async () => {
    const { system, saves } = port('a');
    const store = createTipsStore(system);
    await store.load();
    void store.dismiss('b');
    expect(ids(store)).toEqual(['a', 'b']);
    void store.reset();
    expect(ids(store)).toEqual([]);
    await tick();
    saves[0]!.resolve();
  });

  it('a reset or dismiss made before the first read lands is written over the list the host holds', async () => {
    const { system, saves, host } = port('a b c');
    const store = createTipsStore(system);
    const dismissed = store.dismiss('d');
    await tick();
    expect(saves[0]!.value).toBe('a b c d');
    saves[0]!.resolve();
    await dismissed;
    expect(host()).toBe('a b c d');
    expect(ids(store)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('says a read failed, and a retry reads again', async () => {
    const failing = port('a', true);
    const store = createTipsStore(failing.system);
    await store.load();
    expect(store.snapshot()).toBeNull();
    expect(store.failed()).toBe(true);
    const ok = port('a b');
    const again = createTipsStore(ok.system);
    await again.load();
    expect(again.failed()).toBe(false);
    expect(ids(again)).toEqual(['a', 'b']);
  });

  it('takes a value that is not a string as no tips dismissed instead of failing the read', async () => {
    const system = { settingsForScope: async () => ({ Tips: [{ key: 'seen', effectiveValue: 42 }] }), saveSettings: async () => undefined } as never;
    const store = createTipsStore(system);
    await store.load();
    expect(ids(store)).toEqual([]);
    expect(store.failed()).toBe(false);
  });
});
