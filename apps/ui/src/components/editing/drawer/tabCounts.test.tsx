// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../../api/ApiContext';
import type { DawBackup } from '../../../api/contracts/daw';
import { createMockApi } from '../../../api/mockApi';
import { DAW_SETUPS } from '../../../fixtures/daw';
import { createMockDawClient } from '../../../ports/daw';
import { PortOverrides } from '../../../ports/usePort';
import { notifyCleanupChanged } from '../cleanup/cleanupChanged';
import { FINDINGS } from '../cleanup/cleanupFixtures';
import { proposalTotal, useTabCounts } from './useTabCounts';

afterEach(cleanup);

function Probe({ backups }: { backups: boolean }) {
  const c = useTabCounts('5', backups);
  return <p data-testid="c">{`${c.proposals}/${c.backups}`}</p>;
}

const backup = (id: string, chapterId: string): DawBackup => ({ id, chapterId }) as DawBackup;
const mount = (backups: boolean, findings = FINDINGS, kept: DawBackup[] = []) => {
  const daw = { ...createMockDawClient(DAW_SETUPS.reaper), backups: vi.fn(async () => kept) };
  const api = { ...createMockApi(), findingsList: vi.fn(async () => ({ findings, total: findings.length })), editingCandidates: vi.fn(async () => []) };
  render(
    <ApiProvider api={api}>
      <PortOverrides clients={{ daw }}>
        <Probe backups={backups} />
      </PortOverrides>
    </ApiProvider>,
  );
  return { daw, api };
};

describe('the counts the drawer tabs wear', () => {
  it('counts the proposals the Clean up tab lists at its starting thresholds', () => {
    expect(proposalTotal([])).toBe(0);
    expect(proposalTotal(FINDINGS)).toBeGreaterThan(0);
  });
  it('reads the proposals and only this chapter’s backups', async () => {
    mount(true, FINDINGS, [backup('a', '5'), backup('b', '6'), backup('c', '5')]);
    await waitFor(() => expect(screen.getByTestId('c').textContent).toBe(`${proposalTotal(FINDINGS)}/2`));
  });
  it('does not ask the DAW for backups where it keeps none', async () => {
    const { daw } = mount(false);
    await waitFor(() => expect(screen.getByTestId('c').textContent).toBe(`${proposalTotal(FINDINGS)}/0`));
    expect(daw.backups).not.toHaveBeenCalled();
  });
  it('reads the findings again when the Clean up tab applied a change', async () => {
    const { api } = mount(false);
    await waitFor(() => expect(api.findingsList).toHaveBeenCalledTimes(1));
    notifyCleanupChanged();
    await waitFor(() => expect(api.findingsList).toHaveBeenCalledTimes(2));
  });
});
