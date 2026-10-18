// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../api/ApiContext';
import { createMockApi } from '../../api/mockApi';
import { CommandRouter } from '../../input/router';
import { createJournal } from '../../studio/journal/createJournal';
import { StudioProvider } from '../../studio/StudioProvider';
import { OverlayHost } from '../../overlay/OverlayHost';
import { providedCommands } from '../../input/commandProviders';
import { contextItemsFor } from '../../registries/context';
import type { DawCapabilities } from '../../api/contracts/daw';
import type { Finding, NarrationApi } from '../../types';
import { TooltipProvider } from '../primitives/Tooltip';
import * as checkRecordings from '../recordingcheck/openCheckRecordings';
import { proofProgress } from './proof.selectors';
import { ProofPage } from './ProofPage';

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  vi.restoreAllMocks();
});

function Where() {
  const location = useLocation();
  return <p data-testid="where">{location.pathname + location.search}</p>;
}

/** The browser's Back, as a button the tests press. */
function Back() {
  const navigate = useNavigate();
  return (
    <button type="button" onClick={() => navigate(-1)}>
      history back
    </button>
  );
}

function renderPage({
  api = createMockApi(),
  at = '/proof',
  before = [],
  hasManuscript = true,
}: { api?: NarrationApi; at?: string; before?: string[]; hasManuscript?: boolean } = {}) {
  const handlers = { goTo: vi.fn(), goToScript: vi.fn(), goToBooth: vi.fn(), goToEditing: vi.fn() };
  const journal = createJournal({ dawName: () => 'REAPER', dawLastAction: async () => 'unknown' });
  window.localStorage.setItem('narration.proof.lastChapter./p', 'chapter-2');
  render(
    <MemoryRouter initialEntries={[...before, at]} initialIndex={before.length}>
      <ApiProvider api={api}>
        <StudioProvider journal={journal}>
          <CommandRouter>
            <TooltipProvider>
              <Routes>
                <Route path="/pickups" element={<p>The pickups page</p>} />
                <Route path="/proof" element={<ProofPage hasManuscript={hasManuscript} projectFolder="/p" {...handlers} />} />
              </Routes>
              <Where />
              <Back />
              <OverlayHost />
            </TooltipProvider>
          </CommandRouter>
        </StudioProvider>
      </ApiProvider>
    </MemoryRouter>,
  );
  return { api, journal, ...handlers };
}

const noteRows = async () => {
  const notes = await screen.findByRole('region', { name: 'Notes' });
  await waitFor(() => expect(notes.querySelectorAll('tr[data-row]').length).toBeGreaterThan(0));
  return [...notes.querySelectorAll<HTMLElement>('tr[data-row]')];
};
const where = () => screen.getByTestId('where').textContent;
const press = (key: string, code: string) => fireEvent.keyDown(document.body, { key, code });

describe('sort-asks-the-host', () => {
  it('asks the host for the sort through FindingsQuery', async () => {
    const api = createMockApi();
    const findingsList = vi.spyOn(api, 'findingsList');
    renderPage({ api });
    await noteRows();
    expect(findingsList).toHaveBeenLastCalledWith({ sort: 'time' });
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Sort notes' }), 'confidence');
    await waitFor(() => expect(findingsList).toHaveBeenLastCalledWith({ sort: 'confidence' }));
  });
});

describe('page-data-load-failure', () => {
  it('keeps the title, says the page could not be loaded and reloads on Retry', async () => {
    const api = createMockApi();
    vi.spyOn(api, 'findingsList').mockRejectedValueOnce(new Error('The findings file is unreadable.'));
    renderPage({ api });
    expect(await screen.findByText('This page could not be loaded')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Proof' })).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await noteRows();
    expect(screen.queryByText('This page could not be loaded')).toBeNull();
  });
});

describe('page-data-load-failure-chapters', () => {
  it('shows the load error when the chapters cannot be read', async () => {
    const api = createMockApi();
    vi.spyOn(api, 'manuscriptChapters').mockRejectedValue(new Error('The chapters are unreadable.'));
    renderPage({ api });
    expect(await screen.findByText('This page could not be loaded')).toBeTruthy();
  });
});

describe('the-head-and-open-pickups', () => {
  it('the head cannot read 100 while a pickup is open', async () => {
    const api = createMockApi();
    vi.spyOn(api, 'findingsSummary').mockResolvedValue({ ...(await api.findingsSummary()), total: 3, decided: 3, cleared: 3 });
    const list = await api.pickupsList();
    vi.spyOn(api, 'pickupsList').mockResolvedValue({ ...list, pickups: [{ ...list.pickups[0]!, findingId: undefined, done: false }] });
    renderPage({ api });
    await noteRows();
    await waitFor(() => expect(document.querySelector('[data-ring]')?.getAttribute('data-ring')).toBe('99'));
  });
});

describe('proof-route-draws-the-mock-page', () => {
  it('draws the head with the ring, the chapter strip, the notes queue and the key hints for all chapters', async () => {
    renderPage();
    await noteRows();
    expect(screen.getByRole('heading', { name: 'Proof' })).toBeTruthy();
    expect(screen.getByText(/cleared/)).toBeTruthy();
    expect(screen.getByText('Open notes, by chapter')).toBeTruthy();
    expect(screen.getByRole('group', { name: 'Filter notes' })).toBeTruthy();
    expect(screen.getByRole('combobox', { name: 'Sort notes' })).toBeTruthy();
    expect(screen.getByText(/^Sources:/)).toBeTruthy();
    const hints = screen.getByRole('note', { name: 'Keyboard shortcuts' });
    expect(within(hints).getByText('Pickup')).toBeTruthy();
    expect(within(hints).queryByText('All chapters')).toBeNull();
    expect(within(hints).queryByText('Play')).toBeNull();
  });

  // Issue 1705: the mock's strip runs "Open, 1 … N, Close"; the credits tiles have no number and, with no notes of their own, a dash.
  it('draws the strip as Open, the chapters and Close, the credits tiles unnumbered', async () => {
    renderPage();
    await noteRows();
    const strip = await screen.findByRole('group', { name: 'Open notes by chapter' });
    await waitFor(() => expect(within(strip).getAllByRole('button')[0].getAttribute('aria-label')).toBe('Opening credits: no notes'));
    const tiles = within(strip).getAllByRole('button');
    expect(tiles.at(-1)?.getAttribute('aria-label')).toBe('Closing credits: no notes');
    expect(tiles[0].textContent).toBe('Open—');
    expect(tiles.at(-1)?.textContent).toBe('Close—');
    expect(tiles[1].textContent?.startsWith('1')).toBe(true);
  });

  it('opens the credits card in Script from a credits tile, since Proof has no chapter view for them', async () => {
    const { goTo } = renderPage();
    await noteRows();
    const strip = await screen.findByRole('group', { name: 'Open notes by chapter' });
    await waitFor(() => expect(within(strip).getAllByRole('button')[0].getAttribute('aria-label')).toBe('Opening credits: no notes'));
    fireEvent.click(within(strip).getAllByRole('button')[0]);
    expect(goTo).toHaveBeenCalledWith('/script#credits-opening');
    expect(where()).toBe('/proof');
  });

  it('the key hints sit at the bottom of the scrolling page', async () => {
    renderPage();
    await noteRows();
    const wrap = screen.getByRole('note', { name: 'Keyboard shortcuts' }).parentElement!;
    expect(wrap.className).toContain('sticky');
    expect(wrap.className).toContain('-bottom-4');
    expect(wrap.parentElement!.lastElementChild).toBe(wrap);
  });

  it('opens one chapter with its check card and its notes; Escape returns to all chapters', async () => {
    renderPage({ at: '/proof?chapter=chapter-1' });
    await noteRows();
    expect(await screen.findByText(/Recording check/i)).toBeTruthy();
    expect(screen.queryByText('Open notes, by chapter')).toBeNull();
    expect(within(screen.getByRole('note', { name: 'Keyboard shortcuts' })).getByText('All chapters')).toBeTruthy();
    press('Escape', 'Escape');
    await waitFor(() => expect(where()).toBe('/proof'));
  });

  it('steps the chapter with Left and Right, from All chapters to the one last looked at', async () => {
    renderPage();
    await noteRows();
    press('ArrowRight', 'ArrowRight');
    await waitFor(() => expect(where()).toBe('/proof?chapter=chapter-2'));
    press('ArrowLeft', 'ArrowLeft');
    await waitFor(() => expect(where()).toBe('/proof?chapter=chapter-1'));
    expect(window.localStorage.getItem('narration.proof.lastChapter./p')).toBe('chapter-1');
  });

  it('a chapter change is a step in the history, so Back goes to the page before it, not out of the page', async () => {
    renderPage({ before: ['/pickups'] });
    await noteRows();
    press('ArrowRight', 'ArrowRight');
    await waitFor(() => expect(where()).toBe('/proof?chapter=chapter-2'));
    fireEvent.click(screen.getByRole('button', { name: 'history back' }));
    await waitFor(() => expect(where()).toBe('/proof'));
    fireEvent.click(screen.getByRole('button', { name: 'history back' }));
    await waitFor(() => expect(where()).toBe('/pickups'));
  });

  it('opens on the note that was selected when the page is left and opened again, with the note typed for it', async () => {
    renderPage({ at: '/proof?chapter=chapter-1' });
    const rows = () => [...screen.getByRole('region', { name: 'Notes' }).querySelectorAll<HTMLElement>('tr[data-row]')];
    await noteRows();
    await waitFor(() => expect(rows()[0].getAttribute('aria-selected')).toBe('true'));
    press('j', 'KeyJ');
    await waitFor(() => expect(rows()[1].getAttribute('aria-selected')).toBe('true'));
    fireEvent.change(await screen.findByRole('textbox', { name: 'Note with the decision (optional)' }), { target: { value: 'Say it slower' } });
    cleanup();
    renderPage({ at: '/proof?chapter=chapter-1' });
    await noteRows();
    await waitFor(() => expect(rows()[1].getAttribute('aria-selected')).toBe('true'));
    expect((await screen.findByRole('textbox', { name: 'Note with the decision (optional)' })).getAttribute('value') ?? '').toBe('');
    expect((screen.getByRole('textbox', { name: 'Note with the decision (optional)' }) as HTMLTextAreaElement).value).toBe('Say it slower');
  });

  it('opens on the first note, moves through the notes with J and K and with Down and Up, and does not claim Space', async () => {
    renderPage();
    await noteRows();
    const selectedAt = (index: number) =>
      (screen.getByRole('region', { name: 'Notes' }).querySelectorAll('tr[data-row]')[index] as HTMLElement).getAttribute('aria-selected');
    await waitFor(() => expect(selectedAt(0)).toBe('true'));
    press('j', 'KeyJ');
    await waitFor(() => expect(selectedAt(1)).toBe('true'));
    press('k', 'KeyK');
    await waitFor(() => expect(selectedAt(0)).toBe('true'));
    press('ArrowDown', 'ArrowDown');
    await waitFor(() => expect(selectedAt(1)).toBe('true'));
    press('ArrowUp', 'ArrowUp');
    await waitFor(() => expect(selectedAt(0)).toBe('true'));
    const space = new KeyboardEvent('keydown', { key: ' ', code: 'Space', bubbles: true, cancelable: true });
    document.body.dispatchEvent(space);
    expect(space.defaultPrevented).toBe(false);
  });

  it('a click on a note in All chapters opens its chapter; a key move does not', async () => {
    renderPage();
    await noteRows();
    const fresh = () => [...screen.getByRole('region', { name: 'Notes' }).querySelectorAll<HTMLElement>('tr[data-row]')];
    await waitFor(() => expect(fresh()[0].getAttribute('aria-selected')).toBe('true'));
    press('j', 'KeyJ');
    await waitFor(() => expect(fresh()[1].getAttribute('aria-selected')).toBe('true'));
    expect(where()).toBe('/proof');
    const row = fresh().find((candidate) => /pink eyes/.test(candidate.textContent ?? ''))!;
    fireEvent.click(row);
    await waitFor(() => expect(where()).toBe('/proof?chapter=chapter-1'));
  });

  it('shows the Inspector for the selected note', async () => {
    renderPage();
    const user = userEvent.setup();
    await user.click((await noteRows())[0]);
    const inspector = await screen.findByRole('complementary', { name: 'Note' });
    expect(within(inspector).getByRole('group', { name: 'Resolution' })).toBeTruthy();
    expect(within(inspector).getByRole('combobox', { name: 'Type of finding' })).toBeTruthy();
  });

  it('opens on the note a ?finding= link names', async () => {
    const api = createMockApi();
    const first = (await api.findingsList({})).findings[1];
    renderPage({ api, at: `/proof?finding=${first.id}` });
    await noteRows();
    expect(await screen.findByRole('complementary', { name: 'Note' })).toBeTruthy();
  });

  it('says to import a manuscript first when there is none', async () => {
    renderPage({ hasManuscript: false });
    expect(await screen.findByRole('button', { name: 'Import manuscript' })).toBeTruthy();
  });

  it('imports no deleted file', () => {
    const source = readFileSync(join(__dirname, 'ProofPage.tsx'), 'utf8');
    for (const gone of [
      'NotesHeader',
      'NotesStrip',
      'FindingDetail',
      'FindingsList',
      'ChapterWaveformCard',
      'RecordingCheckCard',
      'ReviewFilters',
      'reviewQuery',
      'TakeReview',
      'lastChapterStorage',
    ]) {
      expect(source).not.toContain(gone);
    }
  });
});

describe('proof-decisions-and-undo', () => {
  it('a decision moves to the next note, and Undo takes back the decision and the selection', async () => {
    const api = createMockApi();
    const review = vi.spyOn(api, 'findingsReview');
    renderPage({ api, at: '/proof?chapter=chapter-1' });
    const user = userEvent.setup();
    const rows = await noteRows();
    const at = rows.findIndex((row) => row.textContent?.includes('To review'));
    const selectedAt = (index: number) =>
      (screen.getByRole('region', { name: 'Notes' }).querySelectorAll('tr[data-row]')[index] as HTMLElement).getAttribute('aria-selected');
    await user.click(rows[at]);
    press('w', 'KeyW');
    await waitFor(() => expect(review).toHaveBeenCalledTimes(1));
    expect(review.mock.calls[0][0].status).toBe('dismissed');
    await waitFor(() => expect(selectedAt(at + 1)).toBe('true'));
    await user.click(await screen.findByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(review).toHaveBeenCalledTimes(2));
    expect(review.mock.calls[1][0].status).toBe('unreviewed');
    await waitFor(() => expect(selectedAt(at)).toBe('true'));
  });

  it('a decision is one journal entry: Ctrl+Z and History take it back, and the toast Undo is the same entry', async () => {
    const api = createMockApi();
    const review = vi.spyOn(api, 'findingsReview');
    const { journal } = renderPage({ api, at: '/proof?chapter=chapter-1' });
    const user = userEvent.setup();
    const rows = await noteRows();
    const at = rows.findIndex((row) => row.textContent?.includes('To review'));
    const selectedAt = (index: number) =>
      (screen.getByRole('region', { name: 'Notes' }).querySelectorAll('tr[data-row]')[index] as HTMLElement).getAttribute('aria-selected');
    await user.click(rows[at]);
    press('w', 'KeyW');
    await waitFor(() => expect(review).toHaveBeenCalledTimes(1));
    await waitFor(async () => expect(await journal.entries()).toHaveLength(1));
    const [entry] = await journal.entries();
    expect(entry.label).toMatch(/^Decision “Waive” at \d/);
    expect(entry.undoable).toBe(true);
    const undone = await journal.undoLast();
    expect(undone.ok).toBe(true);
    expect(review.mock.calls[1][0].status).toBe('unreviewed');
    await waitFor(() => expect(selectedAt(at)).toBe('true'));
    expect(await journal.entries()).toHaveLength(0);
    // The toast's Undo was that entry: it has nothing left to take back.
    await user.click(await screen.findByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(review).toHaveBeenCalledTimes(2));
  });

  it('the toast Undo takes the journal entry with it', async () => {
    const api = createMockApi();
    const { journal } = renderPage({ api, at: '/proof?chapter=chapter-1' });
    const user = userEvent.setup();
    const rows = await noteRows();
    await user.click(rows[rows.findIndex((row) => row.textContent?.includes('To review'))]);
    press('w', 'KeyW');
    await waitFor(async () => expect(await journal.entries()).toHaveLength(1));
    await user.click(await screen.findByRole('button', { name: 'Undo' }));
    await waitFor(async () => expect(await journal.entries()).toHaveLength(0));
  });

  it('after an undo the note box shows the note that is saved again, not what was typed for the decision undone', async () => {
    const api = createMockApi();
    const { journal } = renderPage({ api, at: '/proof?chapter=chapter-1' });
    const user = userEvent.setup();
    const rows = await noteRows();
    await user.click(rows[rows.findIndex((row) => row.textContent?.includes('To review'))]);
    const inspector = () => screen.getByRole('complementary', { name: 'Note' });
    const box = () => within(inspector()).getByRole('textbox', { name: /Note with the decision/ }) as HTMLTextAreaElement;
    await user.type(box(), 'Note A first');
    await user.click(within(inspector()).getByRole('button', { name: /^Waive/ }));
    await waitFor(async () => expect(await journal.entries()).toHaveLength(1));
    // The decision moved on to the next note; step back to the one just decided and change its decision and note.
    press('k', 'KeyK');
    await waitFor(() => expect(box().value).toBe('Note A first'));
    await user.clear(box());
    await user.type(box(), 'Note B second');
    await user.click(within(inspector()).getByRole('button', { name: /^Defer/ }));
    await waitFor(async () => expect(await journal.entries()).toHaveLength(2));
    press('k', 'KeyK');
    await waitFor(() => expect(box().value).toBe('Note B second'));
    expect((await journal.undoLast()).ok).toBe(true);
    // The saved note is "Note A first" again, and that is what the box shows.
    await waitFor(() =>
      expect(
        within(inspector())
          .getByRole('button', { name: /^Waive/ })
          .getAttribute('aria-pressed'),
      ).toBe('true'),
    );
    expect(box().value).toBe('Note A first');
  });

  it('an undo from another chapter goes back to the chapter of the note and selects it', async () => {
    const api = createMockApi();
    const { journal } = renderPage({ api, at: '/proof?chapter=chapter-1' });
    const user = userEvent.setup();
    const rows = await noteRows();
    const at = rows.findIndex((row) => row.textContent?.includes('To review'));
    await user.click(rows[at]);
    press('w', 'KeyW');
    await waitFor(async () => expect(await journal.entries()).toHaveLength(1));
    press('ArrowRight', 'ArrowRight');
    await waitFor(() => expect(where()).toBe('/proof?chapter=chapter-2'));
    await noteRows();
    expect((await journal.undoLast()).ok).toBe(true);
    await waitFor(() => expect(where()).toBe('/proof?chapter=chapter-1'));
    const back = await noteRows();
    await waitFor(() => expect(back[at].getAttribute('aria-selected')).toBe('true'));
    expect(back[at].textContent).toContain('To review');
  });

  it('the same decision again with nothing typed is no decision: no journal entry', async () => {
    const api = createMockApi();
    const review = vi.spyOn(api, 'findingsReview');
    const { journal } = renderPage({ api, at: '/proof?chapter=chapter-1' });
    const user = userEvent.setup();
    const rows = await noteRows();
    await user.click(rows[rows.findIndex((row) => row.textContent?.includes('To review'))]);
    const inspector = await screen.findByRole('complementary', { name: 'Note' });
    await user.click(within(inspector).getByRole('button', { name: /^Waive/ }));
    await waitFor(async () => expect(await journal.entries()).toHaveLength(1));
    // The decision moved on to the next note; step back to the waived one and Waive it again.
    press('k', 'KeyK');
    await waitFor(() =>
      expect(
        within(screen.getByRole('complementary', { name: 'Note' }))
          .getByRole('button', { name: /^Waive/ })
          .getAttribute('aria-pressed'),
      ).toBe('true'),
    );
    await user.click(within(screen.getByRole('complementary', { name: 'Note' })).getByRole('button', { name: /^Waive/ }));
    await waitFor(() => expect(review).toHaveBeenCalledTimes(2));
    expect(await journal.entries()).toHaveLength(1);
  });

  it('a stale decision is refused with the evidence-changed banner and the typed note kept', async () => {
    const api = createMockApi();
    const list = (await api.findingsList({})).findings;
    const changed = (id: string): Finding => ({ ...list.find((f) => f.id === id)!, evidence_version: 'newer' });
    vi.spyOn(api, 'findingsReview').mockRejectedValue(new Error('The evidence changed.'));
    vi.spyOn(api, 'findingsGet').mockImplementation(async (id) => changed(id));
    renderPage({ api });
    const user = userEvent.setup();
    await user.click((await noteRows())[0]);
    const inspector = await screen.findByRole('complementary', { name: 'Note' });
    await user.clear(within(inspector).getByRole('textbox', { name: /Note with the decision/ }));
    await user.type(within(inspector).getByRole('textbox', { name: /Note with the decision/ }), 'kept');
    await user.click(within(inspector).getByRole('button', { name: /Defer/ }));
    expect(await within(inspector).findByRole('alert')).toBeTruthy();
    expect((within(inspector).getByRole('textbox', { name: /Note with the decision/ }) as HTMLTextAreaElement).value).toBe('kept');
  });

  it('right-click on a note offers the decisions', async () => {
    renderPage();
    const row = (await noteRows())[0];
    fireEvent.contextMenu(row);
    const items = contextItemsFor(row.querySelector('td') ?? row);
    expect(items?.map((item) => item.label)).toEqual(expect.arrayContaining(['Needs pickup', 'Fix in edit', 'Waive', 'Defer', 'Reopen']));
    expect(items?.map((item) => item.label)).not.toContain('Play ±3 s');
  });
});

describe('page-level-checks', () => {
  const inspector = () => screen.findByRole('complementary', { name: 'Note' });

  it('P, E and D decide the selected note, and E does nothing on a note fixed with a pickup', async () => {
    const api = createMockApi();
    const review = vi.spyOn(api, 'findingsReview');
    renderPage({ api, at: '/proof?chapter=chapter-1' });
    const rows = await noteRows();
    const at = rows.findIndex((row) => row.textContent?.includes('misread') && row.textContent?.includes('To review'));
    fireEvent.click(rows[at]!);
    await inspector();
    press('e', 'KeyE');
    press('d', 'KeyD');
    await waitFor(() => expect(review).toHaveBeenCalledTimes(1));
    expect(review.mock.calls[0]![0].status).toBe('deferred');
    fireEvent.click((await noteRows())[at]!);
    press('p', 'KeyP');
    await waitFor(() => expect(review).toHaveBeenCalledTimes(2));
    expect(review.mock.calls[1]![0].status).toBe('accepted');
  });

  it('the retype is stored', async () => {
    const api = createMockApi();
    const setType = vi.spyOn(api, 'findingsSetType');
    renderPage({ api });
    fireEvent.click((await noteRows())[0]!);
    const select = within(await inspector()).getByRole('combobox', { name: 'Type of finding' });
    await userEvent.selectOptions(select, 'breath');
    await waitFor(() => expect(setType).toHaveBeenCalledWith(expect.any(String), expect.any(String), 'breath'));
  });

  it('Check recordings is off when the DAW is away', async () => {
    const api = createMockApi();
    const caps = await api.dawCapabilities();
    const away: DawCapabilities = {
      ...caps,
      reachable: false,
      capabilities: { ...caps.capabilities, review: { level: 'supported', available: false, reason: 'not_running', message: 'REAPER is not running.' } },
    };
    vi.spyOn(api, 'dawCapabilities').mockResolvedValue(away);
    vi.spyOn(api, 'subscribeDawCapabilities').mockImplementation((onUpdate) => {
      onUpdate(away);
      return () => {};
    });
    renderPage({ api });
    await noteRows();
    const check = screen.getByRole('button', { name: 'Check recordings…' });
    await waitFor(() => expect(check.getAttribute('aria-disabled') === 'true' || (check as HTMLButtonElement).disabled).toBe(true));
  });

  it('Alt with an arrow does not step the chapter', async () => {
    renderPage({ at: '/proof?chapter=chapter-1' });
    await noteRows();
    fireEvent.keyDown(document.body, { key: 'ArrowRight', code: 'ArrowRight', altKey: true });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(where()).toBe('/proof?chapter=chapter-1');
  });
});

describe('one-cleared-number', () => {
  it('the head shows the same cleared count the rail badge reads, from proofProgress over the summary', async () => {
    const api = createMockApi();
    const summary = await api.findingsSummary();
    renderPage({ api });
    await noteRows();
    const progress = proofProgress(summary, 0);
    expect(await screen.findByText(`${progress.cleared} of ${progress.total}`)).toBeTruthy();
  });
});

describe('check-recordings-opens-from-proof', () => {
  it('opens the Check recordings dialog with the chapter in view preselected', async () => {
    const open = vi.spyOn(checkRecordings, 'openCheckRecordings').mockReturnValue(() => {});
    renderPage({ at: '/proof?chapter=chapter-1' });
    await noteRows();
    fireEvent.click(screen.getByRole('button', { name: 'Check recordings…' }));
    expect(open).toHaveBeenCalledWith(['chapter-1']);
  });
});

describe('the jump menu on Proof', () => {
  it('offers the chapter steps while Proof is showing', async () => {
    renderPage();
    await noteRows();
    const steps = providedCommands().filter((command) => command.group === 'Proof');
    expect(steps.map((command) => command.label)).toEqual(['Next chapter', 'Previous chapter']);
  });
});

// The loading state (definition-of-done.md state matrix): the title and one busy region while the chapters and the notes are first read, then the
// page, or the error with Retry; a later re-read does not bring the blocks back. Never an endless skeleton.
describe('ProofPage loading state', () => {
  const never = () => new Promise<never>(() => {});
  const region = () => screen.queryByRole('group', { name: 'Loading Proof' });

  it('keeps the title and shows one busy region while the chapters are read, however long that takes', async () => {
    renderPage({ api: createMockApi({ manuscriptChapters: never }) });
    expect(await screen.findByRole('heading', { level: 1, name: 'Proof' })).toBeTruthy();
    expect(region()?.getAttribute('aria-busy')).toBe('true');
    expect(within(region()!).getByRole('status').textContent).toBe('Reading the chapters and notes…');
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(region()).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'Notes' })).toBeNull();
  });

  it('keeps the skeleton while the notes are still being read', async () => {
    renderPage({ api: createMockApi({ findingsList: never }) });
    expect(await screen.findByRole('group', { name: 'Loading Proof' })).toBeTruthy();
  });

  it('is replaced by the page when both reads end, and does not come back', async () => {
    renderPage();
    await noteRows();
    expect(region()).toBeNull();
    expect(screen.getAllByRole('heading', { level: 1, name: 'Proof' })).toHaveLength(1);
  });

  it('shows the error with Retry, not a skeleton, when the first read fails', async () => {
    renderPage({ api: createMockApi({ manuscriptChapters: () => Promise.reject(new Error('The manuscript could not be read.')) }) });
    expect(await screen.findByRole('button', { name: 'Retry' })).toBeTruthy();
    expect(region()).toBeNull();
  });
});
