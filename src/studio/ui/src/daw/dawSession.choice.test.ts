// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DawCapabilities, DawChoice } from '../api/contracts/daw';
import { DAW_SETUPS } from '../fixtures/daw';
import { createDawSession, type DawSessionApi } from './dawSession';

const OFF: DawCapabilities = structuredClone(DAW_SETUPS['reaper-off']);
const ON: DawCapabilities = structuredClone(DAW_SETUPS['reaper']);
const choice = (state: string) => ({ hasProject: true, daw: 'REAPER', linkedFile: 'Alice.rpp', state, starting: null, bridge: null }) as unknown as DawChoice;

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

function host(caps: () => DawCapabilities, dawChoice: DawSessionApi['dawChoice']): DawSessionApi {
  return {
    dawCapabilities: async () => caps(),
    dawChoice,
    dawMeters: async () => ({ ok: false, message: '', reason: '' }) as never,
    workspaceProjectFx: async () => ({ ok: true }) as never,
    subscribeDawCapabilities: () => () => undefined,
    subscribeDawTransport: () => () => undefined,
  } as unknown as DawSessionApi;
}

afterEach(() => vi.useRealTimers());

// What the connecting state reads (#3668): the host's account of a DAW that is not answering, and since when it has not been.
describe("the session's DAW choice and offSince", () => {
  it('reads the choice and starts the off clock when the DAW is not answering', async () => {
    const dawChoice = vi.fn(async () => choice('starting'));
    const session = createDawSession(host(() => OFF, dawChoice));
    session.start();
    await settle();
    expect(session.getState().choice?.state).toBe('starting');
    expect(session.getState().offSince).not.toBeNull();
    session.stop();
  });

  it('does not ask the host while the DAW answers, and forgets the choice and the clock when it comes up', async () => {
    let caps = OFF;
    const dawChoice = vi.fn(async () => choice('linked'));
    const session = createDawSession(host(() => caps, dawChoice));
    session.start();
    await settle();
    expect(session.getState().choice).toBeDefined();
    caps = ON;
    await session.refreshCapabilities();
    await settle();
    expect(session.getState().choice).toBeUndefined();
    expect(session.getState().offSince).toBeNull();
    const reads = dawChoice.mock.calls.length;
    await session.refreshCapabilities();
    await settle();
    expect(dawChoice.mock.calls.length).toBe(reads);
    session.stop();
  });

  it("keeps the first off time across reports and starts it again when the project's DAW changes while off", async () => {
    let answer = choice('linked');
    const session = createDawSession(
      host(
        () => OFF,
        async () => answer,
      ),
    );
    session.start();
    await settle();
    const first = session.getState().offSince;
    await new Promise((resolve) => setTimeout(resolve, 5));
    await session.refreshCapabilities();
    await settle();
    expect(session.getState().offSince).toBe(first);
    answer = { ...choice('linked'), linkedFile: 'Other.rpp' } as unknown as DawChoice;
    await session.refreshCapabilities();
    await settle();
    expect(session.getState().offSince).toBeGreaterThan(first as number);
    session.stop();
  });

  it('asks once more when a report arrives while a read is out, so the host\'s "starting" is not missed', async () => {
    const answers: Array<(value: DawChoice) => void> = [];
    const dawChoice = vi.fn(() => new Promise<DawChoice>((resolve) => answers.push(resolve)));
    const session = createDawSession(host(() => OFF, dawChoice));
    session.start();
    await settle();
    expect(dawChoice).toHaveBeenCalledTimes(1);
    await session.refreshCapabilities();
    await settle();
    answers[0]?.(choice('linked'));
    await settle();
    expect(dawChoice).toHaveBeenCalledTimes(2);
    answers[1]?.(choice('starting'));
    await settle();
    expect(session.getState().choice?.state).toBe('starting');
    session.stop();
  });

  it('is null when the host cannot say, and an answer that comes after the DAW did is dropped', async () => {
    const failing = createDawSession(
      host(
        () => OFF,
        async () => Promise.reject(new Error('no')),
      ),
    );
    failing.start();
    await settle();
    expect(failing.getState().choice).toBeNull();
    failing.stop();

    let late: (value: DawChoice) => void = () => undefined;
    let caps = OFF;
    const session = createDawSession(
      host(
        () => caps,
        () => new Promise<DawChoice>((resolve) => (late = resolve)),
      ),
    );
    session.start();
    await settle();
    caps = ON;
    await session.refreshCapabilities();
    await settle();
    late(choice('starting'));
    await settle();
    expect(session.getState().choice).toBeUndefined();
    session.stop();
  });
});
