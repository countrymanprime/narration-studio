// @vitest-environment jsdom
// The state matrix for the output a voice sample plays on (phase 7), the player's side of the approved mock's section 4. Each cell names its test.
//
//   no choice (the system default)        'plays at once, with no output call, when none was chosen'
//   a choice                              'a chosen output is applied before the sample plays'
//   a choice, again                       'the same choice is applied once, not on every play'
//   changed                               'a changed choice is applied on the next play', 'going back to the default is applied too'
//   saved device gone / refused           'a device that cannot be used plays on the default and says why, each time it is tried'
//   rapid double-fire during the apply    'a second press while the output is applied starts one sample'
//   stopped during the apply              'a sample stopped while the output is applied never starts'
//   leave mid-action, reload, DAW         not tested: the player holds no state the host keeps; nothing here talks to a DAW
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const setOutput = vi.fn();
vi.mock('./audioOutputs', () => ({ setOutput: (...args: unknown[]) => setOutput(...args) }));

type Store = typeof import('./samplePlayerStore');
let store: Store;
const setSampleOutput: Store['setSampleOutput'] = (label) => store.setSampleOutput(label);
const samplePlayerState: Store['samplePlayerState'] = () => store.samplePlayerState();
const stopSample: Store['stopSample'] = () => store.stopSample();
const playSample: Store['playSample'] = (id, options) => store.playSample(id, options);

const order: string[] = [];
const instances: FakeAudio[] = [];
/** The one Audio the player made in this test. */
const last = (): FakeAudio => instances[instances.length - 1]!;
class FakeAudio extends EventTarget {
  currentTime = 0;
  duration = Number.NaN;
  src = '';
  play = vi.fn(() => (order.push('play'), Promise.resolve()));
  pause = vi.fn();
  removeAttribute = vi.fn();
  constructor() {
    super();
    instances.push(this);
  }
}

let report: ReturnType<typeof vi.fn>;
const start = (id = 'a'.repeat(32)) => playSample(id, { by: Symbol('page'), url: `/media?sample=${id}`, report: report as never });
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(async () => {
  // The player is one module with one Audio; each test gets its own, so what an earlier test applied is not applied already.
  vi.resetModules();
  store = await import('./samplePlayerStore');
  order.length = 0;
  instances.length = 0;
  vi.stubGlobal('Audio', FakeAudio);
  report = vi.fn();
  setOutput.mockReset();
  setOutput.mockImplementation(async () => (order.push('setOutput'), { ok: true }));
});
afterEach(() => {
  stopSample();
  vi.unstubAllGlobals();
});

describe('the output a sample plays on', () => {
  it('plays at once, with no output call, when none was chosen', () => {
    start();
    expect(setOutput).not.toHaveBeenCalled();
    expect(last().play).toHaveBeenCalledTimes(1);
    expect(samplePlayerState().status).toBe('loading');
  });

  it('a chosen output is applied before the sample plays', async () => {
    setSampleOutput('Headphones');
    start();
    expect(last().play).not.toHaveBeenCalled();
    expect(samplePlayerState().status).toBe('loading');
    await settle();
    expect(setOutput).toHaveBeenCalledWith(last(), 'Headphones');
    expect(order).toEqual(['setOutput', 'play']);
  });

  it('the same choice is applied once, not on every play', async () => {
    setSampleOutput('Headphones');
    start();
    await settle();
    start('b'.repeat(32));
    await settle();
    expect(setOutput).toHaveBeenCalledTimes(1);
    expect(last().play).toHaveBeenCalledTimes(2);
  });

  it('a changed choice is applied on the next play', async () => {
    setSampleOutput('Headphones');
    start();
    await settle();
    setSampleOutput('Speakers');
    start();
    await settle();
    expect(setOutput.mock.calls.map((c) => c[1])).toEqual(['Headphones', 'Speakers']);
  });

  it('going back to the default is applied too', async () => {
    setSampleOutput('Headphones');
    start();
    await settle();
    setSampleOutput('');
    start();
    await settle();
    expect(setOutput.mock.calls.map((c) => c[1])).toEqual(['Headphones', '']);
  });

  it('a device that cannot be used plays on the default and says why, each time it is tried', async () => {
    setOutput.mockImplementation(
      async () => (order.push('setOutput'), { ok: false, message: 'Headphones is not connected. Voice samples play on the system default until it is back.' }),
    );
    setSampleOutput('Headphones');
    start();
    await settle();
    expect(last().play).toHaveBeenCalledTimes(1);
    expect(report).toHaveBeenCalledWith('Headphones is not connected. Voice samples play on the system default until it is back.');
    start();
    await settle();
    expect(setOutput).toHaveBeenCalledTimes(2);
    expect(report).toHaveBeenCalledTimes(2);
  });

  it('a second press while the output is applied starts one sample', async () => {
    setSampleOutput('Headphones');
    start();
    start();
    await settle();
    expect(last().play).toHaveBeenCalledTimes(1);
  });

  it('a sample stopped while the output is applied never starts', async () => {
    setSampleOutput('Headphones');
    start();
    stopSample();
    await settle();
    expect(last().play).not.toHaveBeenCalled();
    expect(samplePlayerState().status).toBe('idle');
  });
});
