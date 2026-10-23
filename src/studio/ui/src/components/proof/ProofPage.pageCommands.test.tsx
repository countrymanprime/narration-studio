// @vitest-environment jsdom
// What Proof offers the jump menu: its chapters, the decisions for the selected note and the recording check, read from the page's own state.
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../api/ApiContext';
import type { DawCapabilities } from '../../api/contracts/daw';
import { createMockApi } from '../../api/mockApi';
import { chapterName } from '../../chapterName';
import { COMMAND_CATALOG } from '../../input/commands.catalog';
import { defaultKeymap } from '../../input/keymap';
import { currentPageContext, type PageItem } from '../../input/pageCommands';
import { CommandRouter } from '../../input/router';
import { OverlayHost } from '../../overlay/OverlayHost';
import { createOverlayService } from '../../overlay/overlayService';
import { overlay } from '../../overlay/overlayService';
import { createJournal } from '../../studio/journal/createJournal';
import { StudioProvider } from '../../studio/StudioProvider';
import type { NarrationApi } from '../../types';
import { openJumpMenu } from '../layout/JumpMenu';
import { TooltipProvider } from '../primitives/Tooltip';
import * as checkRecordings from '../recordingcheck/openCheckRecordings';
import { ProofPage } from './ProofPage';

beforeEach(() => {
  Element.prototype.scrollIntoView = () => {};
});
afterEach(() => {
  cleanup();
  overlay.dismissUndo();
  window.localStorage.clear();
  vi.restoreAllMocks();
});

function Where() {
  const location = useLocation();
  return <p data-testid="where">{location.pathname + location.search}</p>;
}
const where = () => screen.getByTestId('where').textContent;

function renderPage({ api = createMockApi(), at = '/proof' }: { api?: NarrationApi; at?: string } = {}) {
  const journal = createJournal({ dawName: () => 'REAPER', dawLastAction: async () => 'unknown' });
  const handlers = { goTo: vi.fn(), goToScript: vi.fn(), goToBooth: vi.fn(), goToEditing: vi.fn() };
  const view = render(
    <MemoryRouter initialEntries={[at]}>
      <ApiProvider api={api}>
        <StudioProvider journal={journal}>
          <CommandRouter>
            <TooltipProvider>
              <Routes>
                <Route path="/proof" element={<ProofPage hasManuscript projectFolder="/p" {...handlers} />} />
              </Routes>
              <Where />
              <OverlayHost />
            </TooltipProvider>
          </CommandRouter>
        </StudioProvider>
      </ApiProvider>
    </MemoryRouter>,
  );
  return { api, ...handlers, ...view };
}

const items = (group?: string): readonly PageItem[] => (currentPageContext()?.items ?? []).filter((row) => group === undefined || row.group === group);
const byId = (id: string) => items().find((row) => row.id === id)!;
const ready = () => waitFor(() => expect(items('Chapters').length).toBeGreaterThan(1));
const notesLoaded = () => waitFor(() => expect(document.querySelectorAll('section[aria-label="Notes"] tr[data-row]').length).toBeGreaterThan(0));

describe('proof-page-commands', () => {
  it('registers-as-Proof-replacing-the-global-chapter-rows-and-goes-when-the-page-unmounts', async () => {
    const { unmount } = renderPage();
    await ready();
    expect(currentPageContext()).toMatchObject({ id: 'proof', label: 'Proof', supersedes: ['Chapters'] });
    unmount();
    expect(currentPageContext()).toBeNull();
  });

  it('lists-All-chapters-and-each-chapter-from-the-manuscript-and-follows-the-chapter-showing', async () => {
    const api = createMockApi();
    const narration = (await api.manuscriptChapters()).filter((c) => (c.contentKind ?? 'narration') === 'narration');
    renderPage({ api });
    await ready();
    expect(items('Chapters').map((row) => row.label)).toEqual(['All chapters', ...narration.map((c) => chapterName(c))]);
    expect(byId('chapter.all').disabledReason).toBe('All chapters is already showing.');
    expect(byId(`chapter.${narration[1].id}`).disabledReason).toBeUndefined();

    act(() => byId(`chapter.${narration[1].id}`).run());
    await waitFor(() => expect(where()).toBe(`/proof?chapter=${narration[1].id}`));
    await waitFor(() => expect(byId(`chapter.${narration[1].id}`).disabledReason).toBe('Already showing this chapter.'));
    expect(byId('chapter.all').disabledReason).toBeUndefined();

    act(() => byId('chapter.all').run());
    await waitFor(() => expect(where()).toBe('/proof'));
  });

  it('the-decisions-wait-for-a-selected-note-with-their-reason-and-press-the-inspector-when-there-is-one', async () => {
    const api = createMockApi();
    const review = vi.spyOn(api, 'findingsReview');
    renderPage({ api, at: '/proof?chapter=chapter-1' });
    await ready();
    await notesLoaded();
    expect(items('Selected note').map((row) => row.label)).toEqual(['Needs pickup', 'Fix in edit', 'Fine as read', 'Defer']);
    await waitFor(() => expect(byId('note.waive').disabledReason).toBeUndefined());
    act(() => byId('note.waive').run());
    await waitFor(() => expect(review).toHaveBeenCalledTimes(1));
    expect(review.mock.calls[0][0].status).toBe('dismissed');
  });

  it('with-no-notes-the-decisions-stay-listed-off-and-say-to-select-a-note', async () => {
    const api = createMockApi();
    vi.spyOn(api, 'findingsList').mockResolvedValue({ findings: [], total: 0 } as never);
    renderPage({ api });
    await ready();
    for (const id of ['note.pickup', 'note.edit', 'note.waive', 'note.defer']) expect(byId(id).disabledReason).toBe('Select a note first.');
  });

  it('check-recordings-opens-the-chapter-showing-or-the-ones-to-check-and-says-why-when-the-DAW-cannot', async () => {
    const open = vi.spyOn(checkRecordings, 'openCheckRecordings').mockReturnValue(() => {});
    const { unmount } = renderPage({ at: '/proof?chapter=chapter-1' });
    await ready();
    await waitFor(() => expect(byId('check').disabledReason).toBeUndefined());
    expect(byId('check').label).toMatch(/^Check recordings of /);
    act(() => byId('check').run());
    expect(open).toHaveBeenCalledWith(['chapter-1']);
    unmount();

    const message = 'REAPER is not answering. Start it and open the project.';
    const caps: DawCapabilities = {
      daw: 'REAPER',
      reachable: false,
      capabilities: { review: { level: 'supported', available: false, reason: 'not_running', message } },
    };
    renderPage({ api: createMockApi({ dawCapabilities: async () => caps, subscribeDawCapabilities: () => () => undefined }) });
    await ready();
    await waitFor(() => expect(byId('check').disabledReason).toBe(message));
    expect(byId('check').label).toBe('Check recordings');
  });

  it('shows-under-On-this-page-in-the-jump-menu', async () => {
    renderPage();
    await ready();
    const service = createOverlayService();
    render(<OverlayHost service={service} />);
    act(() => void openJumpMenu({ service, keymap: defaultKeymap(COMMAND_CATALOG, false), runCommand: () => {} }));
    expect(await screen.findByRole('option', { name: /^Chapters\d+ ›/ })).toBeTruthy();
    expect(screen.getByRole('option', { name: /^Selected note4 ›/ })).toBeTruthy();
    await userEvent.setup().keyboard('{Escape}');
  });
});
