import type { NarrationApi } from '../types';

/**
 * The host reads that may share one answer while it is on its way: each is a pure question about the project, the DAW or the settings, so two
 * identical calls made while the first is still unanswered get the first's answer (#3560). Measured on a 17 h book, 118 of the 505 host calls
 * of the eleven pages' cold loads were such repeats (the same read, the same arguments, issued by several components that mounted together).
 * Only reads belong here: a method that changes anything, or whose answer must be as of the moment it is asked after another call, does not.
 */
export const COALESCED_READS: ReadonlySet<string> = new Set([
  'assetsList',
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

/**
 * The api with identical in-flight reads (`COALESCED_READS`) answered once.
 *
 * What invalidates a shared answer is any other call starting: every call that is not one of these reads bumps an epoch, and a read joins only a
 * read that began in the same epoch, so a read asked after a write always goes to the host. Nothing is kept once the call answers (no TTL): the
 * next call is a fresh one. Each extra caller gets its own copy of the answer, so one that sorts or edits its list does not change another's.
 * A failed call rejects every caller that joined it.
 */
export function withCoalescedReads(api: NarrationApi): NarrationApi {
  const inFlight = new Map<string, InFlight>();
  let epoch = 0;
  // One wrapper per method, as `withTracing` keeps: a hook that lists a method in an effect's dependencies must see the same function on every read (#3272).
  const wrappers = new Map<string, unknown>();
  return new Proxy(api, {
    get(target, property, receiver) {
      const value: unknown = Reflect.get(target, property, receiver);
      if (typeof property !== 'string' || typeof value !== 'function' || property.startsWith('subscribe')) return value;
      const cached = wrappers.get(property);
      if (cached) return cached;
      const read = COALESCED_READS.has(property);
      const wrapper = (...args: unknown[]) => {
        if (!read) {
          epoch += 1;
          return Reflect.apply(value, target, args);
        }
        const key = `${property}\u0000${JSON.stringify(args)}`;
        const joined = inFlight.get(key);
        if (joined && joined.epoch === epoch) return joined.promise.then((answer) => structuredClone(answer));
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
