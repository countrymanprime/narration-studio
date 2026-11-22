// @vitest-environment jsdom
// The chapter list changes while a take runs (a re-split, a re-id, a project switch): the page keeps the chapter on screen while the take runs,
// stops it normally, and once the take is over says the chapter is not in this book. The pin must not outlive a take the DAW ended itself (R7-1).
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../api/hostWindow', () => ({ toggleFullscreen: vi.fn(async () => true), exitFullscreen: vi.fn(async () => {}) }));
vi.mock('../../../api/uiLog', () => ({ logUi: vi.fn() }));

import type { DawProjectState, DawTransport } from '../../../api/contracts/daw';
import type { DawRecordStart } from '../../../ports/daw';
import type { TeleprompterEvent, TeleprompterState } from '../../../api/contracts/teleprompter';
import { createOverlayService } from '../../../overlay/overlayService';
import { useStoreHandle } from '../../../studio/StudioProvider';
import type { ManuscriptChapter, NarrationApi } from '../../../types';
import { forgetListeningClaims } from '../listening/listeningClaims';
import { forgetAppTake, skipStartGuard } from '../record/useRecordControl';
import { BoothNextPage } from './BoothNextPage';
import { BoothHost, CHAPTERS, dawFor, newJournal, pageApi } from './testPage';

beforeEach(() => {
  forgetAppTake();
  forgetListeningClaims();
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  window.localStorage.clear();
});

const NOT_IN_BOOK = 'That chapter is not in this book';

/** The store of the StudioProvider the page sits in, so a test can make it read the chapter list again. */
const probe: { reload: () => Promise<void> } = { reload: async () => undefined };
function Probe() {
  const store = useStoreHandle();
  probe.reload = () => store.load('chapters');
  return null;
}

function mount({ holdStart = false, alreadyRecording = false }: { holdStart?: boolean; alreadyRecording?: boolean } = {}) {
  let recording = alreadyRecording;
  let list: ManuscriptChapter[] = CHAPTERS;
  const listeners = new Set<(next: DawTransport) => void>();
  const base = dawFor('reaper');
  const ok = { ok: true, changed: true, message: '', undoSteps: 0 };
  const recordStop = vi.fn(async () => {
    recording = false;
    return ok;
  });
  const recordStart = vi.fn(() => {
    if (holdStart) return new Promise<DawRecordStart>(() => {});
    recording = true;
    return Promise.resolve<DawRecordStart>(ok);
  });
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
    recordStart,
  };
  const teleprompterStart = vi.fn(async () => ({ status: 'started' as const }));
  const teleprompterStop = vi.fn(async () => {});
  const events = new Set<(event: TeleprompterEvent) => void>();
  const states = new Set<(state: TeleprompterState) => void>();
  const api = pageApi({
    subscribeTeleprompterEvent: (on: (event: TeleprompterEvent) => void) => (events.add(on), () => void events.delete(on)),
    subscribeTeleprompterState: (on: (state: TeleprompterState) => void) => (states.add(on), () => void states.delete(on)),
    teleprompterStart,
    teleprompterStop,
    manuscriptChapters: async () => list,
    readAloudReaperState: async () => ({
      status: recording ? 'recording_here' : 'ready',
      message: '',
      trackGuid: '{T}',
      armedCount: 1,
      playing: recording,
      recording,
    }),
    bootstrap: async () => ({ ...(await pageApi().bootstrap()), dawFileLinked: true, dawReachable: true, dawProjectMatches: true }),
  } as Partial<NarrationApi>);
  render(
    <BoothHost api={api} daw={daw} journal={newJournal()} overlay={createOverlayService()}>
      <BoothNextPage hasManuscript navigate={vi.fn()} />
      <Probe />
    </BoothHost>,
  );
  /** The list the host answers from now on, read into the store now. */
  const setList = (next: ManuscriptChapter[]) =>
    act(async () => {
      list = next;
      await probe.reload();
      await new Promise((resolve) => setTimeout(resolve, 40));
    });
  const inDaw = (on: boolean) =>
    act(async () => {
      recording = on;
      listeners.forEach((listener) => listener({ playing: on, recording: on, position: 3 }));
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
  /** The sidecar's own push: the listening session runs on c1. */
  const running = () =>
    act(async () => states.forEach((on) => on({ phase: 'running', message: '', engine: 'whisper', chapter: 'c1', script: null, position: null })));
  return { running, setList, inDaw, recordStart, recordStop, teleprompterStart, teleprompterStop };
}

const ready = () => waitFor(() => expect((screen.getByRole('button', { name: /^Record$/ }) as HTMLButtonElement).disabled).toBe(false));
const stopShown = () => waitFor(() => expect(screen.getByRole('button', { name: /^Stop$/ })).toBeTruthy());
const settle = (ms = 80) => act(async () => void (await new Promise((resolve) => setTimeout(resolve, ms))));
/** The book without c1, and the book with c1 under a new id. */
const WITHOUT_C1 = CHAPTERS.filter((chapter) => chapter.id !== 'c1');
const REIDED = CHAPTERS.map((chapter) => (chapter.id === 'c1' ? ({ ...chapter, id: 'c1-new' } as ManuscriptChapter) : chapter));

describe('the chapter list changes while a take runs', () => {
  it.each([
    ['drops c1', WITHOUT_C1],
    ['gives c1 a new id', REIDED],
  ])("the app's own take keeps Stop and its chapter when the list %s; once stopped the page says the chapter is not in this book", async (_name, next) => {
    const { running, setList, recordStop, teleprompterStop } = mount();
    await ready();
    await act(async () => void fireEvent.click(screen.getByRole('button', { name: /^Record$/ })));
    await stopShown();
    await running();

    await setList(next);
    await settle();
    expect(screen.getByRole('button', { name: /^Stop$/ })).toBeTruthy();
    expect(screen.queryByText(NOT_IN_BOOK)).toBeNull();

    skipStartGuard();
    await act(async () => void fireEvent.click(screen.getByRole('button', { name: /^Stop$/ })));
    await waitFor(() => expect(recordStop).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(teleprompterStop).toHaveBeenCalledTimes(1));
    await settle();

    expect(await screen.findByText(NOT_IN_BOOK)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Record$/ })).toBeNull();
    expect(recordStop).toHaveBeenCalledTimes(1);
    expect(teleprompterStop).toHaveBeenCalledTimes(1);
  });

  it('a take started in the DAW: when the list drops c1 and the DAW then ends the take, the pin is released (R7-1)', async () => {
    const { setList, inDaw, recordStop, teleprompterStart } = mount();
    await ready();
    await inDaw(true);
    await stopShown();
    await waitFor(() => expect(teleprompterStart).toHaveBeenCalledTimes(1));

    await setList(WITHOUT_C1);
    await settle();
    // While the take runs the chapter stays.
    expect(screen.getByRole('button', { name: /^Stop$/ })).toBeTruthy();
    expect(screen.queryByText(NOT_IN_BOOK)).toBeNull();

    await inDaw(false);
    expect(await screen.findByText(NOT_IN_BOOK)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Record$/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Stop$/ })).toBeNull();
    expect(recordStop).not.toHaveBeenCalled();
  });

  // R7-2: the DAW's start is out and no take has begun yet; a list change then must not unmount the session from under the take the DAW is about to begin.
  it("keeps the session when the list drops c1 while the app's own recordStart is unanswered", async () => {
    const { setList, recordStart } = mount({ holdStart: true });
    await ready();
    await act(async () => void fireEvent.click(screen.getByRole('button', { name: /^Record$/ })));
    await waitFor(() => expect(recordStart).toHaveBeenCalledTimes(1));

    await setList(WITHOUT_C1);
    await settle();

    expect(screen.queryByText(NOT_IN_BOOK)).toBeNull();
  });
});
