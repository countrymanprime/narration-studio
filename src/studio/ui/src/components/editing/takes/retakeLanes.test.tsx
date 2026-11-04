// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../../api/ApiContext';
import { createMockApi } from '../../../api/mockApi';
import { MOCK_LANE_ITEM } from '../../../api/mockFixtures';
import type { RetakeLanesList } from '../../../api/contracts/retakelanes';
import { overlay } from '../../../overlay/overlayService';
import { createJournal, type Journal } from '../../../studio/journal/createJournal';
import type { NarrationApi } from '../../../types';
import { TakeChip } from './TakeChip';
import { TakeLines } from './TakeLines';
import { measuredPassage } from './takeFixtures';
import type { LinePassage, TakesGate } from './types';
import { useRetakeLanes } from './useRetakeLanes';

const TRACK = 'Chapter 1';
const LINE = 'line-000004';
/** The line's lane group as the mock host lists it (MOCK_LANE_LINE): lane 1 plays, lane 2 is the item the takes read names, lane 3 is a third pass. */
const passage = (laneItems: readonly string[] = [MOCK_LANE_ITEM]): LinePassage => ({ ...measuredPassage(), laneItems });
const OPEN: TakesGate = { ok: true };

let journal: Journal;
let toast: ReturnType<typeof vi.spyOn>;
let toastUndo: ReturnType<typeof vi.spyOn>;

function Page({ line, gate = OPEN, enabled = true }: { line: LinePassage; gate?: TakesGate; enabled?: boolean }) {
  const lanes = useRetakeLanes(journal, enabled);
  const group = lanes.forLine(line);
  return (
    <main>
      <TakeChip passage={line} open keptId={null} onToggle={() => {}} />
      <TakeLines
        passage={line}
        onTake={null}
        keptId={null}
        playingId={null}
        gate={gate}
        onKeep={() => {}}
        onPlay={() => {}}
        lanes={group ? { line: group, gate, picking: lanes.picking, onPick: (retake) => void lanes.pick(line, group, retake) } : null}
      />
    </main>
  );
}

function renderPage(overrides: Partial<NarrationApi> = {}, initial: Parameters<typeof createMockApi>[1] = {}, props: Partial<Parameters<typeof Page>[0]> = {}) {
  const api = createMockApi(overrides, initial);
  render(
    <ApiProvider api={api}>
      <Page line={passage()} {...props} />
    </ApiProvider>,
  );
  return api;
}

const row = (lane: number) => screen.getByRole('button', { name: `Play this lane: lane ${lane} on ${TRACK}` });

beforeEach(() => {
  journal = createJournal({ dawName: () => 'REAPER', dawLastAction: async () => 'this' });
  toast = vi.spyOn(overlay, 'toast').mockImplementation(() => {});
  toastUndo = vi.spyOn(overlay, 'toastUndo').mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('retakes on lanes, in the takes list', () => {
  it('lists the lane rows under the takes, the lane that plays marked and its button off', async () => {
    renderPage();
    const group = await screen.findByRole('region', { name: `Retakes on lanes of ${TRACK}` });
    expect(group.querySelectorAll('li')).toHaveLength(3);
    expect(group.querySelector('[data-lane="1"]')?.textContent).toContain('Plays');
    expect(group.querySelector('[data-lane="2"]')?.textContent).not.toContain('Plays');
    expect(row(1).getAttribute('aria-disabled')).toBe('true');
    expect(row(2).getAttribute('aria-disabled')).not.toBe('true');
  });

  it('draws no lane group for a line whose retakes the lane list does not name, or when the project has no lane track', async () => {
    renderPage({}, {}, { line: passage(['{NOT-A-LISTED-ITEM}']) });
    await waitFor(() => expect(screen.getByRole('group', { name: /Takes of this line/ })).toBeTruthy());
    expect(screen.queryByRole('region', { name: /Retakes on lanes/ })).toBeNull();
    cleanup();
    renderPage({}, { retakeLanes: 'none' });
    await waitFor(() => expect(screen.getByRole('group', { name: /Takes of this line/ })).toBeTruthy());
    expect(screen.queryByRole('region', { name: /Retakes on lanes/ })).toBeNull();
  });

  it('reads nothing until the page asks', async () => {
    const list = vi.fn(async (): Promise<RetakeLanesList> => ({ lines: [], laneTracks: 0 }));
    renderPage({ retakeLanesList: list }, {}, { enabled: false });
    expect(list).not.toHaveBeenCalled();
  });

  it('picks by line id and item GUID, makes the lane play across the track, and offers one Undo that says which lanes went silent', async () => {
    const user = userEvent.setup();
    const api = renderPage();
    const pick = vi.spyOn(api, 'retakeLanesPick');
    await user.click(await screen.findByRole('button', { name: `Play this lane: lane 2 on ${TRACK}` }));
    expect(pick).toHaveBeenCalledWith(LINE, MOCK_LANE_ITEM);
    await waitFor(() => expect(toastUndo).toHaveBeenCalledTimes(1));
    expect(toastUndo.mock.calls[0][0]).toBe('Lane 2 plays on Chapter 1. Lanes 1 and 3 are silent everywhere on this track.');
    await waitFor(() => expect(screen.getByRole('region', { name: /Retakes on lanes/ }).querySelector('[data-lane="2"]')?.textContent).toContain('Plays'));
    expect(row(2).getAttribute('aria-disabled')).toBe('true');
    expect(row(1).getAttribute('aria-disabled')).not.toBe('true');
  });

  it('Undo picks the lane that played before, in one step', async () => {
    const user = userEvent.setup();
    const api = renderPage();
    const pick = vi.spyOn(api, 'retakeLanesPick');
    await user.click(await screen.findByRole('button', { name: `Play this lane: lane 3 on ${TRACK}` }));
    await waitFor(() => expect(toastUndo).toHaveBeenCalledTimes(1));
    const undo = toastUndo.mock.calls[0][1] as () => Promise<{ ok: boolean }>;
    expect((await undo()).ok).toBe(true);
    expect(pick).toHaveBeenLastCalledWith(LINE, '{MOCK-ITEM-0001-0000-0000-000000000001}');
    await waitFor(() => expect(screen.getByRole('region', { name: /Retakes on lanes/ }).querySelector('[data-lane="1"]')?.textContent).toContain('Plays'));
  });

  it('shows REAPER’s refusal as a toast in its own words and leaves the lanes as they were', async () => {
    const user = userEvent.setup();
    renderPage({}, { retakeLanes: 'error' });
    await user.click(await screen.findByRole('button', { name: `Play this lane: lane 2 on ${TRACK}` }));
    await waitFor(() => expect(toast).toHaveBeenCalled());
    expect(String(toast.mock.calls[0][0])).toContain('is not in fixed item lane mode');
    expect(toast.mock.calls[0][1]).toMatchObject({ tone: 'error' });
    expect(toastUndo).not.toHaveBeenCalled();
    expect(screen.getByRole('region', { name: /Retakes on lanes/ }).querySelector('[data-lane="1"]')?.textContent).toContain('Plays');
  });

  it('shows a pick the host refuses outright as a toast', async () => {
    const user = userEvent.setup();
    renderPage({ retakeLanesPick: () => Promise.reject(new Error('the REAPER bridge is unavailable')) });
    await user.click(await screen.findByRole('button', { name: `Play this lane: lane 3 on ${TRACK}` }));
    await waitFor(() => expect(toast).toHaveBeenCalled());
    expect(String(toast.mock.calls[0][0])).toContain('the REAPER bridge is unavailable');
    expect(toastUndo).not.toHaveBeenCalled();
  });

  it('turns the other lanes off while REAPER answers, and one pick at a time is made', async () => {
    const user = userEvent.setup();
    const api = renderPage();
    const pick = vi.spyOn(api, 'retakeLanesPick');
    await user.click(await screen.findByRole('button', { name: `Play this lane: lane 3 on ${TRACK}` }));
    expect(row(2).getAttribute('aria-disabled')).toBe('true');
    await user.click(row(2));
    expect(pick).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(toastUndo).toHaveBeenCalledTimes(1));
  });

  it('keeps the rows and says why the buttons are off when the DAW cannot be asked', async () => {
    renderPage({}, {}, { gate: { ok: false, reason: 'REAPER is not running.' } });
    await screen.findByRole('region', { name: /Retakes on lanes/ });
    expect(row(2).getAttribute('aria-disabled')).toBe('true');
  });

  it('draws a line with lanes and no take of its own: its chip names the lanes', async () => {
    renderPage({}, {}, { line: { ...passage(), takes: [] } });
    expect((await screen.findByRole('button', { name: /Retakes on lanes/ })).getAttribute('data-tchip')).toBe('ps-9');
  });

  it('shows a long, right-to-left or emoji item name whole', async () => {
    const odd: RetakeLanesList = {
      laneTracks: 1,
      lines: [
        {
          lineId: LINE,
          trackGuid: '{T}',
          trackName: TRACK,
          retakes: [
            { itemGuid: '{A}', name: 'ملف 🎙️ '.repeat(20), lane: 0, plays: true, position: 0, length: 6 },
            { itemGuid: MOCK_LANE_ITEM, name: '', lane: 1, plays: false, position: 0, length: 5 },
          ],
        },
      ],
    };
    renderPage({ retakeLanesList: async () => odd });
    const group = await screen.findByRole('region', { name: /Retakes on lanes/ });
    expect(group.textContent).toContain('🎙️');
    expect(group.textContent).toContain('Untitled item');
  });
});
