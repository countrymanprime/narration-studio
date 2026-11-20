import { parseWire } from '../../api/wire/parseWire';
import type { InferOutput, StandardSchemaV1 } from '../../api/wire/standardSchema';

/** One keyed read model (the text of each chapter): how to read one key, how to check it, how big it is, and how much of it may be held. */
export type KeyedConfig<S extends StandardSchemaV1 = StandardSchemaV1> = {
  schema: S;
  /** Reads the raw payload for one key through a port. */
  load: (key: string) => Promise<unknown>;
  /** What one held value costs, in the unit of `budget` (characters of its JSON by default). */
  size?: (value: InferOutput<S>) => number;
  /** The most the cache holds; the least recently used keys beyond it are dropped, never the one just read. Unbounded when absent. */
  budget?: number;
  /** Host event names that make every held value stale (the same names a slot lists). */
  events?: readonly string[];
  /** In-app change topics that make every held value stale. */
  topics?: readonly string[];
  /** Mark every held value stale when the window regains focus. */
  refreshOnFocus?: boolean;
};

export type KeyedCache<V = unknown> = {
  /** The held value for a key, or undefined. A stale value is still returned: it is shown while it is read again. */
  get(key: string): V | undefined;
  /** The last failure of a key's read; cleared by its next success. A failure never replaces a held value. */
  error(key: string): Error | undefined;
  /** Whether a held value is older than what changed since it was read. */
  isStale(key: string): boolean;
  /**
   * Makes sure the key is held: resolves at once for a fresh value, serves a stale one now and reads it again behind (a failed re-read keeps it),
   * joins a read of the key already in flight, and otherwise reads. Marks the key as the most recently used. Rejects when the read it started or joined fails.
   */
  ensure(key: string): Promise<void>;
  /** Reads the key now, whatever is held. */
  load(key: string): Promise<void>;
  /**
   * Marks a key as shown by a mounted reader: it is never dropped for the budget while pinned (the budget is a soft limit for what is on screen), so two
   * readers that do not fit together do not push each other out. Pins count: a key is pinned until each pin is released.
   */
  pin(key: string): () => void;
  /** Marks every held value stale without reading: the next `ensure` of a key reads it again behind the held value. */
  invalidate(): void;
  /** Drops every held value and the reads in flight (a project switch). */
  clear(): void;
  /** How much is held, in the unit of `budget`. */
  held(): number;
  subscribe(listener: () => void): () => void;
  /** A number that changes whenever something held or failed does; what a hook reads to redraw. */
  version(): number;
};

const toError = (e: unknown): Error => (e instanceof Error ? e : new Error(String(e)));
const jsonSize = (value: unknown): number => JSON.stringify(value)?.length ?? 0;

/**
 * A keyed, budgeted cache with the store's rules (#3658): a value read is parsed with its schema, kept until the budget pushes it out or the project
 * switches, marked stale (not dropped) when what it holds may have changed, and read again behind the held value. Reads of one key are one call.
 */
export function createKeyedCache<S extends StandardSchemaV1>(name: string, config: KeyedConfig<S>): KeyedCache<InferOutput<S>> {
  type V = InferOutput<S>;
  const measure = config.size ?? ((value: V) => jsonSize(value));
  // A size that throws or is not a finite, non-negative number is measured as the value's JSON instead, so one bad answer cannot evict the rest for good.
  const size = (value: V): number => {
    try {
      const cost = measure(value);
      if (Number.isFinite(cost) && cost >= 0) return cost;
    } catch {
      // measured below
    }
    return jsonSize(value);
  };
  // Insertion order is recency: a key read or used again moves to the end, and the front goes first when the budget is passed.
  const entries = new Map<string, { value: V; size: number; freshAt: number }>();
  const errors = new Map<string, Error>();
  const pins = new Map<string, number>();
  /** The newest read asked for each key: an older read that answers after it writes nothing. */
  const requests = new Map<string, number>();
  const inFlight = new Map<string, Promise<void>>();
  const listeners = new Set<() => void>();
  let total = 0;
  let epoch = 0;
  /** Bumped by `invalidate`: a value read before it is stale. */
  let changed = 0;
  let count = 0;
  const emit = () => {
    count += 1;
    listeners.forEach((listener) => listener());
  };

  const evict = (keep: string) => {
    if (config.budget === undefined) return;
    for (const [key, entry] of entries) {
      if (total <= config.budget) return;
      if (key === keep || pins.has(key)) continue;
      entries.delete(key);
      total -= entry.size;
    }
  };

  const attempt = (key: string): Promise<void> => {
    const mine = epoch;
    const startedAt = changed;
    const request = (requests.get(key) ?? 0) + 1;
    requests.set(key, request);
    const current = () => mine === epoch && requests.get(key) === request;
    const read = (async () => {
      try {
        const value = parseWire(config.schema, await config.load(key), { boundary: 'studio keyed cache', payload: `${name}:${key}` }) as V;
        if (!current()) return;
        const previous = entries.get(key);
        if (previous) {
          total -= previous.size;
          entries.delete(key);
        }
        const cost = size(value);
        entries.set(key, { value, size: cost, freshAt: startedAt });
        total += cost;
        errors.delete(key);
        evict(key);
        emit();
      } catch (e) {
        if (!current()) return;
        errors.set(key, toError(e));
        emit();
        throw errors.get(key);
      }
    })().finally(() => {
      if (inFlight.get(key) === read) inFlight.delete(key);
    });
    inFlight.set(key, read);
    return read;
  };

  const touch = (key: string) => {
    const entry = entries.get(key);
    if (!entry) return;
    entries.delete(key);
    entries.set(key, entry);
  };

  return {
    get: (key) => entries.get(key)?.value,
    error: (key) => errors.get(key),
    isStale: (key) => {
      const entry = entries.get(key);
      return entry !== undefined && entry.freshAt < changed;
    },
    ensure(key) {
      const entry = entries.get(key);
      if (entry) {
        touch(key);
        if (entry.freshAt < changed && !inFlight.has(key)) void attempt(key).catch(() => undefined);
        return Promise.resolve();
      }
      return inFlight.get(key) ?? attempt(key);
    },
    load: (key) => attempt(key),
    pin(key) {
      pins.set(key, (pins.get(key) ?? 0) + 1);
      let released = false;
      return () => {
        if (released) return;
        released = true;
        const left = (pins.get(key) ?? 1) - 1;
        if (left > 0) pins.set(key, left);
        else pins.delete(key);
        evict('');
      };
    },
    invalidate() {
      changed += 1;
      // Something changed, so a key whose read failed is worth one more try: the failures are forgotten.
      errors.clear();
      emit();
    },
    clear() {
      epoch += 1;
      entries.clear();
      errors.clear();
      inFlight.clear();
      requests.clear();
      total = 0;
      emit();
    },
    held: () => total,
    subscribe(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    version: () => count,
  };
}
