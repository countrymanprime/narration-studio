// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import fc from 'fast-check';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../../api/ApiContext';
import type { DawCapabilities, DawProjectState, DawTransport } from '../../../api/contracts/daw';
import { createMockApi } from '../../../api/mockApi';
import { DAW_SETUPS } from '../../../fixtures/daw';
import type { DawClient } from '../../../ports/daw';
import { PortOverrides } from '../../../ports/usePort';
import type { NarrationApi } from '../../../types';
import { dawClientFor } from './fixtures';
import { POLL_MS, useRecordControl } from './useRecordControl';

// The Booth's whole take state machine against a DAW whose truth the test owns: events that are lost, repeated, late or out of order, reads that
// fail, a take started or stopped in the DAW itself, a stop from the leave guard, and the press. After every step Record is never off without a
// reason and Stop is always there; and from ANY sequence, once the DAW is healthy and still and a few reads have happened (a focus, a timer tick), the
// Booth agrees with the DAW: a take ended in the DAW ends here, a take the DAW holds that this app did not start refuses Record in a sentence.

beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const AVAILABLE: DawCapabilities = DAW_SETUPS.reaper;
const QUIET: DawCapabilities = {
  ...AVAILABLE,
  reachable: false,
  capabilities: { ...AVAILABLE.capabilities, record: { level: 'experimental', available: false, reason: 'not_running', message: 'REAPER is not answering.' } },
};

type Action =
  | { t: 'press' }
  | { t: 'transportEvent'; recording: boolean }
  | { t: 'duplicateEvent' }
  | { t: 'externalStart' }
  | { t: 'externalStop' }
  | { t: 'dropEvents'; on: boolean }
  | { t: 'readsFail'; on: boolean }
  | { t: 'dawQuiet'; on: boolean }
  | { t: 'leaveStop' }
  | { t: 'focus' }
  | { t: 'tick' };

const action: fc.Arbitrary<Action> = fc.oneof(
  { weight: 5, arbitrary: fc.constant<Action>({ t: 'press' }) },
  { weight: 3, arbitrary: fc.boolean().map((recording): Action => ({ t: 'transportEvent', recording })) },
  { weight: 1, arbitrary: fc.constant<Action>({ t: 'duplicateEvent' }) },
  { weight: 2, arbitrary: fc.constant<Action>({ t: 'externalStart' }) },
  { weight: 2, arbitrary: fc.constant<Action>({ t: 'externalStop' }) },
  { weight: 2, arbitrary: fc.boolean().map((on): Action => ({ t: 'dropEvents', on })) },
  { weight: 2, arbitrary: fc.boolean().map((on): Action => ({ t: 'readsFail', on })) },
  { weight: 2, arbitrary: fc.boolean().map((on): Action => ({ t: 'dawQuiet', on })) },
  { weight: 1, arbitrary: fc.constant<Action>({ t: 'leaveStop' }) },
  { weight: 2, arbitrary: fc.constant<Action>({ t: 'focus' }) },
  { weight: 3, arbitrary: fc.constant<Action>({ t: 'tick' }) },
);

const settle = () => act(async () => void (await vi.advanceTimersByTimeAsync(5)));
const tick = () => act(async () => void (await vi.advanceTimersByTimeAsync(POLL_MS + 10)));

async function run(actions: Action[]) {
  // What the DAW holds: the truth every read answers and every event is a (possibly lost) report of.
  const dawRecording = { value: false, startedByApp: false };
  const world = { dropEvents: false, readsFail: false, quiet: false };
  let sendCapabilities: (next: DawCapabilities) => void = () => {};
  let sendTransport: (next: DawTransport) => void = () => {};
  const transportNow = (): DawTransport => ({ playing: dawRecording.value, recording: dawRecording.value });
  const report = () => {
    if (!world.dropEvents && !world.quiet) sendTransport(transportNow());
  };
  const client: DawClient = {
    ...dawClientFor('reaper'),
    capabilities: async () => {
      if (world.readsFail) throw new Error('no answer');
      return world.quiet ? QUIET : AVAILABLE;
    },
    subscribeCapabilities: (listener) => ((sendCapabilities = listener), () => {}),
    subscribeTransport: (listener) => ((sendTransport = listener), () => {}),
    projectState: async (): Promise<DawProjectState> => {
      if (world.readsFail) throw new Error('no answer');
      const recording = dawRecording.value && !world.quiet;
      return { savedAt: null, unsavedChanges: false, playState: recording ? 'recording' : 'stopped', playPosition: recording ? 3 : 0 };
    },
    recordStart: async () => {
      if (world.quiet) throw new Error('the DAW is not answering');
      dawRecording.value = true;
      dawRecording.startedByApp = true;
      report();
      return { ok: true, changed: true, undoSteps: 0, message: 'started' };
    },
    recordStop: async () => {
      if (world.quiet) throw new Error('the DAW is not answering');
      dawRecording.value = false;
      report();
      return { ok: true, changed: true, undoSteps: 0, message: 'stopped' };
    },
  };
  const api = createMockApi({
    bootstrap: async () => ({ ...(await createMockApi().bootstrap()), dawFileLinked: true, dawReachable: true, dawProjectMatches: true }),
  } as Partial<NarrationApi>);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <ApiProvider api={api}>
      <PortOverrides clients={{ daw: client }}>{children}</PortOverrides>
    </ApiProvider>
  );
  const notify = vi.fn();
  const { result } = renderHook(() => useRecordControl({ chapterId: 'c1', notify }), { wrapper });
  await settle();

  const invariants = (step: string) => {
    const now = result.current;
    if (!now.recording && now.disabled) expect(now.reason, `${step}: Record is off with no reason`).not.toBe('');
    if (now.recording) expect(now.disabled, `${step}: Stop is disabled during a take`).toBe(false);
  };
  invariants('open');

  for (const [index, step] of actions.entries()) {
    const label = `#${index} ${JSON.stringify(step)}`;
    switch (step.t) {
      case 'press':
        await act(async () => void (await result.current.toggle().catch(() => {})));
        break;
      case 'transportEvent':
        // Any report, true to the DAW or not: a stale one, a duplicate, one out of order.
        act(() => sendTransport({ playing: step.recording, recording: step.recording }));
        break;
      case 'duplicateEvent':
        act(() => sendTransport(transportNow()));
        act(() => sendTransport(transportNow()));
        break;
      case 'externalStart':
        dawRecording.value = true;
        dawRecording.startedByApp = false;
        act(() => report());
        break;
      case 'externalStop':
        dawRecording.value = false;
        act(() => report());
        break;
      case 'dropEvents':
        world.dropEvents = step.on;
        break;
      case 'readsFail':
        world.readsFail = step.on;
        break;
      case 'dawQuiet':
        world.quiet = step.on;
        if (step.on) dawRecording.value = false;
        act(() => sendCapabilities(step.on ? QUIET : AVAILABLE));
        break;
      case 'leaveStop':
        // The leave guard's own "Stop and leave": the host stops the take it started, and the Booth is told at once.
        if (result.current.recording && !world.quiet) {
          dawRecording.value = false;
          act(() => result.current.stopped());
        }
        break;
      case 'focus':
        act(() => void window.dispatchEvent(new Event('focus')));
        break;
      case 'tick':
        await tick();
        break;
    }
    await settle();
    invariants(label);
  }

  // Convergence: the DAW is healthy and still, events are delivered again, and the window is focused a few times as a narrator's would be.
  world.dropEvents = false;
  world.readsFail = false;
  world.quiet = false;
  act(() => sendCapabilities(AVAILABLE));
  for (let round = 0; round < 6; round++) {
    act(() => void window.dispatchEvent(new Event('focus')));
    await tick();
  }
  await settle();
  const end = result.current;
  if (dawRecording.value) {
    if (!end.recording) {
      // A take the DAW holds that this app is not running: Record says so and does not offer a second start.
      expect(end.disabled, 'the DAW records, the Booth is neither recording nor refusing').toBe(true);
      expect(end.reason).toMatch(/already recording/);
    }
  } else {
    expect(end.recording, 'the DAW is stopped, the Booth still shows a take').toBe(false);
    expect(end.disabled, 'the DAW is stopped and ready, Record is still off').toBe(false);
  }
}

describe('the Booth and the DAW agree again once the DAW is healthy, whatever happened before', () => {
  it('holds over random sequences of lost, repeated and false events, failed reads, outside takes and leave stops', async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(action, { minLength: 1, maxLength: 25 }), async (actions) => {
        await run(actions);
        cleanup();
      }),
      { numRuns: 40 },
    );
  }, 240_000);

  it('a lost stop event while recording is healed by the timer', async () => {
    await run([{ t: 'press' }, { t: 'dropEvents', on: true }, { t: 'externalStop' }]);
  });

  it('a take started in the DAW with its event lost is found by the next focus', async () => {
    await run([{ t: 'dropEvents', on: true }, { t: 'externalStart' }]);
  });

  it('the DAW going quiet mid-take and coming back stopped', async () => {
    await run([{ t: 'press' }, { t: 'dawQuiet', on: true }, { t: 'tick' }, { t: 'dawQuiet', on: false }]);
  });

  it('a false "recording" event with the DAW stopped does not leave a take up', async () => {
    await run([{ t: 'transportEvent', recording: true }, { t: 'press' }, { t: 'transportEvent', recording: true }, { t: 'leaveStop' }]);
  });
});
