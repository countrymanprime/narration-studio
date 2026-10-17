// @vitest-environment jsdom
import { act, cleanup, render, renderHook, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../../api/ApiContext';
import type { DawCapabilities, DawProjectState, DawTransport } from '../../../api/contracts/daw';
import { createMockApi } from '../../../api/mockApi';
import { DAW_SETUPS } from '../../../fixtures/daw';
import type { DawClient } from '../../../ports/daw';
import { PortOverrides } from '../../../ports/usePort';
import type { NarrationApi } from '../../../types';
import { apiWithTracks, dawClientFor } from './fixtures';
import { RecordSetup } from './RecordSetup';
import { recordSetupFor } from './recordSetupModel';
import { POLL_MS, stoppedInDaw, TAKE_TOPIC, useRecordControl, forgetAppTake } from './useRecordControl';

// The Booth records with the app's own recorder through the DAW port. These drive the control over a port whose answers the test
// controls, one cell of the state matrix at a time (definition-of-done, rule 3). The host's side is bindings_booth_record_test.go.

beforeEach(() => forgetAppTake());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const BUILTIN = DAW_SETUPS.builtin;
const withoutRecord = (reason: 'experimental_off' | 'turned_off'): DawCapabilities => ({
  ...BUILTIN,
  capabilities: {
    ...BUILTIN.capabilities,
    record: {
      level: 'experimental',
      available: false,
      reason,
      message: reason === 'turned_off' ? 'Turned off in Settings.' : 'Experimental: switched off in Settings.',
    },
  },
});
const projectState = (playState: DawProjectState['playState']): DawProjectState => ({ savedAt: null, unsavedChanges: false, playState, playPosition: 0 });

function live(initial: DawCapabilities, overrides: Partial<DawClient> = {}) {
  let onTransport: (next: DawTransport) => void = () => {};
  let state = projectState('stopped');
  const client: DawClient = {
    ...dawClientFor('builtin'),
    capabilities: async () => initial,
    projectState: async () => state,
    subscribeTransport: (listener) => ((onTransport = listener), () => {}),
    ...overrides,
  };
  return { client, transport: (next: DawTransport) => onTransport(next), setState: (next: DawProjectState) => (state = next) };
}

function hook(initial: DawCapabilities, api: NarrationApi = createMockApi(), overrides: Partial<DawClient> = {}) {
  const port = live(initial, overrides);
  const notify = vi.fn();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <ApiProvider api={api}>
      <PortOverrides clients={{ daw: port.client }}>{children}</PortOverrides>
    </ApiProvider>
  );
  return { ...port, notify, ...renderHook(() => useRecordControl({ chapterId: 'c1', notify }), { wrapper }) };
}

describe('Record with the built-in recorder', () => {
  it('needs no track: a chapter the DAW would refuse for having none can be recorded', async () => {
    const api = apiWithTracks({ c1: 'none' });
    const { result } = hook(BUILTIN, api);
    await waitFor(() => expect(result.current.capabilities).not.toBeNull());
    expect(result.current.disabled).toBe(false);
    expect(result.current.reason).toBe('');
  });

  it("says the capability's own sentence while Experimental is off, and is ready once Record is turned on", async () => {
    const { result } = hook(withoutRecord('experimental_off'));
    await waitFor(() => expect(result.current.disabled).toBe(true));
    expect(result.current.reason).toBe('Experimental: switched off in Settings.');
    expect(recordSetupFor(withoutRecord('experimental_off'), { dawFileLinked: false, launcherPath: '' })).toEqual({
      kind: 'turn-on',
      dawName: 'the built-in recorder',
      inApp: true,
    });
  });

  it("offers a one-click turn-on in the recorder's own words, with no talk of a DAW setup or a track", async () => {
    const saveSettings = vi.fn(async (..._args: unknown[]) => createMockApi().bootstrap());
    render(
      <ApiProvider api={createMockApi({ saveSettings })}>
        <RecordSetup
          capabilities={withoutRecord('experimental_off')}
          facts={{ dawFileLinked: false, launcherPath: '' }}
          say={vi.fn()}
          onSettings={vi.fn()}
          onChanged={vi.fn()}
        />
      </ApiProvider>,
    );
    expect(screen.getByRole('heading', { name: 'Recording in the built-in recorder is experimental' })).toBeTruthy();
    expect(screen.getByText(/saved in the project's Recordings folder/)).toBeTruthy();
    expect(screen.queryByText(/chapter's own track/)).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Turn on Record' }));
    await waitFor(() => expect(saveSettings).toHaveBeenCalledWith('DAW', 'global', { 'capability.record': 'on' }));
  });

  it("shows the host's refusal of a start (no microphone, a blocked device) and records nothing", async () => {
    const recordStart = vi.fn(async () => ({ ok: false, changed: false, message: 'No microphone found.', undoSteps: 0, refused: 'No microphone found.' }));
    const { result } = hook(BUILTIN, createMockApi(), { recordStart });
    await waitFor(() => expect(result.current.disabled).toBe(false));
    await act(() => result.current.toggle());
    expect(result.current.recording).toBe(false);
    expect(result.current.reason).toBe('No microphone found.');
  });

  it('a host call that fails says so and the take is not claimed', async () => {
    const { result } = hook(BUILTIN, createMockApi(), {
      recordStart: async () => {
        throw new Error('the host went away');
      },
    });
    await waitFor(() => expect(result.current.disabled).toBe(false));
    await act(() => result.current.toggle());
    expect(result.current.recording).toBe(false);
    expect(result.current.reason).toMatch(/^Record did not start: the host went away/);
  });

  it('rapid double-fire starts one take', async () => {
    const recordStart = vi.fn(async () => ({ ok: true, changed: true, message: '', undoSteps: 0 }));
    const { result } = hook(BUILTIN, createMockApi(), { recordStart });
    await waitFor(() => expect(result.current.disabled).toBe(false));
    await act(async () => {
      await Promise.all([result.current.toggle(), result.current.toggle()]);
    });
    expect(recordStart).toHaveBeenCalledTimes(1);
    expect(result.current.recording).toBe(true);
  });

  it("a take that ends by itself (the microphone unplugged) is said with the recorder's reason, and Record is ready again", async () => {
    const api = createMockApi({}, { recording: { engine: 'builtin', lastTakeFailed: true } });
    const { result, transport, notify } = hook(BUILTIN, api);
    await waitFor(() => expect(result.current.disabled).toBe(false));
    await act(() => result.current.toggle());
    act(() => transport({ playing: false, recording: true }));
    act(() => transport({ playing: false, recording: false }));
    await waitFor(() => expect(result.current.recording).toBe(false));
    await waitFor(() => expect(notify).toHaveBeenCalled());
    const [sentence, topic] = notify.mock.calls[0];
    expect(topic).toBe(TAKE_TOPIC);
    expect(sentence).toBe(stoppedInDaw('Built-in', 'Analogue 1 + 2 (Focusrite USB Audio) stopped delivering audio'));
    expect(sentence).toMatch(/stopped delivering audio\. The take ended and the audio before it is kept in the project's Recordings folder/);
    expect(result.current.disabled).toBe(false);
  });

  it('a take that ends by itself is still said when the recorder cannot be asked why', async () => {
    const api = createMockApi({ recorderState: async () => Promise.reject(new Error('gone')) } as Partial<NarrationApi>);
    const { result, transport, notify } = hook(BUILTIN, api);
    await waitFor(() => expect(result.current.disabled).toBe(false));
    await act(() => result.current.toggle());
    act(() => transport({ playing: false, recording: true }));
    act(() => transport({ playing: false, recording: false }));
    await waitFor(() => expect(notify).toHaveBeenCalledWith(stoppedInDaw('Built-in'), TAKE_TOPIC));
  });

  it('a window that reloads mid-take takes the take back: it is the app\'s own, not "already recording elsewhere"', async () => {
    const port = live(BUILTIN);
    port.setState(projectState('recording'));
    const notify = vi.fn();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <ApiProvider api={createMockApi()}>
        <PortOverrides clients={{ daw: port.client }}>{children}</PortOverrides>
      </ApiProvider>
    );
    const { result } = renderHook(() => useRecordControl({ chapterId: 'c1', notify }), { wrapper });
    await waitFor(() => expect(result.current.recording).toBe(true));
    expect(result.current.reason).toBe('');
  });

  it('a take this window stopped is not taken back by a project state that still says recording', async () => {
    const port = live(BUILTIN);
    port.setState(projectState('recording'));
    const notify = vi.fn();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <ApiProvider api={createMockApi()}>
        <PortOverrides clients={{ daw: port.client }}>{children}</PortOverrides>
      </ApiProvider>
    );
    const { result } = renderHook(() => useRecordControl({ chapterId: 'c1', notify }), { wrapper });
    // Opened mid-take: the take is taken back, and Stop ends it.
    await waitFor(() => expect(result.current.recording).toBe(true));
    await act(() => result.current.toggle());
    expect(result.current.recording).toBe(false);
    port.setState(projectState('recording'));
    act(() => window.dispatchEvent(new Event('focus')));
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.recording).toBe(false);
    expect(result.current.reason).toBe('');
  });

  it('the transport push a deliberate Stop causes is not a take that ended by itself', async () => {
    let push: (t: DawTransport) => void = () => {};
    const { result, notify, transport } = hook(BUILTIN, createMockApi(), {
      recordStop: async () => {
        push({ playing: false, recording: false });
        return { ok: true, changed: true, message: '', undoSteps: 0 };
      },
    });
    push = transport;
    await waitFor(() => expect(result.current.disabled).toBe(false));
    await act(() => result.current.toggle());
    act(() => transport({ playing: false, recording: true }));
    await act(() => result.current.toggle());
    expect(result.current.recording).toBe(false);
    expect(notify).not.toHaveBeenCalled();
  });

  it('a refused Stop ("not recording") ends the take here instead of leaving Stop up', async () => {
    const { result } = hook(BUILTIN, createMockApi(), {
      recordStop: async () => ({
        ok: false,
        changed: false,
        message: 'not recording',
        undoSteps: 0,
        refused: 'The built-in recorder is not recording, so nothing was stopped.',
      }),
    });
    await waitFor(() => expect(result.current.disabled).toBe(false));
    await act(() => result.current.toggle());
    await act(() => result.current.toggle());
    expect(result.current.recording).toBe(false);
    expect(result.current.reason).toMatch(/not recording/);
  });

  it('keeps the take while the host says it is recording, however long it runs', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { result, setState } = hook(BUILTIN);
    await waitFor(() => expect(result.current.disabled).toBe(false));
    await act(() => result.current.toggle());
    setState(projectState('recording'));
    await act(() => vi.advanceTimersByTimeAsync(POLL_MS * 5 + 100));
    expect(result.current.recording).toBe(true);
  });

  it('a recorder that goes quiet during a take never claims the take is still running', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { result, notify } = hook(BUILTIN, createMockApi(), {
      projectState: async () => {
        throw new Error('the host did not answer');
      },
    });
    await waitFor(() => expect(result.current.disabled).toBe(false));
    await act(() => result.current.toggle());
    await act(() => vi.advanceTimersByTimeAsync(POLL_MS * 3 + 100));
    expect(notify).toHaveBeenCalledWith(expect.stringMatching(/^Can't tell whether the built-in recorder is still recording/));
  });
});
