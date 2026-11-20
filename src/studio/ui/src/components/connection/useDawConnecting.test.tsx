// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../api/ApiContext';
import type { DawChoice } from '../../api/contracts/daw';
import { createMockApi } from '../../api/mockApi';
import { DAW_SETUPS } from '../../fixtures/daw';
import type { NarrationApi } from '../../types';
import { useDawConnecting, useReopenOnBridgeProblem } from './useDawConnecting';
import { resetOpenOnce } from './useOpenOnce';

afterEach(() => {
  cleanup();
  resetOpenOnce();
});

const choice = (patch: Record<string, unknown>) =>
  ({
    hasProject: true,
    daw: 'REAPER',
    source: 'linked',
    chosen: 'REAPER',
    state: 'linked',
    reachable: false,
    linkedFile: 'Alice.rpp',
    foundFiles: ['Alice.rpp'],
    launcherAutoStart: false,
    options: [],
    starting: null,
    bridge: null,
    ...patch,
  }) as unknown as DawChoice;

function Probe({ graceMs, off = true, unlinkedAsksNow = false }: { graceMs: number; off?: boolean; unlinkedAsksNow?: boolean }) {
  const connecting = useDawConnecting(off, graceMs, { askAtOnceWhenUnlinked: unlinkedAsksNow });
  return <p>{connecting.connecting ? connecting.label('REAPER') : 'asks now'}</p>;
}

function mount(api: Partial<NarrationApi>, graceMs: number, unlinkedAsksNow = false) {
  render(
    <ApiProvider api={createMockApi({ dawCapabilities: async () => structuredClone(DAW_SETUPS['reaper-off']), ...api })}>
      <Probe graceMs={graceMs} unlinkedAsksNow={unlinkedAsksNow} />
    </ApiProvider>,
  );
}

// The one "connecting" state (#3668): the host says it is starting the DAW, or the DAW has not been off for the grace yet.
describe('useDawConnecting', () => {
  it('says "Starting" for as long as the host reports its own start, whatever the grace', async () => {
    mount({ dawChoice: async () => choice({ state: 'starting', starting: { since: new Date().toISOString() } }) }, 150);
    expect(await screen.findByText('Starting REAPER…')).toBeTruthy();
    await act(async () => new Promise((resolve) => setTimeout(resolve, 500)));
    expect(screen.getByText('Starting REAPER…')).toBeTruthy();
  });

  it('says "Connecting" for the grace after the DAW stopped answering, counted from then and not from app start, then asks', async () => {
    mount({ dawChoice: async () => choice({}) }, 400);
    expect(await screen.findByText('Connecting to REAPER…')).toBeTruthy();
    await waitFor(() => expect(screen.getByText('asks now')).toBeTruthy(), { timeout: 3000 });
  });

  it("asks once after the host stops saying it is starting: starting, then not starting, then the dialog's moment", async () => {
    let answer = choice({ state: 'starting', starting: { since: new Date().toISOString() } });
    mount({ dawChoice: async () => answer }, 100);
    expect(await screen.findByText('Starting REAPER…')).toBeTruthy();
    answer = choice({ state: 'linked' });
    act(() => window.dispatchEvent(new Event('focus')));
    await waitFor(() => expect(screen.getByText('asks now')).toBeTruthy(), { timeout: 3000 });
  });

  it('asks at once for a project with no DAW file linked when the caller says so (the Booth), whatever the grace: nothing is being connected to', async () => {
    mount({ dawChoice: async () => choice({ state: 'not_linked', linkedFile: null }) }, 5_000, true);
    await waitFor(() => expect(screen.getByText('asks now')).toBeTruthy());
  });

  it('gives a project with no DAW file linked the grace on every other page, so a page does not load under a dialog', async () => {
    mount({ dawChoice: async () => choice({ state: 'not_linked', linkedFile: null }) }, 5_000);
    expect(await screen.findByText('Connecting to REAPER…')).toBeTruthy();
    await act(async () => new Promise((resolve) => setTimeout(resolve, 300)));
    expect(screen.getByText('Connecting to REAPER…')).toBeTruthy();
  });

  it("gives a DAW that goes off long after the page opened the whole grace and no more (the page's age is not part of it)", async () => {
    vi.useFakeTimers();
    try {
      let caps = structuredClone(DAW_SETUPS['reaper']);
      const api = createMockApi({ dawCapabilities: async () => caps, dawChoice: async () => choice({}) });
      render(
        <ApiProvider api={api}>
          <Probe graceMs={1_000} off />
        </ApiProvider>,
      );
      await act(async () => vi.advanceTimersByTimeAsync(60_000));
      caps = structuredClone(DAW_SETUPS['reaper-off']);
      await act(async () => {
        window.dispatchEvent(new Event('focus'));
        await vi.advanceTimersByTimeAsync(100);
      });
      expect(screen.getByText('Connecting to REAPER…')).toBeTruthy();
      await act(async () => vi.advanceTimersByTimeAsync(1_500));
      expect(screen.getByText('asks now')).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });

  it('asks at once with no grace when the host is not starting anything', async () => {
    mount({ dawChoice: async () => choice({}) }, 0);
    expect(await screen.findByText('asks now')).toBeTruthy();
  });

  it('does not hold the dialog back for ever when the host never answers: the grace ends it', async () => {
    mount({ dawChoice: () => new Promise<DawChoice>(() => undefined) }, 300);
    expect(await screen.findByText('Connecting to REAPER…')).toBeTruthy();
    await waitFor(() => expect(screen.getByText('asks now')).toBeTruthy(), { timeout: 3000 });
  });

  it('holds until the host has answered when there is a grace, and falls back to the clock when the host cannot say', async () => {
    const dawChoice = vi.fn(async (): Promise<DawChoice> => {
      throw new Error('host cannot say');
    });
    mount({ dawChoice }, 300);
    expect(await screen.findByText('Connecting to REAPER…')).toBeTruthy();
    await waitFor(() => expect(screen.getByText('asks now')).toBeTruthy(), { timeout: 3000 });
    expect(dawChoice).toHaveBeenCalled();
  });

  it('is not connecting while the DAW answers, and does not ask the host about it', async () => {
    const dawChoice = vi.fn(async () => choice({}));
    render(
      <ApiProvider api={createMockApi({ dawCapabilities: async () => structuredClone(DAW_SETUPS['reaper']), dawChoice })}>
        <ConnectedProbe />
      </ApiProvider>,
    );
    expect(await screen.findByText('asks now')).toBeTruthy();
    expect(dawChoice).not.toHaveBeenCalled();
  });
});

function ConnectedProbe() {
  const connecting = useDawConnecting(false, 10_000);
  return <p>{connecting.connecting ? 'connecting' : 'asks now'}</p>;
}

function Reopener({ reopen }: { reopen: () => void }) {
  useReopenOnBridgeProblem(reopen);
  return <p>reopener</p>;
}

describe('useReopenOnBridgeProblem', () => {
  it('asks again once when the host reports that a start went nowhere, and not for a host that reports none', async () => {
    const problem = 'The app opened REAPER, but REAPER’s bridge has not answered.';
    const reopen = vi.fn();
    const first = render(
      <ApiProvider
        api={createMockApi({
          dawCapabilities: async () => structuredClone(DAW_SETUPS['reaper-off']),
          dawChoice: async () => choice({ bridge: { installed: true, startsWithReaper: true, problem } }),
        })}
      >
        <Reopener reopen={reopen} />
      </ApiProvider>,
    );
    await waitFor(() => expect(reopen).toHaveBeenCalledTimes(1));
    first.unmount();
    const quiet = vi.fn();
    render(
      <ApiProvider api={createMockApi({ dawCapabilities: async () => structuredClone(DAW_SETUPS['reaper-off']), dawChoice: async () => choice({}) })}>
        <Reopener reopen={quiet} />
      </ApiProvider>,
    );
    await act(async () => new Promise((resolve) => setTimeout(resolve, 100)));
    expect(quiet).not.toHaveBeenCalled();
  });

  it('does not tell the narrator about the same problem again when another page mounts', async () => {
    const problem = 'The app opened REAPER, but REAPER’s bridge has not answered.';
    const api = createMockApi({
      dawCapabilities: async () => structuredClone(DAW_SETUPS['reaper-off']),
      dawChoice: async () => choice({ bridge: { installed: true, startsWithReaper: true, problem } }),
    });
    const reopen = vi.fn();
    const first = render(
      <ApiProvider api={api}>
        <Reopener reopen={reopen} />
      </ApiProvider>,
    );
    await waitFor(() => expect(reopen).toHaveBeenCalledTimes(1));
    first.unmount();
    // Another page: a new mount, the same standing problem.
    const second = vi.fn();
    render(
      <ApiProvider api={api}>
        <Reopener reopen={second} />
      </ApiProvider>,
    );
    await act(async () => new Promise((resolve) => setTimeout(resolve, 100)));
    expect(second).not.toHaveBeenCalled();
  });
});
