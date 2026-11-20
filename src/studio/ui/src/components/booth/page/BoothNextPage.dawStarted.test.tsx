// @vitest-environment jsdom
// #3666: a take the narrator starts in the DAW itself, with the right project open and the chapter's lane armed, is followed like the app's own:
// the listening starts, Record becomes Stop, and the DAW is never asked to stop it, roll it or move. The same take with another lane armed is not followed.
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../api/hostWindow', () => ({ toggleFullscreen: vi.fn(async () => true), exitFullscreen: vi.fn(async () => {}) }));
vi.mock('../../../api/uiLog', () => ({ logUi: vi.fn() }));

import type { DawProjectState, DawTransport } from '../../../api/contracts/daw';
import type { ReadAloudReaperStatus } from '../../../api/contracts/teleprompter';
import { createOverlayService } from '../../../overlay/overlayService';
import type { NarrationApi } from '../../../types';
import { forgetListeningClaims } from '../listening/listeningClaims';
import { forgetAppTake } from '../record/useRecordControl';
import { BoothNextPage } from './BoothNextPage';
import { BoothHost, dawFor, newJournal, pageApi } from './testPage';

beforeEach(() => {
  forgetAppTake();
  forgetListeningClaims();
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  window.localStorage.clear();
});

function mount(status: ReadAloudReaperStatus, { alreadyRecording = false, sameProject = true } = {}) {
  let recording = alreadyRecording;
  const listeners = new Set<(next: DawTransport) => void>();
  const base = dawFor('reaper');
  const recordStop = vi.fn(async () => ({ ok: true, changed: true, message: '', undoSteps: 0 }));
  const roll = vi.fn(async () => ({ ok: true, changed: true, message: '', undoSteps: 0 }));
  const daw = {
    ...base,
    subscribeTransport: (listener: (next: DawTransport) => void) => (listeners.add(listener), () => void listeners.delete(listener)),
    projectState: async (): Promise<DawProjectState> => ({
      savedAt: null,
      unsavedChanges: false,
      playState: recording ? 'recording' : 'stopped',
      playPosition: 3,
    }),
    recordStop,
    roll,
  };
  const teleprompterStart = vi.fn(async () => ({ status: 'started' as const }));
  const dawGoToChapter = vi.fn(async () => ({ ok: true, changed: true, message: '', undoSteps: 0 }));
  const api = pageApi({
    teleprompterStart,
    dawGoToChapter,
    readAloudReaperState: async () => ({ status: recording ? status : 'ready', message: '', trackGuid: '{T}', armedCount: 1, playing: recording, recording }),
    bootstrap: async () => ({ ...(await pageApi().bootstrap()), dawFileLinked: true, dawReachable: true, dawProjectMatches: sameProject }),
  } as Partial<NarrationApi>);
  const overlay = createOverlayService();
  const dismissUndo = vi.spyOn(overlay, 'dismissUndo');
  render(
    <BoothHost api={api} daw={daw} journal={newJournal()} overlay={overlay}>
      <BoothNextPage hasManuscript navigate={vi.fn()} />
    </BoothHost>,
  );
  /** The narrator presses Record or Stop in the DAW itself. */
  const inDaw = (on: boolean) =>
    act(async () => {
      recording = on;
      listeners.forEach((listener) => listener({ playing: on, recording: on, position: 3 }));
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
  return { inDaw, teleprompterStart, recordStop, roll, dawGoToChapter, overlay, dismissUndo };
}

const ready = () => waitFor(() => expect((screen.getByRole('button', { name: /^Record$/ }) as HTMLButtonElement).disabled).toBe(false));
const stopShown = () => waitFor(() => expect(screen.getByRole('button', { name: /^Stop$/ })).toBeTruthy());

describe('a take started in the DAW', () => {
  it("starts the listening, shows Stop, the REC pill and the clock, and ends with the DAW's own stop", async () => {
    const { inDaw, teleprompterStart, recordStop, dismissUndo } = mount('recording_here');
    await ready();

    await inDaw(true);

    await stopShown();
    await waitFor(() => expect(teleprompterStart).toHaveBeenCalledTimes(1));
    expect(screen.getAllByText(/REC/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/\d\d:\d\d/).length).toBeGreaterThan(0);
    // The last take's "Take saved" and Undo are about a take that is over.
    expect(dismissUndo).toHaveBeenCalled();
    expect(recordStop).not.toHaveBeenCalled();

    await inDaw(false);
    await waitFor(() => expect(screen.getByRole('button', { name: /^Record$/ })).toBeTruthy());
    expect(recordStop).not.toHaveBeenCalled();
  });

  it('is not listened to when another lane is armed: Record says REAPER is recording elsewhere, and says why', async () => {
    const { inDaw, teleprompterStart } = mount('recording_elsewhere');
    await ready();

    await inDaw(true);

    await waitFor(() => expect(screen.getAllByText(/recording elsewhere/i).length).toBeGreaterThan(0));
    expect(screen.queryByRole('button', { name: /^Stop$/ })).toBeNull();
    expect(teleprompterStart).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /Recording setup/ }).getAttribute('aria-label')).toMatch(/recording elsewhere/);
  });

  it('with another project open the dialog says so, and that REAPER is recording', async () => {
    const { inDaw, teleprompterStart } = mount('recording_here', { sameProject: false });
    await ready().catch(() => {});
    await inDaw(true);
    await waitFor(() => expect(screen.getAllByText(/different project open/i).length).toBeGreaterThan(0));
    expect(teleprompterStart).not.toHaveBeenCalled();
  });

  it('leaving asks Leave the Booth? with Stay, the DAW keeps recording, and the question goes when the take ends', async () => {
    const { inDaw, recordStop } = mount('recording_here');
    await ready();
    await inDaw(true);
    await stopShown();

    await act(async () => void fireEvent.keyDown(document.body, { key: 'Escape', code: 'Escape' }));
    expect(await screen.findByText('Leave the Booth?')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Stay' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Keep recording' })).toBeNull();

    await inDaw(false);
    await waitFor(() => expect(screen.queryByText('Leave the Booth?')).toBeNull());
    expect(recordStop).not.toHaveBeenCalled();
  });

  it('R asks the DAW nothing and says where to roll; Space says where to stop', async () => {
    const { inDaw, roll, recordStop } = mount('recording_here');
    await ready();
    await inDaw(true);
    await stopShown();

    await act(async () => void fireEvent.keyDown(document.body, { key: 'r', code: 'KeyR' }));
    expect(await screen.findByText('REAPER started this take, so roll again in REAPER.')).toBeTruthy();
    expect(roll).not.toHaveBeenCalled();

    await act(async () => void fireEvent.click(screen.getByRole('button', { name: /^Stop$/ })));
    expect(await screen.findByText('REAPER started this take, so stop it in REAPER.')).toBeTruthy();
    expect(recordStop).not.toHaveBeenCalled();
  });

  it('opened while REAPER already records: the DAW is not moved and no stop-first refusal shows (QA B6)', async () => {
    const { dawGoToChapter, teleprompterStart } = mount('recording_here', { alreadyRecording: true });
    await stopShown();
    await waitFor(() => expect(teleprompterStart).toHaveBeenCalledTimes(1));
    await act(async () => void (await new Promise((resolve) => setTimeout(resolve, 50))));
    expect(dawGoToChapter).not.toHaveBeenCalled();
    expect(screen.queryByText(/Stop recording first/)).toBeNull();
  });
});
