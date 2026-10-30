// @vitest-environment jsdom
import userEvent from '@testing-library/user-event';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../../api/ApiContext';
import type { WorkspaceProjectFxResult } from '../../../api/contracts/workspace';
import { createMockApi } from '../../../api/mockApi';
import { howToAdd, NO_PROJECT_FX, ProjectFx, projectFxRows, READING_PROJECT_FX } from './ProjectFx';
import { useProjectFx } from './useProjectFx';

// #2251 item 36: the Effects tab lists the FX on the linked DAW's tracks and master track, so a narrator whose REAPER is full of
// plug-ins no longer sees an empty tab.

const CHAIN: WorkspaceProjectFxResult = {
  tracks: [
    {
      trackGuid: '{T1}',
      name: 'Chapter One',
      fx: [
        { name: 'ReaEQ (Cockos)', enabled: true },
        { name: 'ReaComp (Cockos)', enabled: false },
      ],
    },
    { trackGuid: '{T2}', name: '', fx: [] },
  ],
  master: [{ name: 'ReaLimit (Cockos)', enabled: true }],
  total: 3,
};

function Harness() {
  return <ProjectFx state={useProjectFx()} dawName="REAPER" />;
}

const mount = (answer: () => Promise<WorkspaceProjectFxResult>) => {
  const api = { ...createMockApi(), workspaceProjectFx: answer };
  return render(
    <ApiProvider api={api}>
      <Harness />
    </ApiProvider>,
  );
};

const section = () => screen.getByRole('region', { name: 'FX in REAPER' });

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('projectFxRows', () => {
  it('lists each track in the DAW order and then the master, and names an unnamed track', () => {
    expect(projectFxRows(CHAIN).map((row) => `${row.where}/${row.slot.name}`)).toEqual([
      'Chapter One/ReaEQ (Cockos)',
      'Chapter One/ReaComp (Cockos)',
      'Master/ReaLimit (Cockos)',
    ]);
    expect(projectFxRows({ ...CHAIN, tracks: [{ trackGuid: '{T2}', name: '', fx: [{ name: 'ReaFir', enabled: true }] }] })[0].where).toBe('Unnamed track');
  });
});

describe('the FX in the DAW now', () => {
  it('lists every plug-in with where it sits and whether it is on, and says how to add one to words', async () => {
    mount(async () => CHAIN);
    await waitFor(() => expect(within(section()).getByText('ReaEQ (Cockos)')).toBeTruthy());
    const rows = within(section()).getAllByRole('row');
    expect(rows).toHaveLength(4); // the header and three plug-ins
    expect(within(rows[1]).getByText('Chapter One')).toBeTruthy();
    expect(within(rows[2]).getByText('Off')).toBeTruthy();
    expect(within(rows[3]).getByText('Master')).toBeTruthy();
    // The how-to is behind a "?", not drawn under the table.
    expect(within(section()).queryByText(howToAdd('REAPER'))).toBeNull();
    await userEvent.setup().click(within(section()).getByRole('button', { name: 'How to add an effect to words' }));
    expect(await screen.findByText(howToAdd('REAPER'))).toBeTruthy();
    expect(within(section()).getByText(/Read from REAPER at/)).toBeTruthy();
  });
  it('says the project has none when the DAW answers an empty chain', async () => {
    mount(async () => ({ tracks: [], master: [], total: 0 }));
    await waitFor(() => expect(within(section()).getByText(`REAPER ${NO_PROJECT_FX}`)).toBeTruthy());
  });
  it('says what failed and shows no list when the DAW cannot be read', async () => {
    mount(async () => {
      throw new Error('REAPER is not connected to this app');
    });
    await waitFor(() => expect(within(section()).getByRole('alert').textContent).toContain('REAPER is not connected to this app'));
    expect(within(section()).queryByRole('table')).toBeNull();
  });
  it('reads again on Check again and when the window is focused', async () => {
    let reads = 0;
    mount(async () => {
      reads += 1;
      return CHAIN;
    });
    await waitFor(() => expect(reads).toBe(1));
    fireEvent.click(within(section()).getByRole('button', { name: 'Check again' }));
    await waitFor(() => expect(reads).toBe(2));
    act(() => window.dispatchEvent(new Event('focus')));
    await waitFor(() => expect(reads).toBe(3));
  });
  it('says it is reading before the DAW answers', async () => {
    let answer: (chain: WorkspaceProjectFxResult) => void = () => {};
    mount(() => new Promise<WorkspaceProjectFxResult>((resolve) => (answer = resolve)));
    expect(within(section()).getByText(READING_PROJECT_FX)).toBeTruthy();
    await act(async () => {
      await Promise.resolve(); // the session's read has reached the host
      answer(CHAIN);
    });
    await waitFor(() => expect(within(section()).queryByText(READING_PROJECT_FX)).toBeNull());
  });
});
