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

/** What a reader tells the store about itself: `project` is the project folder the reader is on. A reader that names it is served and read for that project only. */
type ReadOptions = { project?: string };

/** What a reader that named a project is told when the app is on another one: the page is about to be drawn for the new project. */
class ProjectChangedError extends Error {
  constructor() {
    super('The project changed while its chapters were being read.');
    this.name = 'ProjectChangedError';
  }
}

export type StudioStore<R extends SlotRegistry> = {
  getState(): StudioState<R>;
  subscribe(listener: () => void): () => void;
  /**
   * Reads one slot now. Rejects when the loader fails or the payload has the wrong shape; the failure is also recorded. A read that a reset dropped
   * is read again (at most three times), so the caller's answer is the project it is on, never a dropped one. `project` is the folder the reader is on.
   */
  load(slot: keyof R & string, options?: ReadOptions): Promise<void>;
  /**
   * Makes sure one slot holds a value: resolves at once when it is loaded (what makes it stale refreshes it in the background), joins a load of it
   * already in flight, and otherwise reads it. A page that needs the list calls this on mount instead of `load`, so mounting does not read what is held.
   * Rejects when the read it started or joined fails. With `settled`, a value that is held while a read of it is in flight (an event made it stale) is not
   * served: the call waits for that read and rejects when it fails (a page that works on what it read shows the failure with its Retry, as it did before the
   * store, and the store keeps the held list for the pages that only show it). A read that a reset dropped is read again, at most three times.
   */
  ensure(slot: keyof R & string, options?: ReadOptions & { settled?: boolean }): Promise<void>;
  /** The keyed cache registered under `name` (the options' `keyed`); throws for a name nothing registered. */
  keyed(name: string): KeyedCache;
  /** Wires the host events and window focus to the slots; returns the stop function. */
  start(): () => void;
  /**
   * Says that something this app changed makes the slots listing `topic` stale, and reads each again now. A topic no slot lists does
   * nothing. It needs no `start()`; a failed read is recorded and reported like any other, never thrown.
   */
  publish(topic: string): void;
  /**
   * Empties every slot and drops loads still in flight (the host says a project was attached). The project is then unconfirmed until `setProject` hears
   * the host's answer, and a reader that names its project waits for that.
   */
  reset(): void;
  /**
   * Says which project the app is on, from the host's bootstrap. A different folder empties the store (what it holds is for the other project); the
   * same folder after a reset confirms the project. The reader of a held value asks for its own project (`ReadOptions`), and the store records the project
   * each value was read for, so a list is not served under another project's folder once the app has heard of the switch (a read that begins before that is #4040).
   */
  setProject(folder: string): void;
  /** The project the store was last told it is on (`setProject`, or the first reader that named one); undefined before. */
  project(): string | undefined;
  /** The project the held value of `slot` was read for; undefined when nothing is held or the store was never told a project. */
  projectOf(slot: keyof R & string): string | undefined;
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
  // The project the store holds values for, whether the host's answer to the last attach was heard, and the project each held value was read for.
  let onProject: string | undefined;
  let confirmed = true;
  const owners = new Map<string, string | undefined>();
  const waiters = new Set<() => void>();
  // Releases of the readers waiting on a read, called when a reset ends their epoch: a reader waiting on a read that was dropped, and may never answer, reads again.
  // A reader takes its release out when it settles, so a store that is never reset holds none.
  const releases = new Set<() => void>();
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
    const owner = onProject;
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
      owners.set(name, owner);
      setSlot(name, value);
    }
    return undefined;
  }

  const wake = () => [...waiters].forEach((w) => w());
  /**
   * A reader that names its project may read once the store is on that project and the host's answer to the last attach was heard: the host changes its
   * project, unlocks and only then emits `system:attached`, so a bootstrap can name the new folder before the event, or the event can come before the
   * bootstrap does (desktop/attach_order_test.go), and a read in that gap would give one project's list under the other's folder. The wait ends when
   * `setProject` answers: the reader's project (go on), another (the project changed), and after the stuck age with no answer the read is refused.
   */
  function gate(project: string | undefined): Promise<void> | undefined {
    if (project === undefined) return undefined;
    if (onProject === undefined) {
      onProject = project;
      return undefined;
    }
    if (confirmed && onProject === project) return undefined;
    return new Promise<void>((resolve, reject) => {
      const done = (settle: () => void) => {
        clearTimeout(timer);
        waiters.delete(check);
        settle();
      };
      const check = () => {
        if (!confirmed) return;
        if (onProject === project) done(resolve);
        else done(() => reject(new ProjectChangedError()));
      };
      // A reader ahead of the store (its folder is the new one, the app's effect has not told the store yet) is answered by `setProject` in the same commit.
      const timer = setTimeout(() => done(() => reject(new Error('The project is not confirmed yet.'))), STUCK_READ_MS);
      waiters.add(check);
    });
  }

  /** Whether `name` holds a value a reader on `project` may be served: one read for that project (any, when the reader named none). */
  const holds = (name: keyof R & string, project: string | undefined) =>
    Object.hasOwn(state.slots, name) && state.slots[name] !== undefined && (project === undefined || owners.get(name) === project);

  // A read dropped by a reset (it answered after the project changed, or the same project was attached again) wrote nothing: the reader is on a project
  // that is still the store's, so it is read again for it, at most three times in a row so a store that keeps being emptied is not read in a loop.
  function readUntilKept(name: keyof R & string, options: ReadOptions, once: () => Promise<void>, round = 0): Promise<void> {
    const start = () => {
      const before = epoch;
      let release = () => {};
      const dropped = new Promise<void>((resolve) => releases.add((release = resolve)));
      return Promise.race([once(), dropped])
        .finally(() => releases.delete(release))
        .then(() => {
          if (epoch === before || holds(name, options.project) || round >= 2) return;
          return readUntilKept(name, options, once, round + 1);
        });
    };
    // A reader that waits for nothing starts its read in the same turn, as every reader did before the gate.
    const waiting = gate(options.project);
    return waiting ? waiting.then(start) : start();
  }

  function load(name: keyof R & string, options: ReadOptions = {}): Promise<void> {
    return readUntilKept(name, options, async () => {
      const error = await attempt(name);
      if (error) throw error;
    });
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

  // The reads of a slot that a settled `ensure` waits for: the one in flight and the read an event queued behind it (`again`), each for at most as long as the
  // store would still join it (`STUCK_READ_MS` from its start), so a read that never answers does not hold the caller. The last one's failure is the caller's.
  async function waitForReads(name: keyof R & string): Promise<void> {
    let failed: Error | undefined;
    for (let reads = 0; reads < 3; reads += 1) {
      const flight = flights.get(name);
      if (!flight || !young(flight.at)) break;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const left = new Promise<undefined>((resolve) => (timer = setTimeout(() => resolve(undefined), Math.max(0, STUCK_READ_MS - (Date.now() - flight.at)))));
      failed = await Promise.race([flight.promise, left]);
      clearTimeout(timer);
      // The read an event queued behind this one starts as this one ends.
      await Promise.resolve();
    }
    if (failed) throw failed;
  }

  // A load an `ensure` started or joined: the one read in flight for the slot, so callers that mount together share it.
  const ensuring = new Map<string, { promise: Promise<void>; at: number }>();
  function ensureOnce(name: keyof R & string, options: ReadOptions & { settled?: boolean }): Promise<void> {
    if (holds(name, options.project)) return options.settled ? waitForReads(name) : Promise.resolve();
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
  const ensure = (name: keyof R & string, options: ReadOptions & { settled?: boolean } = {}) => readUntilKept(name, options, () => ensureOnce(name, options));

  /** Empties what is held and drops the reads in flight. */
  function clearHeld() {
    epoch += 1;
    releases.forEach((release) => release());
    releases.clear();
    ensuring.clear();
    applied.clear();
    flights.clear();
    again.clear();
    owners.clear();
    caches.forEach((cache) => cache.clear());
    state = empty;
    emit();
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
      clearHeld();
      // The host attached a project and has not said which: readers that name theirs wait for `setProject`.
      if (onProject !== undefined) confirmed = false;
    },
    setProject(folder) {
      const changed = onProject !== undefined && onProject !== folder;
      onProject = folder;
      confirmed = true;
      if (changed) clearHeld();
      wake();
    },
    project: () => onProject,
    projectOf: (name) => (holds(name, undefined) ? owners.get(name) : undefined),
  };
}
