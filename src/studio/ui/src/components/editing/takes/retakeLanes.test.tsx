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
const LANE_LINE: RetakeLanesList['lines'][number] = {
  lineId: LINE,
  trackGuid: '{T}',
  trackName: TRACK,
  retakes: [
    { itemGuid: '{A}', name: 'a.wav', lane: 0, plays: true, position: 0, length: 6 },
    { itemGuid: MOCK_LANE_ITEM, name: 'b.wav', lane: 1, plays: false, position: 0, length: 5 },
  ],
};

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

  it('Undo works when the DAW cannot say what its last action was: it picks the lane again, it does not rewind REAPER’s history', async () => {
    journal = createJournal({ dawName: () => 'REAPER', dawLastAction: async () => 'other' });
    const user = userEvent.setup();
    const api = renderPage();
    const pick = vi.spyOn(api, 'retakeLanesPick');
    await user.click(await screen.findByRole('button', { name: `Play this lane: lane 2 on ${TRACK}` }));
    await waitFor(() => expect(toastUndo).toHaveBeenCalledTimes(1));
    const undo = toastUndo.mock.calls[0][1] as () => Promise<{ ok: boolean; refusal?: { reason: string } }>;
    const undone = await undo();
    expect(undone.ok).toBe(true);
    expect(pick).toHaveBeenLastCalledWith(LINE, '{MOCK-ITEM-0001-0000-0000-000000000001}');
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
    // REAPER has not answered yet: the pick started and no state event came.
    const pick = vi.fn(async () => ({ status: 'started' as const }));
    renderPage({ retakeLanesPick: pick });
    await user.click(await screen.findByRole('button', { name: `Play this lane: lane 3 on ${TRACK}` }));
    await waitFor(() => expect(row(2).getAttribute('aria-disabled')).toBe('true'));
    await user.click(row(2));
    expect(pick).toHaveBeenCalledTimes(1);
    expect(toastUndo).not.toHaveBeenCalled();
  });

  it('retrying a lane after REAPER refused it asks REAPER again and shows its new answer, even when the host replays the last state on subscribe', async () => {
    const user = userEvent.setup();
    const api = renderPage({}, { retakeLanes: 'error' });
    const pick = vi.spyOn(api, 'retakeLanesPick');
    await user.click(await screen.findByRole('button', { name: `Play this lane: lane 2 on ${TRACK}` }));
    await waitFor(() => expect(toast).toHaveBeenCalledTimes(1));
    await user.click(row(2));
    await waitFor(() => expect(toast).toHaveBeenCalledTimes(2));
    expect(pick).toHaveBeenCalledTimes(2);
    for (const call of toast.mock.calls) expect(String(call[0])).not.toMatch(/before initialization/);
  });

  it('re-reads the lane list after a pick that failed and when the window regains focus, so a late answer shows', async () => {
    const user = userEvent.setup();
    const list = vi.fn(async (): Promise<RetakeLanesList> => ({ lines: [LANE_LINE], laneTracks: 1 }));
    renderPage({ retakeLanesPick: () => Promise.reject(new Error('the REAPER bridge is unavailable')), retakeLanesList: list });
    await user.click(await screen.findByRole('button', { name: `Play this lane: lane 2 on ${TRACK}` }));
    await waitFor(() => expect(toast).toHaveBeenCalled());
    await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
    window.dispatchEvent(new Event('focus'));
    await waitFor(() => expect(list).toHaveBeenCalledTimes(3));
  });

  it('keeps a bidi or blank item name in its own run and calls a blank one Untitled', async () => {
    const odd: RetakeLanesList = {
      laneTracks: 1,
      lines: [
        {
          lineId: LINE,
          trackGuid: '{T}',
          trackName: TRACK,
          retakes: [
            { itemGuid: '{A}', name: 'שלום עולם', lane: 0, plays: true, position: 0, length: 6.2 },
            { itemGuid: MOCK_LANE_ITEM, name: '   ', lane: 1, plays: false, position: 0, length: 5 },
            { itemGuid: '{C}', name: '\u200b', lane: 2, plays: false, position: 0, length: 5 },
          ],
        },
      ],
    };
    renderPage({ retakeLanesList: async () => odd });
    const group = await screen.findByRole('region', { name: /Retakes on lanes/ });
    expect(group.querySelector('[data-lane="1"] bdi')?.textContent).toBe('שלום עולם');
    expect(group.querySelector('[data-lane="2"] bdi')?.textContent).toBe('Untitled item');
    expect(group.querySelector('[data-lane="3"] bdi')?.textContent).toBe('Untitled item');
  });

  it('names at most a few of the silent lanes in the message, however many lanes there are', async () => {
    const user = userEvent.setup();
    const many: RetakeLanesList = {
      laneTracks: 1,
      lines: [
        {
          lineId: LINE,
          trackGuid: '{T}',
          trackName: TRACK,
          retakes: Array.from({ length: 300 }, (_, lane) => ({
            itemGuid: lane === 1 ? MOCK_LANE_ITEM : `{L${lane}}`,
            name: `p${lane}.wav`,
            lane,
            plays: lane === 0,
            position: 0,
            length: 5,
          })),
        },
      ],
    };
    renderPage({ retakeLanesList: async () => many });
    await user.click(await screen.findByRole('button', { name: `Play this lane: lane 2 on ${TRACK}` }));
    await waitFor(() => expect(toastUndo).toHaveBeenCalledTimes(1));
    const text = String(toastUndo.mock.calls[0][0]);
    expect(text.length).toBeLessThan(200);
    expect(text).toMatch(/and 29\d more/);
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
