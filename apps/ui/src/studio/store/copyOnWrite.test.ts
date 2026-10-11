import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { getIn, setIn } from './copyOnWrite';

const base = { ui: { selection: { chapter: 'c1', range: [1, 2] }, filter: { text: '' } }, prefs: { theme: 'dark' }, list: [{ id: 1 }, { id: 2 }] };

describe('setIn (SNS-Q2: copy-on-write helpers instead of immer)', () => {
  it('returns a new object along the changed path and the same reference for every other branch', () => {
    const next = setIn(base, ['ui', 'selection', 'chapter'], 'c2');
    expect(next.ui.selection.chapter).toBe('c2');
    expect(next).not.toBe(base);
    expect(next.ui).not.toBe(base.ui);
    expect(next.ui.selection).not.toBe(base.ui.selection);
    expect(next.ui.selection.range).toBe(base.ui.selection.range);
    expect(next.ui.filter).toBe(base.ui.filter);
    expect(next.prefs).toBe(base.prefs);
    expect(next.list).toBe(base.list);
    expect(base.ui.selection.chapter).toBe('c1');
  });

  it('returns the same root when the value is already there', () => {
    expect(setIn(base, ['prefs', 'theme'], 'dark')).toBe(base);
  });

  it('copies an array on the path and keeps the untouched items', () => {
    const next = setIn(base, ['list', 1, 'id'], 9);
    expect(next.list).not.toBe(base.list);
    expect(next.list[0]).toBe(base.list[0]);
    expect(next.list[1]).toEqual({ id: 9 });
    expect(Array.isArray(next.list)).toBe(true);
  });

  it('creates the missing branches, as arrays under a numeric key', () => {
    expect(setIn({} as Record<string, unknown>, ['a', 'b'], 1)).toEqual({ a: { b: 1 } });
    expect(setIn({} as Record<string, unknown>, ['a', 0], 1)).toEqual({ a: [1] });
  });

  it('an empty path replaces the root', () => {
    expect(setIn(base, [], 5)).toBe(5);
  });

  it('never writes through the prototype chain', () => {
    const next = setIn({} as Record<string, unknown>, ['__proto__', 'polluted'], true);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(Object.keys(next)).toEqual(['__proto__']);
    expect(getIn({}, ['constructor', 'name'])).toBeUndefined();
  });
});

const keys = fc.constantFrom('a', 'b', 'c', 'd');
const tree = fc.object({ key: keys, maxDepth: 3, maxKeys: 4, values: [fc.integer(), fc.string(), fc.boolean()], size: 'small' });

function leafPaths(value: unknown, prefix: Array<string | number> = []): Array<string | number>[] {
  if (value === null || typeof value !== 'object') return [prefix];
  return Object.entries(value).flatMap(([k, v]) => leafPaths(v, [...prefix, k]));
}

describe('setIn properties (ADR 0044: deterministic)', () => {
  it('setting a path and then setting the old value back equals the original, and the untouched branches keep their identity', () => {
    fc.assert(
      fc.property(tree, fc.nat(), fc.oneof(fc.integer(), fc.string()), (obj, pick, replacement) => {
        const paths = leafPaths(obj).filter((p) => p.length > 0);
        fc.pre(paths.length > 0);
        const path = paths[pick % paths.length]!;
        const old = getIn(obj, path);
        const changed = setIn(obj, path, replacement);
        const restored = setIn(changed, path, old);
        expect(restored).toEqual(obj);
        const [head] = path;
        for (const k of Object.keys(obj)) {
          if (k !== head) expect((changed as Record<string, unknown>)[k]).toBe((obj as Record<string, unknown>)[k]);
        }
      }),
      { seed: 20261011, numRuns: 200 },
    );
  });
});
