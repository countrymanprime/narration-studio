import type { NarrationApi } from '../types';
import { trace, traceId } from './tracing';

/**
 * Calls that are not host calls to time: the subscriptions return an unsubscribe function, not a promise, and `systemTraceBatch` is the
 * trace itself (tracing it would trace its own batches for ever).
 */
const UNTRACED = (name: string): boolean => name.startsWith('subscribe') || name === 'systemTraceBatch';

function isThenable(value: unknown): value is PromiseLike<unknown> {
  return typeof value === 'object' && value !== null && 'then' in value && typeof value.then === 'function';
}

/**
 * The api with every host call recorded in the activity trace: its name, how long it took and whether it ended (docs/prds/activity-trace.prd.md).
 * Arguments and answers are never read. A new binding is traced with no code, because the wrapper takes the name from the call and a test
 * (tracing.test.ts) fails if a method is neither traced nor listed there with a reason.
 */
export function withTracing(api: NarrationApi): NarrationApi {
  return new Proxy(api, {
    get(target, property, receiver) {
      const value: unknown = Reflect.get(target, property, receiver);
      if (typeof property !== 'string' || typeof value !== 'function' || UNTRACED(property)) return value;
      const name = traceId(property);
      return (...args: unknown[]) => {
        const started = performance.now();
        const done = (outcome: 'ok' | 'error'): void => {
          const fields: Record<string, string | number> = { name, dur: Math.round(performance.now() - started), outcome };
          if (outcome === 'error') fields.err = 'other';
          trace('ui.binding', fields);
        };
        let result: unknown;
        try {
          result = Reflect.apply(value, target, args);
        } catch (failure) {
          done('error');
          throw failure;
        }
        if (isThenable(result)) {
          return result.then(
            (answer) => {
              done('ok');
              return answer;
            },
            (failure: unknown) => {
              done('error');
              throw failure;
            },
          );
        }
        done('ok');
        return result;
      };
    },
  });
}
