// The small copy-on-write helpers ADR 0770 decision 4 names in place of immer. `setIn` returns a new object along the
// changed path and keeps the identity of every other branch, so a `useSyncExternalStore` selector that returns a slice
// stays stable when an unrelated part changes. They cover the shallow UI-only slices; they do not diff.

type Key = string | number;

const own = (value: unknown, key: Key): boolean => value !== null && typeof value === 'object' && Object.hasOwn(value, key);

/** Reads `path` from `value`; undefined when a step is missing. Only own properties count, so `constructor` is never reached. */
export function getIn(value: unknown, path: readonly Key[]): unknown {
  let current = value;
  for (const key of path) {
    if (!own(current, key)) return undefined;
    current = (current as Record<Key, unknown>)[key];
  }
  return current;
}

/**
 * Returns `root` with `value` at `path`. A step that is missing becomes an array under a numeric key and an object under
 * any other, and a value already at the path returns `root` itself. Keys are written as own properties of a copy, never
 * assigned, so `__proto__` cannot reach a prototype.
 */
export function setIn<T>(root: T, path: readonly Key[], value: unknown): T {
  const [key, ...rest] = path;
  if (key === undefined) return value as T;
  const exists = own(root, key);
  const child = exists ? (root as Record<Key, unknown>)[key] : undefined;
  const nextChild = rest.length === 0 ? value : setIn(child ?? (typeof rest[0] === 'number' ? [] : {}), rest, value);
  if (exists && Object.is(child, nextChild)) return root;
  if (Array.isArray(root)) {
    const copy: unknown[] = root.slice();
    copy[key as number] = nextChild;
    return copy as T;
  }
  const source = root !== null && typeof root === 'object' ? root : {};
  return { ...source, [key]: nextChild } as T;
}
