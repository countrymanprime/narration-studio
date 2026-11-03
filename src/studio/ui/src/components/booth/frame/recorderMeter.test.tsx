// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../../api/ApiContext';
import type { RecorderLevel, RecorderState } from '../../../api/contracts/recording';
import { createMockApi } from '../../../api/mockApi';
import { createRecordingMock } from '../../../api/recordingMock';
import { defaultKeymap } from '../../../input/keymap';
import { overlay } from '../../../overlay/overlayService';
import type { NarrationApi } from '../../../types';
import { BoothFooter } from './BoothFooter';
import { METER_WAIT_MS } from './recorderMeter';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// The built-in recorder's own meter in the Levels menu (#2732, #2734, #2735): started on the chosen microphone when the menu opens, its
// `recording:level` stream drawn on the shared meter under the microphone picker, stopped when the menu closes, the Booth unmounts, the
// window loses focus or Record starts. The meter's aria value is the RMS, rounded (LevelMeter).

const IDLE = (): RecorderState => ({
  hasProject: true,
  engine: 'builtin',
  support: { level: 'experimental', available: true },
  phase: 'idle',
  device: '',
  folder: '',
  take: null,
  startedAt: null,
  message: '',
  last: null,
  takes: [],
});

type Answer = { resolve: () => void; reject: (reason: Error) => void };

/** A host recorder whose start and stop answer when the test says (`manual`) or at once, and whose level stream the test drives. */
function fakeRecorder({ manual = false }: { manual?: boolean } = {}) {
  const calls: string[] = [];
  const pending: Answer[] = [];
  const listeners = new Set<(level: RecorderLevel) => void>();
  const answer = (name: string): Promise<RecorderState> => {
    calls.push(name);
    if (!manual) return Promise.resolve(IDLE());
    return new Promise<RecorderState>((resolve, reject) => pending.push({ resolve: () => resolve(IDLE()), reject }));
  };
  const api: Partial<NarrationApi> = {
    recorderDevices: async () => ({ devices: [{ name: 'USB Mic' }, { name: 'Focusrite' }], error: null }),
    recorderMeterStart: (device: string) => answer(`start:${device}`),
    recorderMeterStop: () => answer('stop'),
    subscribeRecorderLevel: (onLevel) => {
      listeners.add(onLevel);
      return () => listeners.delete(onLevel);
    },
  };
  return { api, calls, pending, listeners, emit: (level: RecorderLevel) => act(() => listeners.forEach((fn) => fn(level))) };
}

const NO_DAW_METERS = { level: 'unsupported', available: false, reason: 'unsupported', message: 'Not available with the built-in recorder.' } as const;

function booth(overrides: Partial<NarrationApi>, { device = 'USB Mic', recording = false, recorderMeter = true } = {}) {
  const api = createMockApi(overrides);
  const footer = (props: { device?: string; recording?: boolean }) => (
    <ApiProvider api={api}>
      <BoothFooter
        record={<button>Record</button>}
        seconds={0}
        recording={props.recording ?? recording}
        mic={{
          engine: 'builtin',
          dawName: 'the built-in recorder',
          reachable: true,
          device: props.device ?? device,
          onDevice: vi.fn(),
          recorderMeter,
          levels: { monitor: undefined, input: undefined, meters: NO_DAW_METERS },
        }}
        roomTone="Room not measured yet"
        keymap={defaultKeymap()}
      />
    </ApiProvider>
  );
  const view = render(footer({}));
  return {
    open: () => userEvent.click(screen.getByRole('button', { name: 'Levels' })),
    close: () => userEvent.keyboard('{Escape}'),
    rerender: (props: { device?: string; recording?: boolean }) => view.rerender(footer(props)),
    unmount: view.unmount,
  };
}

const popup = () => screen.getByRole('dialog', { name: 'Levels' });
const meter = () => within(popup()).getByRole('meter', { name: 'Built-in recorder input level' });
const settle = () => act(async () => void (await Promise.resolve()));

describe("the built-in recorder's meter in the Levels menu", () => {
  it('with a DAW recording, shows no built-in meter and starts nothing', async () => {
    const recorder = fakeRecorder();
    const api = createMockApi(recorder.api);
    render(
      <ApiProvider api={api}>
        <BoothFooter
          record={<button>Record</button>}
          seconds={0}
          recording={false}
          mic={{ engine: 'daw', dawName: 'REAPER', reachable: true, device: 'USB Mic', onDevice: vi.fn() }}
          roomTone="Room not measured yet"
          keymap={defaultKeymap()}
        />
      </ApiProvider>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Levels' }));
    expect(within(popup()).queryByRole('meter', { name: /Built-in/ })).toBeNull();
    expect(recorder.calls).toEqual([]);
  });

  it('a project with no recorder at all (no DAW) shows no built-in meter and starts nothing', async () => {
    const recorder = fakeRecorder();
    const { open } = booth(recorder.api, { recorderMeter: false });
    await open();
    expect(within(popup()).queryByRole('meter', { name: /Built-in/ })).toBeNull();
    expect(recorder.calls).toEqual([]);
  });

  it('opening the menu starts the meter on the chosen microphone, and a level event moves the meter', async () => {
    const recorder = fakeRecorder();
    const { open } = booth(recorder.api);
    await open();
    await waitFor(() => expect(recorder.calls).toEqual(['start:USB Mic']));
    expect(meter().getAttribute('aria-valuetext')).toBe('silent');
    recorder.emit({ peak: -14.2, rms: -24.6 });
    await waitFor(() => expect(meter().getAttribute('aria-valuenow')).toBe('-25'));
  });

  it('does not also say the recorder has no levels of its own, which its meter now contradicts', async () => {
    const recorder = fakeRecorder();
    const { open } = booth(recorder.api);
    await open();
    expect(within(popup()).queryByText(/own input and output levels/)).toBeNull();
  });

  it('closing the menu stops the meter once and leaves no level subscription', async () => {
    const recorder = fakeRecorder();
    const { open, close } = booth(recorder.api);
    await open();
    await waitFor(() => expect(recorder.calls).toEqual(['start:USB Mic']));
    expect(recorder.listeners.size).toBe(1);
    await close();
    await waitFor(() => expect(recorder.calls).toEqual(['start:USB Mic', 'stop']));
    expect(recorder.listeners.size).toBe(0);
  });

  it('leaving the page stops the meter once and unsubscribes', async () => {
    const recorder = fakeRecorder();
    const { open, unmount } = booth(recorder.api);
    await open();
    await waitFor(() => expect(recorder.calls).toEqual(['start:USB Mic']));
    unmount();
    await waitFor(() => expect(recorder.calls).toEqual(['start:USB Mic', 'stop']));
    expect(recorder.listeners.size).toBe(0);
  });

  it('Record starting stops the meter once, and the take’s own level keeps the menu live', async () => {
    const recorder = fakeRecorder();
    const { open, rerender } = booth(recorder.api);
    await open();
    await waitFor(() => expect(recorder.calls).toEqual(['start:USB Mic']));
    rerender({ recording: true });
    await waitFor(() => expect(recorder.calls).toEqual(['start:USB Mic', 'stop']));
    recorder.emit({ peak: -9, rms: -20 });
    await waitFor(() => expect(meter().getAttribute('aria-valuenow')).toBe('-20'));
    await settle();
    expect(recorder.calls).toEqual(['start:USB Mic', 'stop']);
  });

  it('opening the menu mid-take starts no meter, shows the take’s level, and closing it stops nothing', async () => {
    const recorder = fakeRecorder();
    const { open, close } = booth(recorder.api, { recording: true });
    await open();
    expect(recorder.listeners.size).toBe(1);
    recorder.emit({ peak: -11, rms: -22 });
    await waitFor(() => expect(meter().getAttribute('aria-valuenow')).toBe('-22'));
    await close();
    await settle();
    expect(recorder.calls).toEqual([]);
    expect(recorder.listeners.size).toBe(0);
  });

  it('a refusal is the meter row’s sentence, and the meter stays silent', async () => {
    const recorder = fakeRecorder();
    recorder.api.recorderMeterStart = async () => {
      throw new Error('a take is recording; its level shows in the Booth');
    };
    const { open } = booth(recorder.api);
    await open();
    expect(await within(popup()).findByRole('alert')).toHaveProperty('textContent', 'a take is recording; its level shows in the Booth');
    expect(meter().getAttribute('aria-valuetext')).toBe('silent');
  });

  it('changing the microphone restarts the meter on the new one, with no stop between', async () => {
    const recorder = fakeRecorder();
    const { open, rerender } = booth(recorder.api);
    await open();
    await waitFor(() => expect(recorder.calls).toEqual(['start:USB Mic']));
    rerender({ device: 'Focusrite' });
    await waitFor(() => expect(recorder.calls).toEqual(['start:USB Mic', 'start:Focusrite']));
  });

  it('with no microphone chosen, says so and starts nothing', async () => {
    const recorder = fakeRecorder();
    const { open } = booth(recorder.api, { device: '' });
    await open();
    expect(await within(popup()).findByText('No microphone chosen.')).toBeTruthy();
    await settle();
    expect(recorder.calls).toEqual([]);
  });

  it('the window losing focus stops the meter; regaining it starts it again', async () => {
    const recorder = fakeRecorder();
    const { open } = booth(recorder.api);
    await open();
    await waitFor(() => expect(recorder.calls).toEqual(['start:USB Mic']));
    fireEvent.blur(window);
    await waitFor(() => expect(recorder.calls).toEqual(['start:USB Mic', 'stop']));
    expect(recorder.listeners.size).toBe(0);
    fireEvent.focus(window);
    await waitFor(() => expect(recorder.calls).toEqual(['start:USB Mic', 'stop', 'start:USB Mic']));
  });

  it('a rapid open and close pairs the start with one stop, sent only after the start answers', async () => {
    const recorder = fakeRecorder({ manual: true });
    const { open, close } = booth(recorder.api);
    await open();
    await waitFor(() => expect(recorder.calls).toEqual(['start:USB Mic']));
    await close();
    await settle();
    // One call at a time: the stop waits for the start, so the host never sees a stop overtaken by its start.
    expect(recorder.calls).toEqual(['start:USB Mic']);
    await act(async () => recorder.pending[0].resolve());
    await waitFor(() => expect(recorder.calls).toEqual(['start:USB Mic', 'stop']));
    await act(async () => recorder.pending[1].resolve());
    await settle();
    expect(recorder.calls).toEqual(['start:USB Mic', 'stop']);
  });

  it('a start still on its way when the menu closes and reopens is not lost: one start, no second', async () => {
    const recorder = fakeRecorder({ manual: true });
    const { open, close } = booth(recorder.api);
    await open();
    await waitFor(() => expect(recorder.calls).toEqual(['start:USB Mic']));
    await close();
    await open();
    await act(async () => recorder.pending[0].resolve());
    recorder.emit({ peak: -14, rms: -24 });
    await waitFor(() => expect(meter().getAttribute('aria-valuenow')).toBe('-24'));
    expect(recorder.calls).toEqual(['start:USB Mic']);
  });

  it('a refusal for a microphone the narrator has moved on from is not shown over the new one', async () => {
    const recorder = fakeRecorder({ manual: true });
    const { open, rerender } = booth(recorder.api);
    await open();
    await waitFor(() => expect(recorder.calls).toEqual(['start:USB Mic']));
    rerender({ device: 'Focusrite' });
    await act(async () => recorder.pending[0].reject(new Error('USB Mic is unplugged')));
    await waitFor(() => expect(recorder.calls).toEqual(['start:USB Mic', 'start:Focusrite']));
    expect(within(popup()).queryByText('USB Mic is unplugged')).toBeNull();
    await act(async () => recorder.pending[1].resolve());
    recorder.emit({ peak: -10, rms: -20 });
    await waitFor(() => expect(meter().getAttribute('aria-valuenow')).toBe('-20'));
  });

  it('a start that never answers frees the row after METER_WAIT_MS with a sentence, and closing still stops the meter', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const recorder = fakeRecorder({ manual: true });
    const { open, close } = booth(recorder.api);
    await open();
    await waitFor(() => expect(recorder.calls).toEqual(['start:USB Mic']));
    expect(within(popup()).getByText('Opening USB Mic…')).toBeTruthy();
    await act(async () => void (await vi.advanceTimersByTimeAsync(METER_WAIT_MS + 100)));
    expect(within(popup()).getByRole('alert').textContent).toBe('The built-in recorder did not answer in 15 s.');
    await close();
    await waitFor(() => expect(recorder.calls).toEqual(['start:USB Mic', 'stop']));
  });

  it('a stop the host refuses after the menu closed is told as a toast', async () => {
    const toast = vi.spyOn(overlay, 'toast');
    const recorder = fakeRecorder();
    recorder.api.recorderMeterStop = async () => {
      throw new Error('the capture device is busy');
    };
    const { open, close } = booth(recorder.api);
    await open();
    await waitFor(() => expect(recorder.calls).toEqual(['start:USB Mic']));
    await close();
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith("The built-in recorder's meter did not stop: the capture device is busy", expect.objectContaining({ tone: 'error' })),
    );
  });

  it('long, emoji and right-to-left microphone names are sent as they are and wrap in the row', async () => {
    for (const name of ['Микрофон 🎙️ Studio — '.repeat(6), 'ميكروفون الاستوديو 🎧']) {
      const recorder = fakeRecorder({ manual: true });
      const { open, unmount } = booth(recorder.api, { device: name });
      await open();
      await waitFor(() => expect(recorder.calls).toEqual([`start:${name}`]));
      const opening = within(popup()).getByText(`Opening ${name}…`);
      expect(opening.className).toContain('[overflow-wrap:anywhere]');
      unmount();
      cleanup();
    }
  });

  it('runs against the mock recorder: a steady level while the menu is open, none after it closes', async () => {
    const mock = createRecordingMock({ engine: 'builtin' });
    const { open, close } = booth({
      recorderMeterStart: mock.recorderMeterStart,
      recorderMeterStop: mock.recorderMeterStop,
      subscribeRecorderLevel: mock.subscribeRecorderLevel,
      recorderDevices: mock.recorderDevices,
    });
    await open();
    await waitFor(() => expect(meter().getAttribute('aria-valuenow')).toBe('-25'));
    await close();
    await waitFor(async () => expect((await mock.recorderState()).phase).toBe('idle'));
  });
});
