import type { NarrationApi } from '../types';

declare global {
  interface Window {
    __hostPending?: number;
    __hostCalls?: { name: string; start: number; ms: number; bytes: number }[];
  }
}

/** The api with every call recorded in `window.__hostCalls` (name, start, duration, answer size as JSON), for the page benchmark (`?mockCallLog=1`). Mock builds only. */
export function withCallLog(api: NarrationApi): NarrationApi {
  const log = (window.__hostCalls ??= []);
  return new Proxy(api, {
    get(target, property, receiver) {
      const value: unknown = Reflect.get(target, property, receiver);
      if (typeof property !== 'string' || typeof value !== 'function' || property.startsWith('subscribe')) return value;
      return (...args: unknown[]) => {
        const start = performance.now();
        window.__hostPending = (window.__hostPending ?? 0) + 1;
        const result: unknown = value.apply(target, args);
        if (typeof result !== 'object' || result === null || !('then' in result) || typeof result.then !== 'function') return result;
        return (result as Promise<unknown>)
          .finally(() => (window.__hostPending = (window.__hostPending ?? 1) - 1))
          .then((answer) => {
            let bytes = 0;
            try {
              bytes = JSON.stringify(answer)?.length ?? 0;
            } catch {
              /* an answer that is not JSON has no size */
            }
            log.push({ name: property, start, ms: performance.now() - start, bytes });
            return answer;
          });
      };
    },
  });
}
