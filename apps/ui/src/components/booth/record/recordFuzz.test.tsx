// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import fc from 'fast-check';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../../api/ApiContext';
import type { DawCapabilities } from '../../../api/contracts/daw';
import { createMockApi } from '../../../api/mockApi';
import { DAW_SETUPS } from '../../../fixtures/daw';
import type { DawClient } from '../../../ports/daw';
import { PortOverrides } from '../../../ports/usePort';
import type { NarrationApi } from '../../../types';
import { dawClientFor } from './fixtures';
import { POLL_MS, useRecordControl } from './useRecordControl';

// Random sequences of everything that can happen to the Record control, with the invariants that must hold after every step: Record is
// never off without a reason, the narrator can always stop a take, and a take is never lost (or invented) without a sentence saying so.

beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const base = DAW_SETUPS.reaper;
type Picture = 'available' | 'standalone' | 'not_running' | 'experimental_off' | 'turned_off' | 'no_record_entry';
const pictureOf = (kind: Picture): DawCapabilities => {
  if (kind === 'available') return base;
  const rest = Object.fromEntries(Object.entries(base.capabilities).filter(([key]) => key !== 'record'));
  if (kind === 'no_record_entry') return { ...base, capabilities: rest };
  return {
    ...base,
    reachable: kind !== 'not_running' && kind !== 'standalone',
    capabilities: { ...rest, record: { level: 'experimental', available: false, reason: kind, message: `refused: ${kind}` } },
  };
};

type Outcome = 'ok' | 'refuse' | 'throw';
type Action =
  | { t: 'event'; picture: Picture }
  | { t: 'readState'; ok: boolean; picture: Picture }
  | { t: 'checkAgain' }
  | { t: 'focus' }
  | { t: 'tick' }
  | { t: 'hostOutcome'; start: Outcome; stop: Outcome }
  | { t: 'openProject'; open: 'same' | 'different' | 'unknown' | 'fail' }
  | { t: 'press' }
  | { t: 'doublePress' };

const picture = fc.constantFrom<Picture>('available', 'standalone', 'not_running', 'experimental_off', 'turned_off', 'no_record_entry');
const outcome = fc.constantFrom<Outcome>('ok', 'refuse', 'throw');
const action: fc.Arbitrary<Action> = fc.oneof(
  { weight: 3, arbitrary: picture.map((p): Action => ({ t: 'event', picture: p })) },
  { weight: 2, arbitrary: fc.record({ ok: fc.boolean(), picture }).map((r): Action => ({ t: 'readState', ...r })) },
  { weight: 2, arbitrary: fc.constant<Action>({ t: 'checkAgain' }) },
  { weight: 1, arbitrary: fc.constant<Action>({ t: 'focus' }) },
  { weight: 2, arbitrary: fc.constant<Action>({ t: 'tick' }) },
  { weight: 2, arbitrary: fc.record({ start: outcome, stop: outcome }).map((r): Action => ({ t: 'hostOutcome', ...r })) },
  { weight: 2, arbitrary: fc.constantFrom('same', 'different', 'unknown', 'fail').map((open): Action => ({ t: 'openProject', open })) },
  { weight: 5, arbitrary: fc.constant<Action>({ t: 'press' }) },
  { weight: 1, arbitrary: fc.constant<Action>({ t: 'doublePress' }) },
);

async function settle() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(5);
  });
}

async function run(actions: Action[]) {
  let readPicture: DawCapabilities | 'fail' = pictureOf('experimental_off');
  let emit: (next: DawCapabilities) => void = () => {};
  const host = { start: 'ok' as Outcome, stop: 'ok' as Outcome };
  let open: 'same' | 'different' | 'unknown' | 'fail' = 'unknown';
  const client: DawClient = {
    ...dawClientFor('reaper'),
    capabilities: async () => {
      if (readPicture === 'fail') throw new Error('no answer');
      return readPicture;
    },
    subscribeCapabilities: (listener) => ((emit = listener), () => {}),
    recordStart: async () => {
      if (host.start === 'throw') throw new Error('host gone');
      return host.start === 'ok'
        ? { ok: true, changed: true, undoSteps: 1, message: 'started' }
        : { ok: false, changed: false, undoSteps: 0, message: 'no', refused: 'The DAW refused to start.' };
    },
    recordStop: async () => {
      if (host.stop === 'throw') throw new Error('host gone');
      return host.stop === 'ok'
        ? { ok: true, changed: true, undoSteps: 0, message: 'stopped' }
        : { ok: false, changed: false, undoSteps: 0, message: 'no', refused: 'The DAW refused to stop.' };
    },
  };
  const api = createMockApi({
    bootstrap: async () => {
      if (open === 'fail') throw new Error('no answer');
      const data = await createMockApi().bootstrap();
      return { ...data, dawFileLinked: open !== 'unknown', dawReachable: open !== 'unknown', dawProjectMatches: open === 'same' };
    },
  } as Partial<NarrationApi>);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <ApiProvider api={api}>
      <PortOverrides clients={{ daw: client }}>{children}</PortOverrides>
    </ApiProvider>
  );
  const notify = vi.fn();
  const { result } = renderHook(() => useRecordControl({ chapterId: 'c1', notify }), { wrapper });
  await settle();

  const check = (step: string) => {
    const now = result.current;
    // Never silently off: a disabled Record always carries the sentence that says why.
    if (!now.recording && now.disabled) expect(now.reason, `${step}: Record is off with no reason`).not.toBe('');
    // Never a dead end during a take: Stop is always available.
    if (now.recording) expect(now.disabled, `${step}: Stop is disabled`).toBe(false);
  };
  check('open');

  for (const [index, step] of actions.entries()) {
    const label = `#${index} ${JSON.stringify(step)}`;
    const before = result.current;
    switch (step.t) {
      case 'event':
        act(() => emit(pictureOf(step.picture)));
        break;
      case 'readState':
        readPicture = step.ok ? pictureOf(step.picture) : 'fail';
        break;
      case 'checkAgain':
        act(() => before.checkAgain());
        break;
      case 'focus':
        act(() => void window.dispatchEvent(new Event('focus')));
        break;
      case 'tick':
        await act(async () => {
          await vi.advanceTimersByTimeAsync(POLL_MS + 10);
        });
        break;
      case 'hostOutcome':
        host.start = step.start;
        host.stop = step.stop;
        break;
      case 'openProject':
        open = step.open;
        break;
      case 'press':
      case 'doublePress': {
        const wasRecording = before.recording;
        const refusedByGate = !wasRecording && before.disabled;
        const mustSucceed = wasRecording ? host.stop === 'ok' : host.start === 'ok';
        await act(async () => {
          const first = result.current.toggle();
          if (step.t === 'doublePress') void result.current.toggle();
          await first;
        });
        await settle();
        const now = result.current;
        if (refusedByGate) {
          expect(now.recording, `${label}: a refused press started a take`).toBe(false);
        } else if (wasRecording) {
          // A take is never lost without notice: it ended only if the host said so, and a failed Stop says it failed.
          expect(now.recording, `${label}: take state after Stop`).toBe(!mustSucceed);
          if (!mustSucceed) expect(now.reason, `${label}: a failed Stop is silent`).not.toBe('');
        } else {
          expect(now.recording, `${label}: take state after Record`).toBe(mustSucceed);
          if (!mustSucceed) expect(now.reason, `${label}: a failed start is silent`).not.toBe('');
        }
        break;
      }
    }
    await settle();
    check(label);
  }
}

describe('Record never dead-ends or goes silent, over random event, read, failure and press sequences', () => {
  it('holds the invariants', async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(action, { minLength: 1, maxLength: 25 }), async (actions) => {
        await run(actions);
        cleanup();
      }),
      { numRuns: 40 },
    );
  }, 120_000);

  it('a known tricky sequence: record, the host dies, Stop throws, the DAW comes back, Stop works', async () => {
    await run([
      { t: 'event', picture: 'available' },
      { t: 'press' },
      { t: 'hostOutcome', start: 'ok', stop: 'throw' },
      { t: 'event', picture: 'not_running' },
      { t: 'press' },
      { t: 'event', picture: 'available' },
      { t: 'hostOutcome', start: 'ok', stop: 'ok' },
      { t: 'press' },
    ]); // run() asserts the invariants after every step
  });
});
