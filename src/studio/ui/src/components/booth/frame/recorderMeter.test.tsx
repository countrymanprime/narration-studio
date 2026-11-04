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
// `recording:level` stream drawn on the menu's one Input meter, stopped when the menu closes, the Booth unmounts, the page goes, the window
// loses focus or Record starts. The meter's aria value is the RMS, rounded (LevelMeter); with no reading yet it is hidden from screen
// readers and the line under it says why.

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
function fakeRecorder({
  manual = false,
  devices = ['USB Mic', 'Focusrite'],
  phase = 'idle',
}: { manual?: boolean; devices?: string[]; phase?: RecorderState['phase'] } = {}) {
  const calls: string[] = [];
  const pending: Answer[] = [];
  const listeners = new Set<(level: RecorderLevel) => void>();
  const states = new Set<(state: RecorderState) => void>();
  const answer = (name: string): Promise<RecorderState> => {
    calls.push(name);
    if (!manual) return Promise.resolve(IDLE());
    return new Promise<RecorderState>((resolve, reject) => pending.push({ resolve: () => resolve(IDLE()), reject }));
  };
  const api: Partial<NarrationApi> = {
    recorderDevices: async () => ({ devices: devices.map((name) => ({ name })), error: null }),
    recorderState: async () => ({ ...IDLE(), phase }),
    subscribeRecorderState: (onState) => {
      states.add(onState);
      return () => states.delete(onState);
    },
    recorderMeterStart: (device: string) => answer(`start:${device}`),
    recorderMeterStop: () => answer('stop'),
    subscribeRecorderLevel: (onLevel) => {
      listeners.add(onLevel);
      return () => listeners.delete(onLevel);
    },
  };
  return {
    api,
    calls,
    pending,
    listeners,
    states,
    emit: (level: RecorderLevel) => act(() => listeners.forEach((fn) => fn(level))),
    say: (next: RecorderState['phase']) => act(() => states.forEach((fn) => fn({ ...IDLE(), phase: next }))),
  };
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
const meter = () => within(popup()).getByRole('meter', { name: 'Input level' });
const drawnMeters = () => within(popup()).getAllByRole('meter', { name: 'Input level' });
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
    expect(drawnMeters()).toHaveLength(1);
    await settle();
    expect(recorder.calls).toEqual([]);
  });

  it('a project with no recorder at all (no DAW) shows no built-in meter and starts nothing', async () => {
    const recorder = fakeRecorder();
    const { open } = booth(recorder.api, { recorderMeter: false });
    await open();
    expect(drawnMeters()).toHaveLength(1);
    await settle();
    expect(recorder.calls).toEqual([]);
  });

  it('opening the menu starts the meter on the chosen microphone, and a level event moves the meter', async () => {
    const recorder = fakeRecorder();
    const { open } = booth(recorder.api);
    await open();
    await waitFor(() => expect(recorder.calls).toEqual(['start:USB Mic']));
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

  it('a refusal says the meter did not start, gives its reason as an error toast, and shows no reading', async () => {
    const toast = vi.spyOn(overlay, 'toast');
    const recorder = fakeRecorder();
    recorder.api.recorderMeterStart = async () => {
      throw new Error('a take is recording; its level shows in the Booth');
    };
    const { open } = booth(recorder.api);
    await open();
    expect(await within(popup()).findByText('The meter did not start.')).toBeTruthy();
    expect(toast).toHaveBeenCalledWith('a take is recording; its level shows in the Booth', expect.objectContaining({ tone: 'error' }));
    expect(within(popup()).queryByRole('meter', { name: 'Input level' })).toBeNull();
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
    const toast = vi.spyOn(overlay, 'toast');
    expect(within(popup()).getByText('Opening the microphone…')).toBeTruthy();
    await act(async () => void (await vi.advanceTimersByTimeAsync(METER_WAIT_MS + 100)));
    expect(within(popup()).getByText('The meter did not start.')).toBeTruthy();
    expect(toast).toHaveBeenCalledWith('The built-in recorder did not answer in 15 s.', expect.objectContaining({ tone: 'error' }));
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
      const recorder = fakeRecorder({ manual: true, devices: [name] });
      const { open, unmount } = booth(recorder.api, { device: name });
      await open();
      await waitFor(() => expect(recorder.calls).toEqual([`start:${name}`]));
      // The line under the meter never names the device, so a long name cannot make the menu taller.
      expect(within(popup()).getByText('Opening the microphone…')).toBeTruthy();
      unmount();
      cleanup();
    }
  });

  // Walkthrough 1: the menu showed two live meters both named "Input level" (the teleprompter's and the recorder's) that disagreed.
  it('shows one input meter with the built-in recorder, the recorder’s own level', async () => {
    const recorder = fakeRecorder();
    const { open } = booth(recorder.api);
    await open();
    await waitFor(() => expect(recorder.calls).toEqual(['start:USB Mic']));
    recorder.emit({ peak: -9, rms: -20 });
    await waitFor(() => expect(meter().getAttribute('aria-valuenow')).toBe('-20'));
    expect(drawnMeters()).toHaveLength(1);
  });

  // Walkthrough 3 / qa 6: the picker said "No microphone found" while the meter started on the teleprompter's microphone.
  it('starts nothing on a microphone the recorder does not list, and says none is found', async () => {
    const recorder = fakeRecorder({ devices: [] });
    const { open } = booth(recorder.api);
    await open();
    expect(await within(popup()).findByText('No microphone found')).toBeTruthy();
    await settle();
    expect(recorder.calls).toEqual([]);
  });

  it('starts nothing on a chosen microphone the recorder no longer lists', async () => {
    const recorder = fakeRecorder({ devices: ['Focusrite'] });
    const { open } = booth(recorder.api);
    await open();
    expect(await within(popup()).findByText('No microphone chosen.')).toBeTruthy();
    await settle();
    expect(recorder.calls).toEqual([]);
  });

  // Walkthrough 4: while the start was on its way the meter read "silent", like a dead microphone.
  it('while the start is on its way, says it is opening the microphone and gives no silent reading', async () => {
    const recorder = fakeRecorder({ manual: true });
    const { open } = booth(recorder.api);
    await open();
    await waitFor(() => expect(recorder.calls).toEqual(['start:USB Mic']));
    expect(within(popup()).getByText('Opening the microphone…')).toBeTruthy();
    expect(within(popup()).queryByRole('meter', { name: 'Input level' })).toBeNull();
    expect(within(popup()).getByTestId('input-meter').className).toContain('opacity-50');
  });

  // qa 1: the Booth loaded while a take recorded (it did not know of the take) and the menu asked for a meter against it.
  it('starts no meter while the host reports a take recording, shows the take’s level, and starts one once the take ends', async () => {
    const recorder = fakeRecorder({ phase: 'recording' });
    const { open } = booth(recorder.api);
    await open();
    recorder.emit({ peak: -11, rms: -22 });
    await waitFor(() => expect(meter().getAttribute('aria-valuenow')).toBe('-22'));
    await settle();
    expect(recorder.calls).toEqual([]);
    recorder.say('idle');
    await waitFor(() => expect(recorder.calls).toEqual(['start:USB Mic']));
  });

  // qa 2: a refused or timed-out meter could only be retried by closing and reopening the menu.
  it('a refused meter offers Check again, which asks the host once more', async () => {
    const recorder = fakeRecorder();
    let refuse = true;
    const start = recorder.api.recorderMeterStart!;
    recorder.api.recorderMeterStart = (device: string) => (refuse ? Promise.reject(new Error('USB Mic is in use by another program')) : start(device));
    const { open } = booth(recorder.api);
    await open();
    expect(await within(popup()).findByText('The meter did not start.')).toBeTruthy();
    refuse = false;
    await userEvent.click(within(popup()).getByRole('button', { name: 'Check again' }));
    await waitFor(() => expect(recorder.calls).toEqual(['start:USB Mic']));
    expect(within(popup()).queryByText('The meter did not start.')).toBeNull();
    expect(within(popup()).queryByRole('button', { name: 'Check again' })).toBeNull();
  });

  // qa 3: reloading with the menu open sent no stop, so the microphone could stay open.
  it('the page going away with a meter running stops it once', async () => {
    const recorder = fakeRecorder();
    const { open } = booth(recorder.api);
    await open();
    await waitFor(() => expect(recorder.calls).toEqual(['start:USB Mic']));
    fireEvent(window, new Event('pagehide'));
    await settle();
    await waitFor(() => expect(recorder.calls).toEqual(['start:USB Mic', 'stop']));
    await settle();
    expect(recorder.calls).toEqual(['start:USB Mic', 'stop']);
  });

  // qa 5: in the background the meter decayed to empty with nothing said.
  it('says the meter is paused while the window is in the background', async () => {
    const recorder = fakeRecorder();
    const { open } = booth(recorder.api);
    await open();
    await waitFor(() => expect(recorder.calls).toEqual(['start:USB Mic']));
    fireEvent.blur(window);
    expect(await within(popup()).findByText('Paused while the app is in the background.')).toBeTruthy();
    fireEvent.focus(window);
    await waitFor(() => expect(within(popup()).queryByText('Paused while the app is in the background.')).toBeNull());
  });

  // ux-reviewer: a refusal that wrapped made the menu taller, so the popover jumped. Every state's line is one fixed line.
  it('keeps every sentence on one fixed line under the meter, the reading shown as the held peak', async () => {
    const recorder = fakeRecorder();
    const { open } = booth(recorder.api);
    await open();
    await waitFor(() => expect(recorder.calls).toEqual(['start:USB Mic']));
    recorder.emit({ peak: -14.2, rms: -24.6 });
    const line = within(popup()).getByTestId('input-line');
    await waitFor(() => expect(line.textContent).toContain('Peak −14.2 dB'));
    expect(line.className).toContain('h-7');
    expect(line.className).toContain('whitespace-nowrap');
  });

  it('runs against the mock recorder: a steady level while the menu is open, none after it closes', async () => {
    const mock = createRecordingMock({ engine: 'builtin' });
    const { open, close } = booth(
      {
        recorderMeterStart: mock.recorderMeterStart,
        recorderMeterStop: mock.recorderMeterStop,
        subscribeRecorderLevel: mock.subscribeRecorderLevel,
        recorderDevices: mock.recorderDevices,
        recorderState: mock.recorderState,
        subscribeRecorderState: mock.subscribeRecorderState,
      },
      { device: 'Analogue 1 + 2 (Focusrite USB Audio)' },
    );
    await open();
    await waitFor(() => expect(meter().getAttribute('aria-valuenow')).toBe('-25'));
    await close();
    await waitFor(async () => expect((await mock.recorderState()).phase).toBe('idle'));
  });
});
