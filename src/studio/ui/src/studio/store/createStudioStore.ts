// The read-model store. It holds what pages show, hydrated through an injected loader, parsed by `parseWire`
// and refreshed when the host says it changed or the window regains focus. It is a cache that can be thrown
// away: `reset()` empties it for a project switch. It never holds the book and exposes no `act` (the journal is separate).

import { parseWire } from '../../api/wire/parseWire';
import type { InferOutput, StandardSchemaV1 } from '../../api/wire/standardSchema';
import { windowFocusSource, type FocusSource } from './focusSource';
import { createKeyedCache, type KeyedCache, type KeyedConfig } from './keyedCache';

/** One cross-page read model: how to read it, how to check it, and what makes it stale. */
export type SlotConfig<S extends StandardSchemaV1 = StandardSchemaV1> = {
  schema: S;
  /** Reads the raw payload from the host through a port. The store parses it; a loader returns it unchecked. */
  load: () => Promise<unknown>;
  /** Host event names that make this slot stale. */
  events?: readonly string[];
  /**
   * In-app change topics that make this slot stale: a page that changed what this slot holds says so with `publish(topic)`, and every
   * other page learns through the slot instead of through a patch of its own. Unlike `events`, nothing subscribes to the host for them.
   */
  topics?: readonly string[];
  /** Reload when the window regains focus. */
  refreshOnFocus?: boolean;
};

export type SlotRegistry = Record<string, SlotConfig>;

export type StudioState<R extends SlotRegistry> = {
  /** A slot is absent until its first successful load. */
  readonly slots: { readonly [K in keyof R]?: InferOutput<R[K]['schema']> };
  /** The last failure of each slot's load; cleared by the next success. A failure never replaces a cached value. */
  readonly errors: { readonly [K in keyof R]?: Error };
};

export type StudioStoreOptions<R extends SlotRegistry> = {
  registry: R;
  /** Keyed read models held beside the slots (the text of each chapter): each is a budgeted cache with the slots' invalidators. */
  keyed?: Record<string, KeyedConfig>;
  /** The host's event bus: calls `handler` for each delivery of `event` and returns the unsubscribe. */
  subscribe: (event: string, handler: () => void) => () => void;
  /** Defaults to the window's focus and visibility. */
  subscribeFocus?: FocusSource;
  /** Hears every failed load, including the ones nobody awaits (events and focus). Defaults to `console.error`. */
  onError?: (slot: string, error: Error) => void;
};

export type StudioStore<R extends SlotRegistry> = {
  getState(): StudioState<R>;
  subscribe(listener: () => void): () => void;
  /** Reads one slot now. Rejects when the loader fails or the payload has the wrong shape; the failure is also recorded. */
  load(slot: keyof R & string): Promise<void>;
  /**
   * Makes sure one slot holds a value: resolves at once when it is loaded (what makes it stale refreshes it in the background), joins a load of it
   * already in flight, and otherwise reads it. A page that needs the list calls this on mount instead of `load`, so mounting does not read what is held.
   * Rejects when the read it started or joined fails. With `settled`, a value that is held while a read of it is in flight (an event made it stale) is not
   * served: the call waits for that read, and a failure of it leaves the held value, so a page that works on what it read does not start from a list the
   * store already knows is out of date.
   */
  ensure(slot: keyof R & string, options?: { settled?: boolean }): Promise<void>;
  /** The keyed cache registered under `name` (the options' `keyed`); throws for a name nothing registered. */
  keyed(name: string): KeyedCache;
  /** Wires the host events and window focus to the slots; returns the stop function. */
  start(): () => void;
  /**
   * Says that something this app changed makes the slots listing `topic` stale, and reads each again now. A topic no slot lists does
   * nothing. It needs no `start()`; a failed read is recorded and reported like any other, never thrown.
   */
  publish(topic: string): void;
  /** Empties every slot and drops loads still in flight (a project switch). */
  reset(): void;
  /** How many times the store was reset: a read made under an earlier number belongs to the project before the switch. Subscribers hear each reset. */
  generation(): number;
};

const toError = (e: unknown): Error => (e instanceof Error ? e : new Error(String(e)));

export function createStudioStore<R extends SlotRegistry>(options: StudioStoreOptions<R>): StudioStore<R> {
  const {
    registry,
    subscribe: subscribeEvent,
    subscribeFocus = windowFocusSource(),
    onError = (slot, e) => console.error(`studio slot ${slot}:`, e),
  } = options;
  const caches = new Map<string, KeyedCache>(Object.entries(options.keyed ?? {}).map(([name, config]) => [name, createKeyedCache(name, config)]));
  const keyedConfigs = Object.entries(options.keyed ?? {});
  const empty: StudioState<R> = { slots: {}, errors: {} };
  let state = empty;
  let epoch = 0;
  const requests = new Map<string, number>();
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((l) => l());

  const setSlot = (name: string, value: unknown) => {
    const errors = { ...state.errors } as Record<string, Error>;
    delete errors[name];
    state = { slots: { ...state.slots, [name]: value }, errors } as StudioState<R>;
    emit();
  };
  const setError = (name: string, error: Error) => {
    state = { ...state, errors: { ...state.errors, [name]: error } };
    emit();
  };

  // Reads one slot and settles with the failure, if any, after recording and reporting it. It never rejects, so an event or
  // focus reload with no caller to hear a rejection needs no catch.
  // The read in flight for each slot, whoever started it (a load, an event, an ensure), so an ensure joins it instead of starting another.
  // A read out longer than `STUCK_READ_MS` is not joined and does not hold back the next one (a host call that never answers must not freeze the slot).
  const STUCK_READ_MS = 5000;
  /** Whether a read that started at `at` is still worth joining: not out longer than the stuck age (a clock set back counts as out too long). */
  const young = (at: number) => {
    const age = Date.now() - at;
    return age >= 0 && age < STUCK_READ_MS;
  };
  /** The newest read of each slot whose answer or failure was written: an older read that answers later writes nothing, a read that was merely slower than a newer one's start still does. */
  const applied = new Map<string, number>();
  const flights = new Map<string, { promise: Promise<Error | undefined>; at: number }>();
  // Slots an event arrived for while a read was in flight: read once more when that read ends (whoever started it), so what the event announced is read.
  const again = new Set<string>();
  function attempt(name: keyof R & string): Promise<Error | undefined> {
    // Events that came before this read starts are read by it.
    again.delete(name);
    const flight = run(name);
    flights.set(name, { promise: flight, at: Date.now() });
    void flight.finally(() => {
      if (flights.get(name)?.promise !== flight) return;
      flights.delete(name);
      if (again.delete(name)) refresh(name);
    });
    return flight;
  }

  async function run(name: keyof R & string): Promise<Error | undefined> {
    const config = Object.hasOwn(registry, name) ? registry[name] : undefined;
    if (!config) return new Error(`studio: no slot named ${name}`);
    const myEpoch = epoch;
    const request = (requests.get(name) ?? 0) + 1;
    requests.set(name, request);
    // A reset or a newer load of the same slot makes this answer stale: it writes nothing, not even its failure.
    const current = () => myEpoch === epoch && request > (applied.get(name) ?? 0);
    let value: unknown;
    try {
      value = parseWire(config.schema, await config.load(), { boundary: 'studio store', payload: name });
    } catch (e) {
      if (!current()) return undefined;
      applied.set(name, request);
      const error = toError(e);
      setError(name, error);
      onError(name, error);
      return error;
    }
    if (current()) {
      applied.set(name, request);
      setSlot(name, value);
    }
    return undefined;
  }

  async function load(name: keyof R & string): Promise<void> {
    const error = await attempt(name);
    if (error) throw error;
  }

  // A burst of events (a sync that updates many times, a write and the event it raises) is one read in flight and at most one trailing read: what the slot
  // holds is read after the last of them, and the ones between add nothing. A read that is out longer than the stuck age does not hold the next one back.
  function refresh(name: keyof R & string): void {
    const flight = flights.get(name);
    if (flight && young(flight.at)) {
      again.add(name);
      return;
    }
    void attempt(name);
  }

  // A load an `ensure` started or joined: the one read in flight for the slot, so callers that mount together share it.
  const ensuring = new Map<string, { promise: Promise<void>; at: number }>();
  function ensure(name: keyof R & string, options?: { settled?: boolean }): Promise<void> {
    if (Object.hasOwn(state.slots, name) && state.slots[name] !== undefined) {
      const flight = options?.settled ? flights.get(name) : undefined;
      return flight && young(flight.at) ? flight.promise.then(() => undefined) : Promise.resolve();
    }
    const running = ensuring.get(name);
    if (running && young(running.at)) return running.promise;
    // A read already in flight (a load, an event, a refresh) is joined, not repeated.
    const flight = flights.get(name);
    const joinable = flight && young(flight.at) ? flight.promise : undefined;
    const read = (joinable ?? attempt(name)).then((error) => {
      if (error) throw error;
    });
    const settled = read.finally(() => {
      if (ensuring.get(name)?.promise === settled) ensuring.delete(name);
    });
    ensuring.set(name, { promise: settled, at: joinable && flight ? flight.at : Date.now() });
    return settled;
  }

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    load,
    ensure,
    keyed(name) {
      const cache = caches.get(name);
      if (!cache) throw new Error(`studio: no keyed cache named ${name}`);
      return cache;
    },
    publish(topic) {
      for (const name of Object.keys(registry) as Array<keyof R & string>) if (registry[name]!.topics?.includes(topic)) refresh(name);
      for (const [name, config] of keyedConfigs) if (config.topics?.includes(topic)) caches.get(name)!.invalidate();
    },
    start() {
      const byEvent = new Map<string, Array<keyof R & string>>();
      const onFocus: Array<keyof R & string> = [];
      for (const name of Object.keys(registry) as Array<keyof R & string>) {
        const config = registry[name]!;
        for (const event of config.events ?? []) byEvent.set(event, [...(byEvent.get(event) ?? []), name]);
        if (config.refreshOnFocus) onFocus.push(name);
      }
      // A keyed cache listens for the same events, topics and focus as a slot, and marks what it holds stale (the next ensure reads it again behind it).
      const keyedByEvent = new Map<string, string[]>();
      const keyedOnFocus: string[] = [];
      for (const [name, config] of keyedConfigs) {
        for (const event of config.events ?? []) keyedByEvent.set(event, [...(keyedByEvent.get(event) ?? []), name]);
        if (config.refreshOnFocus) keyedOnFocus.push(name);
      }
      const stops = [...byEvent].map(([event, names]) => subscribeEvent(event, () => names.forEach(refresh)));
      for (const [event, names] of keyedByEvent) stops.push(subscribeEvent(event, () => names.forEach((name) => caches.get(name)!.invalidate())));
      if (onFocus.length > 0) stops.push(subscribeFocus(() => onFocus.forEach(refresh)));
      if (keyedOnFocus.length > 0) stops.push(subscribeFocus(() => keyedOnFocus.forEach((name) => caches.get(name)!.invalidate())));
      return () => stops.forEach((stop) => stop());
    },
    generation: () => epoch,
    reset() {
      epoch += 1;
      ensuring.clear();
      applied.clear();
      flights.clear();
      again.clear();
      caches.forEach((cache) => cache.clear());
      state = empty;
      emit();
    },
  };
}
