// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CreateChapterRegionsDialog, createdText } from './CreateChapterRegionsDialog';
import { ApiProvider } from '../../api/ApiContext';
import { createMockApi } from '../../api/mockApi';
import { WIRE_CHAPTERS, WIRE_TRACKS_PROJECT } from '../../api/mockFixtures';
import type { NarrationApi } from '../../types';

afterEach(cleanup);

const CONFIRMED_CHAPTER_1 = {
  chapterTrackMappings: [
    {
      trackGuid: WIRE_TRACKS_PROJECT.tracks[0].guid,
      chapterId: WIRE_CHAPTERS[0].id,
      chapterTitle: WIRE_CHAPTERS[0].title,
      confirmedAt: '2026-09-01T12:00:00Z',
    },
  ],
};

function renderDialog(overrides: Partial<NarrationApi> = {}, initial: Parameters<typeof createMockApi>[1] = {}, onClose = vi.fn()) {
  const api = createMockApi(overrides, initial);
  render(
    <ApiProvider api={api}>
      <CreateChapterRegionsDialog tracks={WIRE_TRACKS_PROJECT.tracks} onClose={onClose} />
    </ApiProvider>,
  );
  return { api, onClose };
}

describe('CreateChapterRegionsDialog', () => {
  it('skips every chapter with no confirmed track link and has nothing to create', async () => {
    renderDialog();

    expect((await screen.findAllByText(/No track is linked to this chapter\./)).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Create 0 regions' })).toBeTruthy();
  });

  it('plans a region once a chapter is linked, and a chosen credits track adds its own row', async () => {
    const user = userEvent.setup();
    renderDialog({}, CONFIRMED_CHAPTER_1);

    await screen.findByRole('button', { name: 'Create 1 region' });
    // The confirmed link's track happens to be named "Chapter 1" too, so the row shows it in both the region and
    // track columns - assert there are two matches rather than one, instead of an ambiguous single getByText.
    expect(within(screen.getByRole('table', { name: 'Chapter regions' })).getAllByText(WIRE_CHAPTERS[0].title).length).toBe(2);

    const openingTrack = WIRE_TRACKS_PROJECT.tracks[1];
    await user.selectOptions(screen.getByRole('combobox', { name: 'Opening credits track' }), openingTrack.guid);

    expect(await screen.findByRole('button', { name: 'Create 2 regions' })).toBeTruthy();
    expect(within(screen.getByRole('table', { name: 'Chapter regions' })).getByText('Opening credits')).toBeTruthy();
  });

  it('swallows the click and shows why while REAPER is not answering', async () => {
    const user = userEvent.setup();
    const { api } = renderDialog({}, { ...CONFIRMED_CHAPTER_1, daw: { reachable: false } });
    const create = vi.spyOn(api, 'chapterRegionsCreate');

    const button = await screen.findByRole('button', { name: 'Create 1 region' });
    expect(button.getAttribute('aria-disabled')).toBe('true');

    await user.click(button);
    expect(create).not.toHaveBeenCalled();
  });

  it('creates the planned regions with REAPER answering, with nothing to turn on, and shows the counts', async () => {
    const user = userEvent.setup();
    const { api } = renderDialog({}, { ...CONFIRMED_CHAPTER_1, daw: {} });
    const create = vi.spyOn(api, 'chapterRegionsCreate');

    const button = await screen.findByRole('button', { name: 'Create 1 region' });
    expect(button.hasAttribute('aria-disabled')).toBe(false);
    await user.click(button);

    await waitFor(() => expect(create).toHaveBeenCalledWith('', '', false));
    expect(await screen.findByText(/^Sent 1: 1 created/)).toBeTruthy();
  });

  it("keeps the plan's column headers in view while the dialog body scrolls (alignment audit ENX-23)", async () => {
    renderDialog({}, CONFIRMED_CHAPTER_1);
    const table = await screen.findByRole('table', { name: 'Chapter regions' });
    expect(table.querySelector('thead')?.className).toContain('sticky');
  });

  it('draws no badge beside the primary: the primary ends the action row (alignment audit R3EN1-8)', async () => {
    renderDialog({}, { ...CONFIRMED_CHAPTER_1, daw: {} });
    await screen.findByRole('button', { name: 'Create 1 region' });
    expect(screen.queryByText(/experimental/i)).toBeNull();
  });

  it('shows a REAPER error state and creates nothing', async () => {
    const user = userEvent.setup();
    renderDialog({}, { ...CONFIRMED_CHAPTER_1, daw: {}, regionsCreateAlwaysErrors: true });

    await user.click(await screen.findByRole('button', { name: 'Create 1 region' }));

    const alerts = await screen.findAllByRole('alert');
    expect(alerts.some((alert) => alert.textContent?.includes('REAPER refused to write the regions'))).toBe(true);
  });

  it('reports when no REAPER project is selected yet, with nothing to create', async () => {
    renderDialog({}, { tracksCandidates: [] });

    expect(await screen.findByText(/No REAPER project/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Create 0 regions' })).toBeTruthy();
  });

  // ENX-19: two unlabelled selects; R3EN1-2: the Move option sat below an 11-line list; the list repeated one sentence per chapter.
  it('labels each credits picker, puts the Move option above the plan, and says each skip reason once', async () => {
    renderDialog();
    expect(await screen.findAllByText(/No track is linked to this chapter\./)).toHaveLength(1);
    expect(screen.getByText('Opening credits track', { selector: 'span' })).toBeTruthy();
    expect(screen.getByText('Closing credits track', { selector: 'span' })).toBeTruthy();
    const move = screen.getByRole('checkbox', { name: /Move an existing region/ });
    const table = screen.getByRole('table', { name: 'Chapter regions' });
    expect(move.compareDocumentPosition(table) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  // R3EN1-3: "Sent 2: 2 created, 0 already existed, 0 moved, 0 ambiguous, 0 failed." in bold body text.
  it('says only the counts that are not zero', () => {
    expect(createdText({ sent: 2, created: 2, existing: 0, updated: 0, ambiguous: 0, invalid: 0, failed: 0 })).toBe('Sent 2: 2 created.');
    expect(createdText({ sent: 4, created: 1, existing: 1, updated: 0, ambiguous: 0, invalid: 1, failed: 1 })).toBe(
      'Sent 4: 1 created, 1 already existed, 1 invalid, 1 failed.',
    );
  });

  // ENX-28: the primary stayed full strength after the run; Close is the next step.
  it('makes Close the primary once regions have been created', async () => {
    const user = userEvent.setup();
    renderDialog({}, { ...CONFIRMED_CHAPTER_1, daw: {} });
    await user.click(await screen.findByRole('button', { name: 'Create 1 region' }));
    expect(await screen.findByRole('status')).toBeTruthy();
    const footerClose = screen.getAllByRole('button', { name: 'Close' }).find((button) => button.closest('[data-dialog-actions]'));
    expect(footerClose?.className).toContain('bg-[var(--accent)]');
    expect(screen.getByRole('button', { name: 'Create 1 region' }).className).not.toContain('bg-[var(--accent)]');
  });

  it('relabels Cancel to Close once regions have been created', async () => {
    const user = userEvent.setup();
    renderDialog({}, { ...CONFIRMED_CHAPTER_1, daw: {} });

    expect(screen.getByRole('button', { name: 'Cancel' })).toBeTruthy();
    await user.click(await screen.findByRole('button', { name: 'Create 1 region' }));

    // The dialog's own header Close button is also named "Close" (Dialog.tsx), so once the footer button relabels
    // from "Cancel" to "Close" too there are two: assert the count rather than a single ambiguous getByRole match.
    await waitFor(() => expect(screen.getAllByRole('button', { name: 'Close' }).length).toBe(2));
    expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull();
  });
});
