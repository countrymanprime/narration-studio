// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChapterTrackCreateResult, ChapterTrackMatch } from '../../../api/contracts/chapterTrackMap';
import type { ReadAloudReaperState } from '../../../api/contracts/teleprompter';
import { createOverlayService } from '../../../overlay/overlayService';
import { PortOverrides } from '../../../ports/usePort';
import type { NarrationApi } from '../../../types';
import { resetOpenOnce } from '../../connection/useOpenOnce';
import { forgetAppTake } from '../record/useRecordControl';
import { BoothNextPage } from './BoothNextPage';
import { BoothHost, dawFor, newJournal, pageApi } from './testPage';

vi.mock('../takeTone', async (original) => ({ ...(await original<typeof import('../takeTone')>()), playTakeTone: vi.fn(async () => {}) }));

beforeEach(() => {
  forgetAppTake();
  resetOpenOnce();
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const UNLINKED: ReadAloudReaperState = {
  status: 'no_link',
  reason: 'unlinked',
  message: '"Chapter 1" has no linked track. Link it to its REAPER track in the audio engine panel.',
  playing: false,
  recording: false,
};
const READY: ReadAloudReaperState = { status: 'ready', message: '', playing: false, recording: false };
const EMPTY_PROJECT: ChapterTrackMatch = {
  chapterId: 'c1',
  chapterTitle: 'Chapter 1',
  projectFile: 'C:/Book/Book.rpp',
  savedAt: '2026-10-23T09:00:00Z',
  status: 'none',
  track: null,
  candidates: [],
  warnings: [],
  tracks: [],
  recordedEnd: null,
};

/** A Booth on an unlinked chapter whose host links it once a track is created (or chosen), as the real host's link store does. */
function renderUnlinked(over: Partial<NarrationApi> = {}) {
  let linked = false;
  const chapterTrackCreate = vi.fn(async (chapterId: string): Promise<ChapterTrackCreateResult> => {
    linked = true;
    const link = { trackGuid: '{NEW}', chapterId, chapterTitle: 'Chapter 1', confirmedAt: '2026-10-23T10:00:00Z', origin: 'manual' as const, match: null };
    return { outcome: 'created', documentId: 'doc', link, displaced: null, mappings: [link], track: { guid: '{NEW}', name: 'Chapter 1', index: 0 } };
  });
  const teleprompterStart = vi.fn(async () => ({ status: 'started' as const }));
  const api = pageApi({
    readAloudReaperState: async () => (linked ? READY : UNLINKED),
    chapterTrackMatch: async () => EMPTY_PROJECT,
    chapterTrackCreate,
    teleprompterStart,
    ...over,
  } as Partial<NarrationApi>);
  const base = dawFor('reaper');
  const daw = { ...base, recordStart: vi.fn(base.recordStart) };
  const overlay = createOverlayService();
  render(
    <BoothHost api={api} daw={daw} journal={newJournal()} overlay={overlay}>
      <PortOverrides clients={{ daw }}>
        <BoothNextPage hasManuscript navigate={vi.fn()} />
      </PortOverrides>
    </BoothHost>,
  );
  return { daw, overlay, chapterTrackCreate, teleprompterStart };
}

const recordButton = () => screen.getByRole('button', { name: /^Record$/, hidden: true });

describe('an unlinked chapter in the Booth', () => {
  it('opens the link dialog by itself once, and again at once on every press of Record, starting nothing', async () => {
    const { daw, teleprompterStart } = renderUnlinked();
    const dialog = await screen.findByRole('dialog', { name: 'Chapter One is not linked to a track' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(recordButton().getAttribute('aria-disabled')).toBe('true');
    expect(screen.getByRole('button', { name: 'Not linked to a track. Show details' })).toBeTruthy();
    await userEvent.click(recordButton());
    expect(await screen.findByRole('dialog', { name: 'Chapter One is not linked to a track' })).toBeTruthy();
    // Nothing ran before the dialog: no listening session, no take.
    expect(teleprompterStart).not.toHaveBeenCalled();
    expect(daw.recordStart).not.toHaveBeenCalled();
  });

  it('creates a track for the chapter, links it, says so, and Record then starts a take', async () => {
    const { daw, overlay, chapterTrackCreate } = renderUnlinked();
    const dialog = await screen.findByRole('dialog', { name: 'Chapter One is not linked to a track' });
    await userEvent.click(await within(dialog).findByRole('button', { name: 'Create a new track' }));
    expect(chapterTrackCreate).toHaveBeenCalledWith('c1');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() =>
      expect(
        overlay
          .getSnapshot()
          .toasts.map((t) => t.text)
          .join(' '),
      ).toMatch(/Track “Chapter 1” added in REAPER and linked to Chapter One/),
    );
    await waitFor(() => expect(recordButton().getAttribute('aria-disabled')).toBeNull());
    expect(screen.queryByRole('button', { name: 'Not linked to a track. Show details' })).toBeNull();
    await userEvent.click(recordButton());
    await waitFor(() => expect(daw.recordStart).toHaveBeenCalledTimes(1));
  });

  it("keeps the chip and says the DAW's refusal in the dialog when the track cannot be added", async () => {
    const message = 'REAPER is not connected to this app, so no track can be added. Start REAPER, then try again.';
    renderUnlinked({ chapterTrackCreate: async () => ({ outcome: 'refused', reason: 'standalone', message }) } as Partial<NarrationApi>);
    const dialog = await screen.findByRole('dialog', { name: 'Chapter One is not linked to a track' });
    await userEvent.click(await within(dialog).findByRole('button', { name: 'Create a new track' }));
    expect((await within(dialog).findByRole('alert')).textContent).toBe(message);
    expect(recordButton().getAttribute('aria-disabled')).toBe('true');
  });

  it('a chapter linked to several tracks says so and offers to keep one', async () => {
    renderUnlinked({
      readAloudReaperState: async () => ({ ...UNLINKED, reason: 'several_links', message: '"Chapter 1" is linked to 2 tracks.' }),
    } as Partial<NarrationApi>);
    expect(await screen.findByRole('dialog', { name: 'Chapter One is linked to more than one track' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Linked to several tracks. Show details', hidden: true })).toBeTruthy();
  });
});

describe('every other press that cannot start a take is said in front of the narrator', () => {
  it('a refusal at the press is a message with Check again, not only the footer', async () => {
    const sentence = 'REAPER did not confirm within 3 seconds. Nothing started.';
    const base = dawFor('reaper');
    const daw = { ...base, recordStart: vi.fn(async () => ({ ok: false, changed: false, message: sentence, undoSteps: 0, refused: sentence })) };
    const overlay = createOverlayService();
    render(
      <BoothHost api={pageApi()} daw={daw} journal={newJournal()} overlay={overlay}>
        <PortOverrides clients={{ daw }}>
          <BoothNextPage hasManuscript navigate={vi.fn()} />
        </PortOverrides>
      </BoothHost>,
    );
    await waitFor(() => expect(recordButton().getAttribute('aria-disabled')).toBeNull());
    await userEvent.click(recordButton());
    await waitFor(() => expect(overlay.getSnapshot().toasts.some((t) => t.text === sentence)).toBe(true));
    const toast = overlay.getSnapshot().toasts.find((t) => t.text === sentence)!;
    expect(toast.tone).toBe('error');
    expect(toast.action?.label).toBe('Check again');
  });
});
