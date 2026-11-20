// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../api/ApiContext';
import type { DawChoice } from '../../api/contracts/daw';
import { createMockApi } from '../../api/mockApi';
import { DAW_SETUPS } from '../../fixtures/daw';
import type { NarrationApi } from '../../types';
import { useDawConnecting } from './useDawConnecting';

afterEach(cleanup);

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

function Probe({ graceMs }: { graceMs: number }) {
  const connecting = useDawConnecting(true, graceMs);
  return <p>{connecting.connecting ? connecting.label('REAPER') : 'asks now'}</p>;
}

function mount(api: Partial<NarrationApi>, graceMs: number) {
  render(
    <ApiProvider api={createMockApi({ dawCapabilities: async () => structuredClone(DAW_SETUPS['reaper-off']), ...api })}>
      <Probe graceMs={graceMs} />
    </ApiProvider>,
  );
}

// The one "connecting" state (#3668): the host says it is starting the DAW, or the DAW has not been off for the grace yet.
describe('useDawConnecting', () => {
  it('says "Starting" for as long as the host reports its own start, whatever the grace', async () => {
    mount({ dawChoice: async () => choice({ state: 'starting', starting: { since: new Date().toISOString() } }) }, 1);
    expect(await screen.findByText('Starting REAPER…')).toBeTruthy();
    await act(async () => new Promise((resolve) => setTimeout(resolve, 300)));
    expect(screen.getByText('Starting REAPER…')).toBeTruthy();
  });

  it('says "Connecting" for the grace after the DAW stopped answering, counted from then and not from app start, then asks', async () => {
    mount({ dawChoice: async () => choice({}) }, 400);
    expect(await screen.findByText('Connecting to REAPER…')).toBeTruthy();
    await waitFor(() => expect(screen.getByText('asks now')).toBeTruthy(), { timeout: 3000 });
  });

  it('asks at once with no grace when the host is not starting anything', async () => {
    mount({ dawChoice: async () => choice({}) }, 0);
    expect(await screen.findByText('asks now')).toBeTruthy();
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
