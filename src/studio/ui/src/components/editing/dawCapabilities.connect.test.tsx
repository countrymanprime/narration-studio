// @vitest-environment jsdom
// Audit cluster 18 (docs/research/ui-function-audit.md): the Editing page's DAW gates read one live capability report. Mounted while the DAW is
// not running, then the DAW starts (a `daw_capabilities_changed` event): every gate turns on together, with no remount.
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ApiProvider } from '../../api/ApiContext';
import type { DawCapabilities } from '../../api/contracts/daw';
import { createMockApi } from '../../api/mockApi';
import { DAW_SETUPS } from '../../fixtures/daw';
import { useDawCapabilities } from '../../hooks/useDawCapabilities';
import { createMockDawClient, type DawClient } from '../../ports/daw';
import { PortOverrides } from '../../ports/usePort';
import { useBackupsOffered } from './drawer/useDrawer';
import { useCleanupDeps } from './cleanup/useCleanupDeps';
import { useTakesGate } from './takes/useTakesGate';

afterEach(cleanup);

const REAPER: DawCapabilities = DAW_SETUPS.reaper;
const OFF: DawCapabilities = {
  ...REAPER,
  reachable: false,
  capabilities: Object.fromEntries(
    Object.entries(REAPER.capabilities).map(([key, value]) => [key, { ...value, available: false, message: 'REAPER is not running.' }]),
  ) as DawCapabilities['capabilities'],
};

/** A DAW client whose report this test owns and can push, as the host's `daw_capabilities_changed` does. */
function liveDaw() {
  let current = OFF;
  const listeners = new Set<(next: DawCapabilities) => void>();
  const base = createMockDawClient(REAPER);
  const client: DawClient = {
    ...base,
    capabilities: async () => current,
    subscribeCapabilities: (onUpdate) => (listeners.add(onUpdate), () => listeners.delete(onUpdate)),
  };
  return {
    client,
    push: (next: DawCapabilities) => {
      current = next;
      listeners.forEach((listener) => listener(next));
    },
  };
}

describe('the Editing DAW gates follow one live report', () => {
  it('turn on together when the DAW starts after the page opened', async () => {
    const daw = liveDaw();
    function Gates() {
      const takes = useTakesGate();
      const backups = useBackupsOffered();
      const cleanup = useCleanupDeps({ cuts: [], onCuts: () => {} });
      const { caps } = useDawCapabilities();
      return (
        <>
          <output data-testid="takes">{takes.ok ? 'on' : takes.reason}</output>
          <output data-testid="backups">{String(backups)}</output>
          <output data-testid="cleanup">{cleanup?.reduce ? 'on' : 'off'}</output>
          <output data-testid="reachable">{String(caps?.reachable)}</output>
        </>
      );
    }
    render(
      <ApiProvider api={createMockApi()}>
        <PortOverrides clients={{ daw: daw.client }}>
          <Gates />
        </PortOverrides>
      </ApiProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('reachable').textContent).toBe('false'));
    expect(screen.getByTestId('takes').textContent).toBe('REAPER is not running.');
    expect(screen.getByTestId('cleanup').textContent).toBe('off');

    act(() => daw.push(REAPER));
    expect(screen.getByTestId('reachable').textContent).toBe('true');
    expect(screen.getByTestId('takes').textContent).toBe('on');
    expect(screen.getByTestId('backups').textContent).toBe('true');
    expect(screen.getByTestId('cleanup').textContent).toBe('on');
  });
});
