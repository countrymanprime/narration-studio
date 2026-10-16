// The read-model store (ADR 0770). It holds what pages show, hydrated through an injected loader, parsed by `parseWire`
// (ADR 0069) and refreshed when the host says it changed or the window regains focus. It is a cache that can be thrown
// away: `reset()` empties it for a project switch. It never holds the book and exposes no `act` (the journal is separate).

import { parseWire } from '../../api/wire/parseWire';
import type { InferOutput, StandardSchemaV1 } from '../../api/wire/standardSchema';
import { windowFocusSource, type FocusSource } from './focusSource';

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
  /** Wires the host events and window focus to the slots; returns the stop function. */
  start(): () => void;
  /**
   * Says that something this app changed makes the slots listing `topic` stale, and reads each again now. A topic no slot lists does
   * nothing. It needs no `start()`; a failed read is recorded and reported like any other, never thrown.
   */
  publish(topic: string): void;
  /** Empties every slot and drops loads still in flight (a project switch). */
  reset(): void;
};

const toError = (e: unknown): Error => (e instanceof Error ? e : new Error(String(e)));

export function createStudioStore<R extends SlotRegistry>(options: StudioStoreOptions<R>): StudioStore<R> {
  const {
    registry,
    subscribe: subscribeEvent,
    subscribeFocus = windowFocusSource(),
    onError = (slot, e) => console.error(`studio slot ${slot}:`, e),
  } = options;
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
  async function attempt(name: keyof R & string): Promise<Error | undefined> {
    const config = registry[name];
    if (!config) return new Error(`studio: no slot named ${name}`);
    const myEpoch = epoch;
    const request = (requests.get(name) ?? 0) + 1;
    requests.set(name, request);
    // A reset or a newer load of the same slot makes this answer stale: it writes nothing, not even its failure.
    const current = () => myEpoch === epoch && requests.get(name) === request;
    let value: unknown;
    try {
      value = parseWire(config.schema, await config.load(), { boundary: 'studio store', payload: name });
    } catch (e) {
      if (!current()) return undefined;
      const error = toError(e);
      setError(name, error);
      onError(name, error);
      return error;
    }
    if (current()) setSlot(name, value);
    return undefined;
  }

  async function load(name: keyof R & string): Promise<void> {
    const error = await attempt(name);
    if (error) throw error;
  }

  const refresh = (name: keyof R & string) => void attempt(name);

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    load,
    publish(topic) {
      for (const name of Object.keys(registry) as Array<keyof R & string>) if (registry[name]!.topics?.includes(topic)) refresh(name);
    },
    start() {
      const byEvent = new Map<string, Array<keyof R & string>>();
      const onFocus: Array<keyof R & string> = [];
      for (const name of Object.keys(registry) as Array<keyof R & string>) {
        const config = registry[name]!;
        for (const event of config.events ?? []) byEvent.set(event, [...(byEvent.get(event) ?? []), name]);
        if (config.refreshOnFocus) onFocus.push(name);
      }
      const stops = [...byEvent].map(([event, names]) => subscribeEvent(event, () => names.forEach(refresh)));
      if (onFocus.length > 0) stops.push(subscribeFocus(() => onFocus.forEach(refresh)));
      return () => stops.forEach((stop) => stop());
    },
    reset() {
      epoch += 1;
      state = empty;
      emit();
    },
  };
}
