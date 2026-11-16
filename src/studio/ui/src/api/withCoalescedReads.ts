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

function isThenable(value: unknown): value is PromiseLike<unknown> {
  return typeof value === 'object' && value !== null && 'then' in value && typeof value.then === 'function';
}

type InFlight = { promise: Promise<unknown>; epoch: number };

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
export function withCoalescedReads(api: NarrationApi): NarrationApi {
  const inFlight = new Map<string, InFlight>();
  let epoch = 0;
  // One wrapper per method, as `withTracing` keeps: a hook that lists a method in an effect's dependencies must see the same function on every read (#3272).
  const wrappers = new Map<string, unknown>();
  // The window coming back (focus, visibility) is the narrator having been elsewhere, in the DAW or another window: what a read in flight began with may be old.
  if (typeof window !== 'undefined') {
    const moved = () => {
      epoch += 1;
    };
    window.addEventListener('focus', moved);
    document.addEventListener('visibilitychange', moved);
  }
  return new Proxy(api, {
    get(target, property, receiver) {
      const value: unknown = Reflect.get(target, property, receiver);
      if (typeof property !== 'string' || typeof value !== 'function') return value;
      const cached = wrappers.get(property);
      if (cached) return cached;
      if (property.startsWith('subscribe')) {
        // The handler hears the event after the epoch moves, so a read it makes is never answered by one that began before the event.
        const subscribing = (...args: unknown[]) =>
          Reflect.apply(
            value,
            target,
            args.map((arg) =>
              typeof arg === 'function'
                ? (...event: unknown[]) => {
                    epoch += 1;
                    return Reflect.apply(arg, undefined, event);
                  }
                : arg,
            ),
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
          const outcome: unknown = Reflect.apply(value, target, args);
          if (isThenable(outcome)) {
            const settled = () => {
              epoch += 1;
            };
            outcome.then(settled, settled); // the call's own thenable, so this runs before the caller's continuation, whatever promise class it is
          }
          return outcome;
        }
        const key = keyOf(property, args);
        if (key === undefined) return Reflect.apply(value, target, args);
        const joined = inFlight.get(key);
        if (joined && joined.epoch === epoch) return joined.promise.then(copyOf);
        const result: unknown = Reflect.apply(value, target, args);
        if (!isThenable(result)) return result;
        const promise = Promise.resolve(result);
        const entry = { promise, epoch };
        inFlight.set(key, entry);
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
