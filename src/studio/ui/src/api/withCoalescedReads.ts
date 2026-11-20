import type { NarrationApi } from '../types';

/**
 * The host reads that may share one answer while it is on its way: each is a question about the project, the DAW or the settings that changes nothing a repeat would not (`pickupsList` flushes waiting marker states to the DAW and the list file, which is idempotent and done by the first call), so two
 * identical calls made while the first is still unanswered get the first's answer (#3560). Measured on a 17 h book, 118 of the 505 host calls
 * of the eleven pages' cold loads were such repeats (the same read, the same arguments, issued by several components that mounted together).
 * Only reads belong here: a method that changes anything a repeat would not, or whose answer must be as of the moment it is asked after another call, does not. Adding one is a deliberate edit of this list and of the test that pins it.
 * The invalidation by host events relies on the name: a handler is passed to a method named `subscribe…` (all of them are), so a new callback-taking method with another name would not move the epoch.
 */
export const COALESCED_READS: ReadonlySet<string> = new Set([
  'bookmarksList',
  'chapterSyncState',
  'dawCapabilities',
  'dawChoice',
  'findingsSummary',
  'manuscriptChapters',
  'measureState',
  'pickupsList',
  'productionOverview',
  'productionPlan',
  'readAloudReaperState',
  'recorderState',
  'settingsForScope',
  'workspaceAlignment',
]);

/**
 * The reads whose answer is kept after it arrives (#3658): data that changes only when this app writes it or the project changes, and that a page asks
 * for again on every mount (the settings: 3 to 5 identical calls on each page's cold load, 57 to 96 KB). A kept answer serves later reads at once
 * until something that may change it happens, then the next read goes to the host. Each is also in `COALESCED_READS`.
 *
 * Dropped by: `saveSettings` (when it starts and when it answers, the only call that writes them), an event of `KEPT_DROPPING_EVENTS` (project attach, project state, job end), the window being focused or shown
 * again, and `KEPT_MAX_AGE_MS` passing (a change this app did not see still shows up on the next read after that). A kept answer older than
 * `KEPT_REVALIDATE_MS` is served and then re-read in the background, so the next reader has the host's current answer (stale while revalidate).
 */
export const KEPT_READS: ReadonlySet<string> = new Set(['settingsForScope']);
/** The calls that change what a kept read answers. */
export const KEPT_WRITERS: ReadonlySet<string> = new Set(['saveSettings']);
/** The events that may mean the settings or the project changed under a page: the project attached or its state moved, or a job ended (an import or a scan that wrote settings). The DAW, recorder and teleprompter events say nothing about them. */
export const KEPT_DROPPING_EVENTS: ReadonlySet<string> = new Set(['subscribeProjectAttach', 'subscribeProjectState', 'subscribeJobEnded']);
export const KEPT_REVALIDATE_MS = 5_000;
export const KEPT_MAX_AGE_MS = 60_000;
type Kept = { answer: unknown; at: number; keptEpoch: number };

function isThenable(value: unknown): value is PromiseLike<unknown> {
  return typeof value === 'object' && value !== null && 'then' in value && typeof value.then === 'function';
}

type Joiner = { resolve: (answer: unknown) => void; reject: (reason: unknown) => void };
/** A read on its way: who joined it, and whether its answer has been handed out (a read asked after that is a fresh host call). */
type InFlight = { epoch: number; keptEpoch: number; joiners: Joiner[]; closed: boolean };

/** Whether value is plain JSON data whose text says exactly what it is: finite numbers, strings, booleans, null, and arrays and plain objects of those. */
function isPlainJson(value: unknown): boolean {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isPlainJson);
  if (typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) return Object.values(value).every(isPlainJson);
  return false;
}

/** The key of a call, or undefined when its arguments are not plain JSON (`undefined`, `NaN`, a BigInt, a Map, a cycle: the text of those is not what they are), so such a call is never shared. */
function keyOf(property: string, args: unknown[]): string | undefined {
  try {
    return args.every(isPlainJson) ? `${property}\u0000${JSON.stringify(args)}` : undefined;
  } catch {
    return undefined; // a cycle or a throwing toJSON
  }
}

/** A copy of answer for an extra caller, or answer itself when it cannot be copied (a function or a symbol in it): the call answers either way. */
function copyOf(answer: unknown): unknown {
  try {
    return structuredClone(answer);
  } catch {
    return answer;
  }
}

/**
 * The api with identical in-flight reads (`COALESCED_READS`) answered once.
 *
 * What invalidates a shared answer is anything that may have changed the host's state: every call that is not one of these reads bumps an epoch when
 * it starts and again when it answers, and so does every event a `subscribe*` handler receives (a host event is the host saying its state changed)
 * and the window being focused or shown again. A read joins only a read that began in the same epoch, so a read asked after a write, an event or
 * a return to the window always goes to the host. Nothing is kept once the call answers (no TTL): the
 * next call is a fresh one. Each extra caller gets its own copy of the answer, so one that sorts or edits its list does not change another's.
 * A failed call rejects every caller that joined it. Calls whose arguments are not plain JSON are never shared.
 */
/** Everything that wants to hear the window coming back (focus, visibility): one pair of listeners for the page, not one per wrapper. */
const windowWatchers = new Set<() => void>();
function watchTheWindow(move: () => void): void {
  if (typeof window === 'undefined') return;
  if (windowWatchers.size === 0) {
    const moved = () => windowWatchers.forEach((watcher) => watcher());
    window.addEventListener('focus', moved);
    document.addEventListener('visibilitychange', moved);
  }
  windowWatchers.add(move);
}

export function withCoalescedReads(api: NarrationApi): NarrationApi {
  const inFlight = new Map<string, InFlight>();
  let epoch = 0;
  // What a kept read last answered, and the epoch that drops it (see KEPT_READS); it moves on the window coming back, on `KEPT_WRITERS` and on `KEPT_DROPPING_EVENTS`, not on every call as `epoch` does.
  let keptEpoch = 0;
  const kept = new Map<string, Kept>();
  // One wrapper per method, as `withTracing` keeps: a hook that lists a method in an effect's dependencies must see the same function on every read (#3272).
  const wrappers = new Map<string, unknown>();
  watchTheWindow(() => {
    epoch += 1;
    keptEpoch += 1;
  });
  return new Proxy(api, {
    get(target, property, receiver) {
      const value: unknown = Reflect.get(target, property, receiver);
      if (typeof property !== 'string' || typeof value !== 'function') return value;
      const cached = wrappers.get(property);
      if (cached) return cached;
      if (property.startsWith('subscribe')) {
        // The same handler gets the same wrapper, so a host that de-duplicates its listeners by identity still does.
        const wrappedHandlers = new WeakMap<object, unknown>();
        const subscribing = (...args: unknown[]) =>
          Reflect.apply(
            value,
            target,
            args.map((arg) => {
              if (typeof arg !== 'function') return arg;
              const known = wrappedHandlers.get(arg);
              if (known) return known;
              const guarded = (...event: unknown[]) => {
                epoch += 1;
                if (KEPT_DROPPING_EVENTS.has(property)) keptEpoch += 1;
                return Reflect.apply(arg, undefined, event);
              };
              wrappedHandlers.set(arg, guarded);
              return guarded;
            }),
          );
        wrappers.set(property, subscribing);
        return subscribing;
      }
      const read = COALESCED_READS.has(property);
      const wrapper = (...args: unknown[]) => {
        if (!read) {
          // A write moves the epoch when it starts and again when it answers: a read that began while it ran may have been answered before it
          // committed, so one asked after it answered must not join that read.
          epoch += 1;
          const writesKept = KEPT_WRITERS.has(property);
          if (writesKept) keptEpoch += 1;
          const outcome: unknown = Reflect.apply(value, target, args);
          if (isThenable(outcome)) {
            const settled = () => {
              epoch += 1;
              if (writesKept) keptEpoch += 1;
            };
            outcome.then(settled, settled); // the call's own thenable, so this runs before the caller's continuation, whatever promise class it is
          }
          return outcome;
        }
        const key = keyOf(property, args);
        if (key === undefined) return Reflect.apply(value, target, args);
        const keeps = KEPT_READS.has(property);
        const held = keeps ? kept.get(key) : undefined;
        if (held && held.keptEpoch === keptEpoch && Date.now() - held.at < KEPT_MAX_AGE_MS) {
          if (Date.now() - held.at >= KEPT_REVALIDATE_MS) {
            // Serve the kept answer and read again for the next reader (that read joins any other in flight); a failed re-read keeps what was kept.
            kept.delete(key);
            const again: unknown = Reflect.apply(wrapper, undefined, args);
            Promise.resolve(again).then(undefined, () => {
              if (!kept.has(key)) kept.set(key, held);
            });
          }
          return Promise.resolve(copyOf(held.answer));
        }
        const joined = inFlight.get(key);
        if (joined && (keeps ? joined.keptEpoch === keptEpoch : joined.epoch === epoch) && !joined.closed) {
          return new Promise((resolve, reject) => joined.joiners.push({ resolve, reject }));
        }
        const result: unknown = Reflect.apply(value, target, args);
        if (!isThenable(result)) return result;
        const entry: InFlight = { epoch, keptEpoch, joiners: [], closed: false };
        inFlight.set(key, entry);
        // The joiners' copies are made here, as the answer arrives and before the first caller's continuation runs: that caller gets the original,
        // so an edit it makes in place (a sort, a splice) cannot reach a copy made after it.
        const startedAt = Date.now();
        const startedKeptEpoch = keptEpoch;
        const promise = Promise.resolve(result).then(
          (answer) => {
            entry.closed = true;
            // Kept only if nothing that drops it happened while the read was on its way.
            if (keeps && startedKeptEpoch === keptEpoch) kept.set(key, { answer: copyOf(answer), at: startedAt, keptEpoch });
            for (const joiner of entry.joiners) joiner.resolve(copyOf(answer));
            return answer;
          },
          (failure: unknown) => {
            entry.closed = true;
            for (const joiner of entry.joiners) joiner.reject(failure);
            throw failure;
          },
        );
        const done = () => {
          if (inFlight.get(key) === entry) inFlight.delete(key);
        };
        promise.then(done, done);
        return promise;
      };
      wrappers.set(property, wrapper);
      return wrapper;
    },
  });
}
