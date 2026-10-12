// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../api/ApiContext';
import { createMockApi } from '../../api/mockApi';
import { CommandRouter } from '../../input/router';
import { OverlayHost } from '../../overlay/OverlayHost';
import { providedCommands } from '../../input/commandProviders';
import { contextItemsFor } from '../../registries/context';
import type { Finding, NarrationApi } from '../../types';
import { TooltipProvider } from '../primitives/Tooltip';
import * as checkRecordings from '../recordingcheck/openCheckRecordings';
import { setImportPrompted } from '../script/page/layout/NeedManuscript';
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

function renderPage({ api = createMockApi(), at = '/proof', hasManuscript = true }: { api?: NarrationApi; at?: string; hasManuscript?: boolean } = {}) {
  const handlers = { goTo: vi.fn(), goToScript: vi.fn(), goToBooth: vi.fn(), goToEditing: vi.fn() };
  window.localStorage.setItem('narration.proof.lastChapter./p', 'chapter-2');
  render(
    <MemoryRouter initialEntries={[at]}>
      <ApiProvider api={api}>
        <CommandRouter>
          <TooltipProvider>
            <Routes>
              <Route path="/proof" element={<ProofPage hasManuscript={hasManuscript} projectFolder="/p" {...handlers} />} />
            </Routes>
            <Where />
            <OverlayHost />
          </TooltipProvider>
        </CommandRouter>
      </ApiProvider>
    </MemoryRouter>,
  );
  return { api, ...handlers };
}

const noteRows = async () => {
  const notes = await screen.findByRole('region', { name: 'Notes' });
  await waitFor(() => expect(notes.querySelectorAll('tr[data-row]').length).toBeGreaterThan(0));
  return [...notes.querySelectorAll<HTMLElement>('tr[data-row]')];
};
const where = () => screen.getByTestId('where').textContent;
const press = (key: string, code: string) => fireEvent.keyDown(document.body, { key, code });

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
    setImportPrompted(true);
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
    await user.clear(within(inspector).getByRole('textbox'));
    await user.type(within(inspector).getByRole('textbox'), 'kept');
    await user.click(within(inspector).getByRole('button', { name: /Defer/ }));
    expect(await within(inspector).findByRole('alert')).toBeTruthy();
    expect((within(inspector).getByRole('textbox') as HTMLTextAreaElement).value).toBe('kept');
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
