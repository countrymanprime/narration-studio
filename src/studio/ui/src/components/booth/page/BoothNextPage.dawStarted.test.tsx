// @vitest-environment jsdom
// #3666: a take the narrator starts in the DAW itself, with the right project open and the chapter's lane armed, is followed like the app's own:
// the listening starts, Record becomes Stop, and the DAW is never asked to stop it. The same take with another lane armed is not followed.
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
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

function mount(status: ReadAloudReaperStatus) {
  let recording = false;
  const listeners = new Set<(next: DawTransport) => void>();
  const base = dawFor('reaper');
  const recordStop = vi.fn(async () => ({ ok: true, changed: true, message: '', undoSteps: 0 }));
  const daw = {
    ...base,
    subscribeTransport: (listener: (next: DawTransport) => void) => (listeners.add(listener), () => void listeners.delete(listener)),
    projectState: async (): Promise<DawProjectState> => ({
      savedAt: null,
      unsavedChanges: false,
      playState: recording ? 'recording' : 'stopped',
      playPosition: 0,
    }),
    recordStop,
  };
  const teleprompterStart = vi.fn(async () => ({ status: 'started' as const }));
  const api = pageApi({
    teleprompterStart,
    readAloudReaperState: async () => ({ status: recording ? status : 'ready', message: '', trackGuid: '{T}', playing: recording, recording }),
    bootstrap: async () => ({ ...(await pageApi().bootstrap()), dawFileLinked: true, dawReachable: true, dawProjectMatches: true }),
  } as Partial<NarrationApi>);
  render(
    <BoothHost api={api} daw={daw} journal={newJournal()} overlay={createOverlayService()}>
      <BoothNextPage hasManuscript navigate={vi.fn()} />
    </BoothHost>,
  );
  /** The narrator presses Record or Stop in REAPER itself. */
  const inDaw = (on: boolean) =>
    act(async () => {
      recording = on;
      listeners.forEach((listener) => listener({ playing: on, recording: on, position: 3 }));
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
  return { inDaw, teleprompterStart, recordStop };
}

const ready = () => waitFor(() => expect((screen.getByRole('button', { name: /^Record$/ }) as HTMLButtonElement).disabled).toBe(false));

describe('a take started in the DAW', () => {
  it("starts the listening, shows Stop, and ends with the DAW's own stop", async () => {
    const { inDaw, teleprompterStart, recordStop } = mount('recording_here');
    await ready();

    await inDaw(true);

    await waitFor(() => expect(screen.getByRole('button', { name: /^Stop$/ })).toBeTruthy());
    await waitFor(() => expect(teleprompterStart).toHaveBeenCalledTimes(1));
    expect(recordStop).not.toHaveBeenCalled();

    await inDaw(false);
    await waitFor(() => expect(screen.getByRole('button', { name: /^Record$/ })).toBeTruthy());
    expect(recordStop).not.toHaveBeenCalled();
  });

  it('is not listened to when another lane is armed: Record says REAPER is recording elsewhere', async () => {
    const { inDaw, teleprompterStart } = mount('recording_elsewhere');
    await ready();

    await inDaw(true);

    await waitFor(() => expect(screen.getAllByText(/recording elsewhere/i).length).toBeGreaterThan(0));
    expect(screen.queryByRole('button', { name: /^Stop$/ })).toBeNull();
    expect(teleprompterStart).not.toHaveBeenCalled();
  });
});
