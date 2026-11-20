// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChapterTrackCreateResult, ChapterTrackMatch } from '../../../api/contracts/chapterTrackMap';
import type { ReadAloudReaperState } from '../../../api/contracts/teleprompter';
import { createOverlayService } from '../../../overlay/overlayService';
import { PortOverrides } from '../../../ports/usePort';
import type { NarrationApi } from '../../../types';
import { ChapterTrackStateProvider } from '../../chapterTracks/ChapterTrackState';
import { forgetMatches } from '../../connection/chapterMatchCache';
import { resetOpenOnce } from '../../connection/useOpenOnce';
import { VoiceLayoutContext } from '../../engine/voiceLayout';
import { forgetAppTake } from '../record/useRecordControl';
import { BoothNextPage } from './BoothNextPage';
import { BoothHost, dawFor, newJournal, pageApi } from './testPage';

vi.mock('../takeTone', async (original) => ({ ...(await original<typeof import('../takeTone')>()), playTakeTone: vi.fn(async () => {}) }));

beforeEach(() => {
  forgetAppTake();
  resetOpenOnce();
  forgetMatches();
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
function renderUnlinked(over: Partial<NarrationApi> = {}, layout: 'flat' | 'folders' = 'flat') {
  let linked = false;
  const chapterTrackCreate = vi.fn(async (chapterId: string): Promise<ChapterTrackCreateResult> => {
    linked = true;
    const link = { trackGuid: '{NEW}', chapterId, chapterTitle: 'Chapter 1', confirmedAt: '2026-10-23T10:00:00Z', origin: 'manual' as const, match: null };
    return {
      outcome: 'created',
      documentId: 'doc',
      link,
      displaced: null,
      mappings: [link],
      track: { guid: '{NEW}', name: 'Chapter 1', index: 0 },
      ...(layout === 'folders' ? { voice: { guid: '{NARRATOR}', name: 'Narrator', index: 1 } } : {}),
    };
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
        <VoiceLayoutContext.Provider value={layout}>
          <ChapterTrackStateProvider projectFolder="C:/Book" enabled notify={() => {}}>
            <BoothNextPage hasManuscript navigate={vi.fn()} />
          </ChapterTrackStateProvider>
        </VoiceLayoutContext.Provider>
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

  // #3669: the tracks are read as the Booth opens, before the link check says the chapter is unlinked, so the dialog is not a spinner.
  it('opens its dialog with the tracks to choose from and Link ready, because they were read before the link check answered', async () => {
    const slowLinkCheck = new Promise<ReadAloudReaperState>((resolve) => setTimeout(() => resolve(UNLINKED), 400));
    const withTracks: ChapterTrackMatch = {
      ...EMPTY_PROJECT,
      status: 'matched',
      tracks: [{ guid: '{T-1}', name: 'Chapter 1', index: 0, depth: 0, isFolder: false, hasAudio: true }],
      candidates: [{ trackGuid: '{T-1}', trackName: 'Chapter 1', trackIndex: 0, score: 1, source: 'track-name', region: null }],
    };
    // The host takes its time over the tracks: only a read started before the dialog opened is done by the time it does.
    const chapterTrackMatch = vi.fn(() => new Promise<ChapterTrackMatch>((resolve) => setTimeout(() => resolve(withTracks), 100)));
    renderUnlinked({ readAloudReaperState: () => slowLinkCheck, chapterTrackMatch });
    const dialog = await screen.findByRole('dialog', { name: 'Chapter One is not linked to a track' });
    // No waiting for the dialog's own read: the choices are there on the first look.
    expect(within(dialog).queryByText(/Reading the REAPER tracks/)).toBeNull();
    expect(within(dialog).getByRole('combobox')).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: 'Link track' }).getAttribute('aria-disabled')).not.toBe('true');
    expect(chapterTrackMatch.mock.calls.length).toBeGreaterThanOrEqual(1);
  });

  // The owner's reported order: the link check answers first, the tracks come a moment later. The dialog waits for them instead of opening on nothing to pick.
  it('does not open its dialog on an empty list when the link check answers before the tracks: the chip shows, then the dialog opens with the picker ready', async () => {
    const withTracks: ChapterTrackMatch = {
      ...EMPTY_PROJECT,
      status: 'matched',
      tracks: [{ guid: '{T-1}', name: 'Chapter 1', index: 0, depth: 0, isFolder: false, hasAudio: true }],
      candidates: [{ trackGuid: '{T-1}', trackName: 'Chapter 1', trackIndex: 0, score: 1, source: 'track-name', region: null }],
    };
    renderUnlinked({ chapterTrackMatch: () => new Promise<ChapterTrackMatch>((resolve) => setTimeout(() => resolve(withTracks), 500)) });
    expect(await screen.findByRole('button', { name: 'Not linked to a track. Show details' })).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
    const dialog = await screen.findByRole('dialog', { name: 'Chapter One is not linked to a track' }, { timeout: 4000 });
    expect(within(dialog).queryByText(/Reading the REAPER tracks/)).toBeNull();
    expect(within(dialog).getByRole('combobox')).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: 'Link track' }).getAttribute('aria-disabled')).not.toBe('true');
  });

  it('opens the dialog anyway, reading for itself, when the host never answers the tracks', async () => {
    renderUnlinked({ chapterTrackMatch: () => new Promise<ChapterTrackMatch>(() => undefined) });
    const dialog = await screen.findByRole('dialog', { name: 'Chapter One is not linked to a track' }, { timeout: 5000 });
    expect(within(dialog).getByText(/Reading the REAPER tracks/)).toBeTruthy();
  }, 15000);

  it('the top-bar setup chip warns while the chapter has no track, and is plain again once a track is linked', async () => {
    renderUnlinked();
    const dialog = await screen.findByRole('dialog', { name: 'Chapter One is not linked to a track' });
    expect(screen.getByRole('button', { name: 'Recording setup: REAPER, no track', hidden: true })).toBeTruthy();
    await userEvent.click(await within(dialog).findByRole('button', { name: 'Create a new track' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(screen.getByRole('button', { name: 'Recording setup: REAPER', hidden: true })).toBeTruthy());
  });

  it.each([
    ['unavailable', 'Recording setup: REAPER, not connected'],
    ['not_armed', 'Recording setup: REAPER, not armed'],
    ['recording_elsewhere', 'Recording setup: REAPER, recording elsewhere'],
    ['other_armed', 'Recording setup: REAPER'],
    ['several_armed', 'Recording setup: REAPER'],
    ['ready', 'Recording setup: REAPER'],
  ] as const)('with REAPER saying %s the top-bar setup chip reads %j', async (status, name) => {
    renderUnlinked({ readAloudReaperState: async () => ({ status, message: 'REAPER says so.', playing: false, recording: false }) });
    expect(await screen.findByRole('button', { name, hidden: true })).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('the top-bar setup chip drops what REAPER last said about the chapter once the DAW stops answering', async () => {
    const base = dawFor('reaper');
    let gone = false;
    const notAnswering = { level: 'experimental' as const, available: false, message: 'REAPER is not answering.' };
    const daw = {
      ...base,
      capabilities: async () => {
        const capabilities = await base.capabilities();
        return gone
          ? { ...capabilities, reachable: false, capabilities: { ...capabilities.capabilities, track_state: notAnswering, record: notAnswering } }
          : capabilities;
      },
    };
    const api = pageApi({
      readAloudReaperState: async () => ({ status: 'not_armed' as const, message: 'No track is armed in REAPER.', playing: false, recording: false }),
    } as Partial<NarrationApi>);
    render(
      <BoothHost api={api} daw={daw} journal={newJournal()} overlay={createOverlayService()}>
        <PortOverrides clients={{ daw }}>
          <BoothNextPage hasManuscript navigate={vi.fn()} />
        </PortOverrides>
      </BoothHost>,
    );
    expect(await screen.findByRole('button', { name: 'Recording setup: REAPER, not armed', hidden: true })).toBeTruthy();
    gone = true;
    window.dispatchEvent(new Event('focus'));
    await waitFor(() => expect(screen.queryByRole('button', { name: /not armed/, hidden: true })).toBeNull());
  });

  // #3271: the layout is a project setting, so a Voice folders project is never told that a chapter records on a track.
  it('in a Voice folders project the prompt, the chip, the footer and the toast after Create a new folder all say folder', async () => {
    const { overlay, chapterTrackCreate } = renderUnlinked({}, 'folders');
    const dialog = await screen.findByRole('dialog', { name: 'Chapter One is not linked to a folder' });
    expect(within(dialog).getByText("Record can't start until Chapter One has a folder of voice tracks to record on.")).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Not linked to a folder. Show details', hidden: true })).toBeTruthy();
    expect(screen.getByText('Chapter One has no folder to record on. Press Record to link one.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Recording setup: REAPER, no folder', hidden: true })).toBeTruthy();
    await userEvent.click(await within(dialog).findByRole('button', { name: 'Create a new folder' }));
    expect(chapterTrackCreate).toHaveBeenCalledWith('c1');
    await waitFor(() =>
      expect(
        overlay
          .getSnapshot()
          .toasts.map((t) => t.text)
          .join(' '),
      ).toBe('Folder “Chapter 1” with a Narrator track added in REAPER and linked to Chapter One. Save the REAPER project to keep it.'),
    );
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

  it("keeps the chip and says the DAW's refusal as a toast when the track cannot be added", async () => {
    const message = 'REAPER is not connected to this app, so no track can be added. Start REAPER, then try again.';
    const { overlay } = renderUnlinked({ chapterTrackCreate: async () => ({ outcome: 'refused', reason: 'standalone', message }) } as Partial<NarrationApi>);
    const dialog = await screen.findByRole('dialog', { name: 'Chapter One is not linked to a track' });
    await userEvent.click(await within(dialog).findByRole('button', { name: 'Create a new track' }));
    await waitFor(() => expect(overlay.getSnapshot().toasts.map((t) => t.text)).toContain(message));
    expect(within(dialog).queryByRole('alert')).toBeNull();
    expect(recordButton().getAttribute('aria-disabled')).toBe('true');
  });

  it('a chapter linked to several tracks says so and offers to keep one', async () => {
    renderUnlinked({
      readAloudReaperState: async () => ({ ...UNLINKED, reason: 'several_links', message: '"Chapter 1" is linked to 2 tracks.' }),
    } as Partial<NarrationApi>);
    expect(await screen.findByRole('dialog', { name: 'Chapter One is linked to more than one track' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Linked to several tracks. Show details', hidden: true })).toBeTruthy();
  });

  // #3368: the Engine says "Track missing" for a link to a track the project no longer has; the Booth said "Not linked to a track".
  it('a chapter whose linked track is gone says so, not that it is not linked', async () => {
    renderUnlinked({
      readAloudReaperState: async () => ({
        ...UNLINKED,
        reason: 'track_missing',
        message: 'The track linked to "Chapter 1" is no longer in the REAPER project.',
      }),
    } as Partial<NarrationApi>);
    expect(await screen.findByRole('dialog', { name: /’s track is not in the project$/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Track missing. Show details', hidden: true })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Not linked to a track. Show details', hidden: true })).toBeNull();
  });

  it.each([
    ['flat', 'track', 'Track missing'],
    ['folders', 'folder', 'Folder missing'],
  ] as const)(
    'a missing link in a %s project: footer says the %s is not in the project, never that there is none, and the chips say what the Engine says',
    async (layout, noun, chip) => {
      renderUnlinked({ readAloudReaperState: async () => ({ ...UNLINKED, reason: 'track_missing', message: 'gone' }) } as Partial<NarrationApi>, layout);
      await screen.findByRole('dialog');
      const why = document.getElementById('brec-why')?.textContent ?? '';
      expect(why).toContain(`${noun} is not in the project`);
      expect(why).not.toContain(`has no ${noun}`);
      expect(screen.getByRole('button', { name: `${chip}. Show details`, hidden: true })).toBeTruthy();
      expect(screen.getByRole('button', { name: `Recording setup: REAPER, ${chip.toLowerCase()}`, hidden: true })).toBeTruthy();
    },
  );
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
