// @vitest-environment jsdom
import { act, cleanup, render, renderHook, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../../api/ApiContext';
import type { DawCapabilities, DawTransport } from '../../../api/contracts/daw';
import { createMockApi } from '../../../api/mockApi';
import { DAW_SETUPS } from '../../../fixtures/daw';
import { PortOverrides } from '../../../ports/usePort';
import type { DawClient } from '../../../ports/daw';
import type { NarrationApi } from '../../../types';
import { dawClientFor } from './fixtures';
import { REAPER_LAUNCHER_ACTION as LAUNCHER_ACTION } from '../../engine/dawConnectGuide';
import { RecordSetup } from './RecordSetup';
import { recordSetupFor } from './recordSetup';
import { stoppedInDaw, useRecordControl } from './useRecordControl';

afterEach(cleanup);

const LAUNCHER = 'C:\\Users\\n\\AppData\\Local\\narration-utils\\runtime\\abc\\reaper\\NarrationUtils_Launcher.lua';
const LINKED = { dawFileLinked: true, launcherPath: LAUNCHER };

/** REAPER's setup with record refused for `reason`, everything else as the connected setup. */
function recordRefused(reason: 'experimental_off' | 'turned_off' | 'standalone' | 'not_running', daw: DawCapabilities['daw'] = 'REAPER'): DawCapabilities {
  const base = DAW_SETUPS.reaper;
  return {
    ...base,
    daw,
    reachable: reason !== 'not_running' && reason !== 'standalone',
    capabilities: { ...base.capabilities, record: { level: 'experimental', available: false, reason, message: `refused: ${reason}` } },
  };
}

describe('recordSetupFor', () => {
  it('offers nothing while Record is available', () => {
    expect(recordSetupFor(DAW_SETUPS.reaper, LINKED)).toBeNull();
  });

  it('offers the one-click turn-on for the experimental switch and for record turned off', () => {
    expect(recordSetupFor(recordRefused('experimental_off'), LINKED)).toEqual({ kind: 'turn-on', dawName: 'REAPER' });
    expect(recordSetupFor(recordRefused('turned_off'), LINKED)).toMatchObject({ kind: 'turn-on' });
  });

  it('offers the REAPER connection steps when no bridge is connected, also on a launch with no DAW', () => {
    expect(recordSetupFor(recordRefused('standalone'), LINKED)).toMatchObject({
      kind: 'connect',
      notAnswering: false,
      linked: true,
      launcherPath: LAUNCHER,
      guide: { dawName: 'REAPER' },
    });
    expect(recordSetupFor(recordRefused('standalone', 'none'), { dawFileLinked: false, launcherPath: '' })).toMatchObject({ kind: 'connect', linked: false });
    expect(recordSetupFor(recordRefused('not_running'), LINKED)).toMatchObject({ kind: 'connect', notAnswering: true });
  });

  it('offers no REAPER steps to another DAW, nor for a refusal the narrator cannot fix here', () => {
    expect(recordSetupFor(recordRefused('standalone', 'Audacity'), LINKED)).toBeNull();
    const unsupported = {
      ...DAW_SETUPS.reaper,
      capabilities: { ...DAW_SETUPS.reaper.capabilities, record: { level: 'unsupported' as const, available: false, reason: 'unsupported' as const } },
    };
    expect(recordSetupFor(unsupported, LINKED)).toBeNull();
  });
});

function mount(capabilities: DawCapabilities, facts = LINKED, overrides: Partial<NarrationApi> = {}) {
  const api = createMockApi(overrides);
  const say = vi.fn();
  const onSettings = vi.fn();
  const onChanged = vi.fn();
  render(
    <ApiProvider api={api}>
      <RecordSetup capabilities={capabilities} facts={facts} say={say} onSettings={onSettings} onChanged={onChanged} />
    </ApiProvider>,
  );
  return { say, onSettings, onChanged };
}

describe('RecordSetup when the app turns the launch away', () => {
  /** A mock api whose attach event the test sends by hand, as the host does when REAPER hands its project to a busy app. */
  function mountWithAttach() {
    let send: (state: { attached: boolean; reason?: string }) => void = () => {};
    const api = createMockApi({
      subscribeProjectAttach: (listener: (state: { attached: boolean; reason?: string }) => void) => ((send = listener), () => {}),
    } as Partial<NarrationApi>);
    render(
      <ApiProvider api={api}>
        <RecordSetup capabilities={recordRefused('standalone')} facts={LINKED} say={vi.fn()} onSettings={vi.fn()} onChanged={vi.fn()} onCheckAgain={vi.fn()} />
      </ApiProvider>,
    );
    return (state: { attached: boolean; reason?: string }) => act(() => send(state));
  }

  it('says the project was turned away and what to do, until it is taken or the narrator checks again', async () => {
    const attach = mountWithAttach();
    expect(screen.queryByRole('alert')).toBeNull();
    attach({ attached: false, reason: 'Narration Studio is busy, so the current project was left unchanged.' });
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('Narration Studio is busy');
    expect(alert.textContent).toContain('Finish or cancel what is running, then press Open in REAPER and connect again.');
    attach({ attached: true });
    expect(screen.queryByRole('alert')).toBeNull();
    attach({ attached: false, reason: 'busy again' });
    expect(screen.getByRole('alert')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Check again' }));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('a refusal with no reason says nothing it cannot back', () => {
    const attach = mountWithAttach();
    attach({ attached: false });
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('RecordSetup', () => {
  it('turn-on-saves-only-records-own-toggle-and-says-so', async () => {
    const saveSettings = vi.fn(async () => createMockApi().bootstrap());
    const { say, onChanged } = mount(recordRefused('experimental_off'), LINKED, { saveSettings } as Partial<NarrationApi>);
    expect(screen.getByRole('heading', { name: 'Recording in REAPER is experimental' })).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Turn on Record' }));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(saveSettings).toHaveBeenCalledWith('DAW', 'global', { 'capability.record': 'on' });
    expect(say.mock.calls[0][0]).toMatch(/^Record in REAPER is on\./);
  });

  it('turn-on-says-why-when-the-save-fails', async () => {
    const saveSettings = vi.fn(async () => {
      throw new Error('settings are read-only');
    });
    const { say, onChanged } = mount(recordRefused('experimental_off'), LINKED, { saveSettings } as Partial<NarrationApi>);
    await userEvent.click(screen.getByRole('button', { name: 'Turn on Record' }));
    await waitFor(() => expect(say).toHaveBeenCalled());
    expect(say.mock.calls[0]).toEqual([expect.stringMatching(/^Record could not be turned on: .*read-only/), 'error']);
    expect(onChanged).not.toHaveBeenCalled();
  });

  it('connect-lists-the-launcher-steps-with-the-path-to-copy', async () => {
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const { say } = mount(recordRefused('standalone'));
    expect(screen.getByRole('heading', { name: 'Connect REAPER to record' })).toBeTruthy();
    const steps = screen.getAllByRole('listitem').map((item) => item.textContent ?? '');
    expect(steps).toHaveLength(2);
    expect(steps[0]).toContain('Load ReaScript');
    expect(steps[0]).toContain(LAUNCHER);
    expect(steps[1]).toContain(LAUNCHER_ACTION);
    await userEvent.click(screen.getByRole('button', { name: 'Copy path' }));
    expect(writeText).toHaveBeenCalledWith(LAUNCHER);
    await waitFor(() => expect(say).toHaveBeenCalledWith('Launcher file path copied.'));
  });

  it('connect-starts-with-linking-the-project-when-none-is-linked-and-cannot-open-reaper-yet', async () => {
    const { onSettings } = mount(recordRefused('standalone', 'none'), { dawFileLinked: false, launcherPath: LAUNCHER });
    const steps = screen.getAllByRole('listitem');
    expect(steps).toHaveLength(3);
    expect(steps[0].textContent).toContain('.rpp');
    await userEvent.click(screen.getByRole('button', { name: 'Link in Settings' }));
    expect(onSettings).toHaveBeenCalled();
    expect((screen.getByRole('button', { name: 'Open in REAPER and connect' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('open-and-connect-turns-on-the-launcher-start-then-launches-reaper', async () => {
    const order: string[] = [];
    const saveSettings = vi.fn(async (...args: unknown[]) => {
      order.push(`save ${JSON.stringify(args)}`);
      return createMockApi().bootstrap();
    });
    const launchDaw = vi.fn(async () => {
      order.push('launch');
      return { launched: true, path: 'C:\\Program Files\\REAPER (x64)\\reaper.exe', source: 'registry' };
    });
    const { say, onChanged } = mount(recordRefused('not_running'), LINKED, { saveSettings, launchDaw } as Partial<NarrationApi>);
    expect(screen.getByRole('heading', { name: 'REAPER is not answering' })).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Open in REAPER and connect' }));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(order).toEqual([`save ${JSON.stringify(['DAW', 'global', { auto_start_launcher: 'true' }])}`, 'launch']);
    expect(say.mock.calls[0][0]).toMatch(/^REAPER is starting/);
  });

  it('open-and-connect-says-why-reaper-did-not-start', async () => {
    const launchDaw = vi.fn(async () => {
      throw new Error('REAPER was not found');
    });
    const { say } = mount(recordRefused('standalone'), LINKED, { launchDaw } as Partial<NarrationApi>);
    await userEvent.click(screen.getByRole('button', { name: 'Open in REAPER and connect' }));
    await waitFor(() => expect(say).toHaveBeenCalled());
    expect(say.mock.calls[0]).toEqual([expect.stringMatching(/^REAPER could not be started: .*not found/), 'error']);
  });

  it('draws nothing while Record is available', () => {
    mount(DAW_SETUPS.reaper);
    expect(screen.queryByRole('heading')).toBeNull();
  });
});

describe('useRecordControl follows the DAW live', () => {
  /** The DAW client of the connected setup whose capability and transport events the test sends by hand. */
  function liveClient(initial: DawCapabilities) {
    let onCapabilities: (next: DawCapabilities) => void = () => {};
    let onTransport: (next: DawTransport) => void = () => {};
    const client: DawClient = {
      ...dawClientFor('reaper'),
      capabilities: async () => initial,
      subscribeCapabilities: (listener) => ((onCapabilities = listener), () => {}),
      subscribeTransport: (listener) => ((onTransport = listener), () => {}),
    };
    return { client, capabilities: (next: DawCapabilities) => onCapabilities(next), transport: (next: DawTransport) => onTransport(next) };
  }

  function hook(initial: DawCapabilities) {
    const live = liveClient(initial);
    const notify = vi.fn();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <ApiProvider api={createMockApi()}>
        <PortOverrides clients={{ daw: live.client }}>{children}</PortOverrides>
      </ApiProvider>
    );
    const view = renderHook(() => useRecordControl({ chapterId: 'c1', notify }), { wrapper });
    return { ...live, notify, ...view };
  }

  it('record-turned-on-while-the-booth-is-open-enables-record', async () => {
    const { result, capabilities } = hook(recordRefused('experimental_off'));
    await waitFor(() => expect(result.current.disabled).toBe(true));
    act(() => capabilities(DAW_SETUPS.reaper));
    await waitFor(() => expect(result.current.disabled).toBe(false));
  });

  it('a-take-stopped-in-the-daw-ends-here-only-after-the-daw-was-heard-recording', async () => {
    const { result, transport, notify } = hook(DAW_SETUPS.reaper);
    await waitFor(() => expect(result.current.disabled).toBe(false));
    await act(() => result.current.toggle());
    expect(result.current.recording).toBe(true);
    // The stopped state from before the take, heard first, is not its end.
    act(() => transport({ playing: false, recording: false }));
    expect(result.current.recording).toBe(true);
    act(() => transport({ playing: true, recording: true, position: 3 }));
    act(() => transport({ playing: false, recording: false }));
    await waitFor(() => expect(result.current.recording).toBe(false));
    expect(notify).toHaveBeenCalledWith(stoppedInDaw('REAPER'));
  });
});

describe('RecordSetup says what it waits for and when it last looked', () => {
  function mountChecked(capabilities: DawCapabilities, extra: Partial<React.ComponentProps<typeof RecordSetup>> = {}) {
    const onCheckAgain = vi.fn();
    render(
      <ApiProvider api={createMockApi()}>
        <RecordSetup
          capabilities={capabilities}
          facts={LINKED}
          say={vi.fn()}
          onSettings={vi.fn()}
          onChanged={vi.fn()}
          checkedAt={Date.now() - 7000}
          onCheckAgain={onCheckAgain}
          {...extra}
        />
      </ApiProvider>,
    );
    return { onCheckAgain };
  }

  it('connect-names-what-it-waits-for-and-the-last-check-and-offers-check-again', async () => {
    const { onCheckAgain } = mountChecked(recordRefused('standalone'));
    expect(screen.getByText(/Waiting for REAPER to connect/)).toBeTruthy();
    expect(screen.getByText(/Last checked \d+ s ago/)).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Check again' }));
    expect(onCheckAgain).toHaveBeenCalledTimes(1);
  });

  it('the-ticking-last-checked-time-is-not-in-a-live-region-a-screen-reader-would-repeat-every-second', () => {
    mountChecked(recordRefused('standalone'));
    const ticking = screen.getByText(/Last checked \d+ s ago/);
    expect(ticking.closest('[aria-live],[role="status"],[role="alert"]')).toBeNull();
    expect(screen.getByRole('status').textContent).toMatch(/Waiting for REAPER to connect/);
    expect(screen.getByRole('status').textContent).not.toMatch(/\d+ s ago/);
  });

  it('not-answering-says-the-heartbeat-went-quiet', () => {
    mountChecked(recordRefused('not_running'));
    expect(screen.getByText(/Waiting for REAPER to answer/)).toBeTruthy();
  });

  it('says-so-when-it-has-not-checked-yet', () => {
    mountChecked(recordRefused('standalone'), { checkedAt: null });
    expect(screen.getByText(/Not checked yet/)).toBeTruthy();
  });

  it('a-quiet-read-says-it-cannot-tell-instead-of-the-last-answer', () => {
    mountChecked(recordRefused('standalone'), { readFailed: true });
    expect(screen.getByText(/Can.t tell whether REAPER is connected/)).toBeTruthy();
  });

  it('does-not-claim-the-project-is-unlinked-when-the-link-state-could-not-be-read', () => {
    mountChecked(recordRefused('standalone'), { facts: { dawFileLinked: false, launcherPath: '' }, factsFailed: true });
    expect(screen.queryByRole('button', { name: 'Link in Settings' })).toBeNull();
    expect(screen.getByText(/Could not read whether a project file is linked/)).toBeTruthy();
  });

  it('turn-on-also-offers-check-again', () => {
    mountChecked(recordRefused('experimental_off'));
    expect(screen.getByRole('button', { name: 'Check again' })).toBeTruthy();
  });
});
