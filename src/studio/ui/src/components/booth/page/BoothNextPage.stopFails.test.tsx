// @vitest-environment jsdom
// #3409: a listening session the host would not stop keeps the microphone open. The Booth sends the stop once more, and says it once if that is refused
// too, with a Retry that sends it again.
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../api/hostWindow', () => ({ toggleFullscreen: vi.fn(async () => true), exitFullscreen: vi.fn(async () => {}) }));
vi.mock('../takeTone', async (original) => ({ ...(await original<typeof import('../takeTone')>()), playTakeTone: vi.fn(async () => {}) }));

import type { TeleprompterEvent } from '../../../api/contracts/teleprompter';
import { createOverlayService } from '../../../overlay/overlayService';
import type { NarrationApi, TeleprompterState } from '../../../types';
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

const IDLE: TeleprompterState = { phase: 'idle', message: '', engine: null, chapter: null, paused: false, coldRead: false, script: null, position: null };
const SCRIPT: TeleprompterEvent = {
  type: 'script',
  chapter: { id: 'c1', title: 'Chapter One' },
  tokens: 36,
  spans: [
    { kind: 'title', id: 'c1', index: null, start: 0, count: 2 },
    { kind: 'paragraph', id: 'p1', index: 0, start: 2, count: 11 },
    { kind: 'paragraph', id: 'p2', index: 1, start: 13, count: 13 },
    { kind: 'paragraph', id: 'p3', index: 2, start: 26, count: 10 },
  ],
};

/** A stop the host takes after this long (a test sets it once the refusals are over). */
const stopDelay = { ms: 0 };
afterEach(() => (stopDelay.ms = 0));

/** A host whose stop is refused for the first `refusals` calls, as a host busy with its sidecar's exit is. */
function mountBooth(refusals: number, shared?: ReturnType<typeof createOverlayService>) {
  let state: TeleprompterState = IDLE;
  const states = new Set<(next: TeleprompterState) => void>();
  const events = new Set<(event: TeleprompterEvent) => void>();
  const publish = (next: Partial<TeleprompterState>) => {
    state = { ...state, ...next };
    states.forEach((listener) => listener(state));
  };
  let refused = 0;
  const teleprompterStart = vi.fn(async (options: { coldRead?: boolean }) => {
    publish({ phase: 'starting', chapter: 'c1', engine: 'whisper', coldRead: Boolean(options.coldRead) });
    publish({ phase: 'running' });
    events.forEach((listener) => listener(SCRIPT));
    return { status: 'started' as const };
  });
  const teleprompterStop = vi.fn(async () => {
    if (refused < refusals) {
      refused += 1;
      throw new Error('the host is busy');
    }
    if (stopDelay.ms) await new Promise((resolve) => setTimeout(resolve, stopDelay.ms));
    publish({ phase: 'stopped' });
  });
  const overlay = shared ?? createOverlayService();
  const daw = dawFor('reaper');
  const transport = new Set<(next: { recording: boolean }) => void>();
  daw.subscribeTransport = ((listener: (next: { recording: boolean }) => void) => {
    transport.add(listener);
    return () => transport.delete(listener);
  }) as unknown as typeof daw.subscribeTransport;
  const host: Partial<NarrationApi> = {
    teleprompterStart,
    teleprompterStop,
    teleprompterSaveFlags: async () => [],
    teleprompterState: async () => state,
    subscribeTeleprompterState: (listener: (next: TeleprompterState) => void) => {
      states.add(listener);
      return () => states.delete(listener);
    },
    subscribeTeleprompterEvent: (listener: (event: TeleprompterEvent) => void) => {
      events.add(listener);
      return () => events.delete(listener);
    },
  };
  const api = pageApi({ passageMapRecordRun: async () => [], ...host });
  const view = render(
    <BoothHost api={api} daw={daw} journal={newJournal()} overlay={overlay}>
      <BoothNextPage hasManuscript navigate={vi.fn()} />
    </BoothHost>,
  );
  return {
    view,
    overlay,
    daw,
    listenerCount: () => states.size,
    teleprompterStop,
    publish,
    teleprompterStart,
    pushTransport: (next: { recording: boolean }) => transport.forEach((listener) => listener(next)),
  };
}

const main = () => document.getElementById('brec') as HTMLButtonElement;
const ready = async () => {
  await screen.findByText('Nobody', { exact: false });
  await waitFor(() => expect((screen.getByRole('button', { name: /^Record$/ }) as HTMLButtonElement).disabled).toBe(false));
};
const chooseCold = async () => {
  await act(async () => void fireEvent.click(screen.getByRole('button', { name: 'Record options' })));
  const group = await screen.findByRole('radiogroup', { name: 'Main button' });
  await act(async () => void fireEvent.click(within(group).getByRole('radio', { name: 'Cold read' })));
  await act(async () => void fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape', code: 'Escape' }));
  await waitFor(() => expect(screen.queryByRole('radiogroup', { name: 'Main button' })).toBeNull());
};
/** Starts a cold read and presses its Stop. */
async function coldReadThenStop() {
  await ready();
  await chooseCold();
  await act(async () => void fireEvent.click(main()));
  await waitFor(() => expect(main().textContent).toBe('Stop'));
  await act(async () => void fireEvent.click(main()));
}
const SENTENCE = /The Booth could not stop listening, so your microphone may still be open/;
const toasts = (page: ReturnType<typeof mountBooth>) => page.overlay.getSnapshot().toasts.filter((toast) => SENTENCE.test(toast.text));

describe('a listening stop the host refuses', () => {
  it('is sent once more and nothing is said when the second is taken', async () => {
    const page = mountBooth(1);
    await coldReadThenStop();
    await waitFor(() => expect(page.teleprompterStop).toHaveBeenCalledTimes(2), { timeout: 4000 });
    expect(toasts(page)).toHaveLength(0);
  });

  it('is said once, in plain words with Retry, when the second is refused too, and Retry stops it', async () => {
    const page = mountBooth(2);
    await coldReadThenStop();
    await waitFor(() => expect(toasts(page)).toHaveLength(1), { timeout: 4000 });
    expect(page.teleprompterStop).toHaveBeenCalledTimes(2);
    const [toast] = toasts(page);
    expect(toast.tone).toBe('error');
    expect(toast.text).not.toMatch(/host is busy/);
    await act(async () => toast.action?.onAction());
    await waitFor(() => expect(page.teleprompterStop).toHaveBeenCalledTimes(3));
    await waitFor(() => expect(toasts(page)).toHaveLength(0));
  });

  it('is said again when Retry is refused twice too, and Retry pressed twice at once stops once', async () => {
    const page = mountBooth(4);
    await coldReadThenStop();
    await waitFor(() => expect(toasts(page)).toHaveLength(1), { timeout: 4000 });
    await act(async () => {
      toasts(page)[0].action?.onAction();
      toasts(page)[0]?.action?.onAction();
    });
    await waitFor(() => expect(toasts(page)).toHaveLength(1), { timeout: 4000 });
    expect(page.teleprompterStop).toHaveBeenCalledTimes(4);
  });

  it('takes the sentence down when the Booth that said it is left, and a Retry from it sends nothing', async () => {
    const page = mountBooth(2);
    await coldReadThenStop();
    await waitFor(() => expect(toasts(page)).toHaveLength(1), { timeout: 4000 });
    const [toast] = toasts(page);
    page.view.unmount();
    expect(toasts(page)).toHaveLength(0);
    // The way out sends its own stop(s); what the old Retry does after those is nothing more.
    await act(async () => void (await new Promise((resolve) => setTimeout(resolve, 2500))));
    const calls = page.teleprompterStop.mock.calls.length;
    await act(async () => toast.action?.onAction());
    expect(page.teleprompterStop).toHaveBeenCalledTimes(calls);
  });

  it('says on the page the narrator lands on that the microphone may still be open, when the Booth is left with the sentence up (no Retry there)', async () => {
    const page = mountBooth(9);
    await coldReadThenStop();
    await waitFor(() => expect(toasts(page)).toHaveLength(1), { timeout: 4000 });
    expect(toasts(page)[0].durationMs).toBe(60_000);
    page.view.unmount();
    // The way out tries the stop once more (and again after 1.5 s) before it says so.
    await waitFor(() => expect(page.overlay.getSnapshot().toasts.filter((toast) => /Quit and reopen the app to be sure/.test(toast.text))).toHaveLength(1), {
      timeout: 5000,
    });
    const left = page.overlay.getSnapshot().toasts.filter((toast) => /Quit and reopen the app to be sure/.test(toast.text));
    expect(left[0].tone).toBe('error');
    expect(left[0].action).toBeUndefined();
    expect(toasts(page).filter((toast) => toast.action)).toHaveLength(0);
    // The host then reports the session ended: the sentence about an open microphone goes.
    await act(async () => void page.publish({ phase: 'stopped' }));
    expect(page.overlay.getSnapshot().toasts.some((toast) => /Quit and reopen/.test(toast.text))).toBe(false);
  });

  it('says it on the next page when "Stop and leave" (Escape on a cold read) is refused twice, and says nothing when the stop is taken', async () => {
    for (const [refusals, said] of [
      [9, true],
      [0, false],
    ] as const) {
      cleanup();
      forgetListeningClaims();
      const page = mountBooth(refusals);
      await ready();
      await chooseCold();
      await act(async () => void fireEvent.click(main()));
      await waitFor(() => expect(main().textContent).toBe('Stop'));
      await act(async () => void fireEvent.keyDown(document.body, { key: 'Escape', code: 'Escape' }));
      await waitFor(() => expect(page.teleprompterStop).toHaveBeenCalled());
      page.view.unmount();
      await act(async () => void (await new Promise((resolve) => setTimeout(resolve, 3000))));
      const left = page.overlay.getSnapshot().toasts.filter((toast) => /Quit and reopen the app to be sure/.test(toast.text));
      expect(left).toHaveLength(said ? 1 : 0);
      if (said) expect(page.teleprompterStop.mock.calls.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('says on the next page that the microphone may be open when a take is left with "Stop and leave" and every stop is refused', async () => {
    for (const [refusals, said] of [
      [9, true],
      [0, false],
    ] as const) {
      cleanup();
      forgetListeningClaims();
      forgetAppTake();
      const page = mountBooth(refusals);
      await ready();
      await act(async () => void fireEvent.click(main()));
      await waitFor(() => expect(main().textContent).toBe('Stop'));
      await act(async () => void (await new Promise((resolve) => setTimeout(resolve, 1500))));
      await act(async () => void fireEvent.keyDown(document.body, { key: 'Escape', code: 'Escape' }));
      const question = await waitFor(() => {
        const dialog = page.overlay.getSnapshot().dialogs[0];
        expect(dialog).toBeTruthy();
        return dialog;
      });
      await act(async () => {
        if (question.kind === 'confirm') question.answer(true);
      });
      await waitFor(() => expect(page.teleprompterStop).toHaveBeenCalled(), { timeout: 5000 });
      page.view.unmount();
      await act(async () => void (await new Promise((resolve) => setTimeout(resolve, 3500))));
      const left = page.overlay.getSnapshot().toasts.filter((toast) => /Quit and reopen the app to be sure/.test(toast.text));
      expect(left).toHaveLength(said ? 1 : 0);
      // The leave's own stop is retried after the page is gone.
      if (said) expect(page.teleprompterStop.mock.calls.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('says the microphone may be open when the narrator, after a "Stop and leave" the DAW refused and "Keep recording", ends the take and then leaves', async () => {
    const page = mountBooth(99);
    const real = page.daw.recordStop.bind(page.daw);
    let refuse = true;
    page.daw.recordStop = (async (...args: Parameters<typeof real>) => {
      if (refuse) {
        refuse = false;
        return { ok: false, changed: false, message: 'REAPER is busy', undoSteps: 0, refused: 'REAPER is busy' };
      }
      return real(...args);
    }) as typeof page.daw.recordStop;
    await ready();
    await act(async () => void fireEvent.click(main()));
    await waitFor(() => expect(main().textContent).toBe('Stop'));
    await act(async () => void (await new Promise((resolve) => setTimeout(resolve, 1500))));
    const answer = async (yes: boolean) => {
      const dialog = await waitFor(() => {
        const entry = page.overlay.getSnapshot().dialogs[0];
        expect(entry).toBeTruthy();
        return entry;
      });
      await act(async () => {
        if (dialog.kind === 'confirm') dialog.answer(yes);
      });
    };
    await act(async () => void fireEvent.keyDown(document.body, { key: 'Escape', code: 'Escape' }));
    await answer(true);
    // The DAW refused: "Could not stop the take"; the narrator keeps recording.
    await waitFor(() =>
      expect(page.overlay.getSnapshot().dialogs[0]?.kind === 'confirm' && page.overlay.getSnapshot().dialogs[0].spec.title).toBe('Could not stop the take'),
    );
    await answer(false);
    // The narrator ends the take themselves; the listening stop is refused twice and the sentence shows.
    await act(async () => void fireEvent.click(main()));
    await waitFor(() => expect(toasts(page).length).toBeGreaterThan(0), { timeout: 6000 });
    page.view.unmount();
    await act(async () => void (await new Promise((resolve) => setTimeout(resolve, 3500))));
    expect(page.overlay.getSnapshot().toasts.filter((toast) => /Quit and reopen the app to be sure/.test(toast.text))).toHaveLength(1);
  });

  it('leaves no state listener behind after a stop refused twice, and says the leave stop it sent when the Booth goes with the sentence up (Ctrl+Alt+C, a link)', async () => {
    const page = mountBooth(99);
    await coldReadThenStop();
    await waitFor(() => expect(toasts(page)).toHaveLength(1), { timeout: 4000 });
    const calls = page.teleprompterStop.mock.calls.length;
    page.view.unmount();
    await act(async () => void (await new Promise((resolve) => setTimeout(resolve, 3500))));
    // The way out tried the stop once more (and once more after 1.5 s), then said it.
    expect(page.teleprompterStop.mock.calls.length).toBeGreaterThanOrEqual(calls + 2);
    expect(page.overlay.getSnapshot().toasts.filter((toast) => /Quit and reopen the app to be sure/.test(toast.text))).toHaveLength(1);
    // Only the leave sentence's own watcher is left (it waits for the host to end the session); the Booth's and the stops' are gone.
    expect(page.listenerCount()).toBe(1);
    await act(async () => void page.publish({ phase: 'stopped' }));
    expect(page.listenerCount()).toBe(0);
  });

  it('takes the leave sentence down on the next page when a stop is taken there', async () => {
    const first = mountBooth(99);
    await coldReadThenStop();
    await waitFor(() => expect(toasts(first)).toHaveLength(1), { timeout: 4000 });
    first.view.unmount();
    await act(async () => void (await new Promise((resolve) => setTimeout(resolve, 3500))));
    expect(first.overlay.getSnapshot().toasts.some((toast) => /Quit and reopen/.test(toast.text))).toBe(true);
    // The host recovers: a take in a new Booth on the same overlay ends and its stop is taken.
    cleanup();
    forgetListeningClaims();
    forgetAppTake();
    const second = mountBooth(0, first.overlay);
    await ready();
    await act(async () => void fireEvent.click(main()));
    await waitFor(() => expect(main().textContent).toBe('Stop'));
    await act(async () => void (await new Promise((resolve) => setTimeout(resolve, 1500))));
    await act(async () => void fireEvent.click(main()));
    await waitFor(() => expect(second.teleprompterStop).toHaveBeenCalled());
    await waitFor(() => expect(second.overlay.getSnapshot().toasts.some((toast) => /Quit and reopen|could not stop listening/.test(toast.text))).toBe(false));
  });

  it('says on the next page that the microphone may be open when the Booth is left while a refused Retry is out', async () => {
    const page = mountBooth(99);
    await coldReadThenStop();
    await waitFor(() => expect(toasts(page)).toHaveLength(1), { timeout: 4000 });
    const [toast] = toasts(page);
    await act(async () => toast.action?.onAction());
    // The Retry is out (its second stop waits 1.5 s) and the narrator leaves.
    page.view.unmount();
    await waitFor(() => expect(page.overlay.getSnapshot().toasts.filter((item) => /Quit and reopen the app to be sure/.test(item.text))).toHaveLength(1), {
      timeout: 6000,
    });
  });

  it('sends no stop at all when the host ended the session and another started in the same moment the Booth was left with the sentence up', async () => {
    const page = mountBooth(99);
    await coldReadThenStop();
    await waitFor(() => expect(toasts(page)).toHaveLength(1), { timeout: 4000 });
    const calls = page.teleprompterStop.mock.calls.length;
    act(() => {
      page.publish({ phase: 'stopped' });
      page.publish({ phase: 'running' });
      page.view.unmount();
    });
    await act(async () => void (await new Promise((resolve) => setTimeout(resolve, 3500))));
    expect(page.teleprompterStop).toHaveBeenCalledTimes(calls);
    expect(page.overlay.getSnapshot().toasts.some((item) => /Quit and reopen/.test(item.text))).toBe(false);
  });

  it('keeps one toast up while Retry is out, says "Listening stopped." when the host takes it, and returns focus to Record', async () => {
    const page = mountBooth(2);
    await coldReadThenStop();
    await waitFor(() => expect(toasts(page)).toHaveLength(1), { timeout: 4000 });
    const [toast] = toasts(page);
    const topicToasts = () => page.overlay.getSnapshot().toasts.filter((item) => item.topic === 'booth-listening-stop-failed');
    // What the narrator sees from the press on: never nothing in between, so a Retry does not read as a flicker or a false success.
    const seen: string[][] = [];
    page.overlay.subscribe(() => seen.push(topicToasts().map((item) => item.text)));
    // The toast's own button has focus when it is pressed (this test draws no toast region, so one stands in).
    const region = document.body.appendChild(document.createElement('div'));
    region.setAttribute('data-toast-region', '');
    const held = region.appendChild(document.createElement('button'));
    held.focus();
    stopDelay.ms = 400;
    await act(async () => toast.action?.onAction());
    await waitFor(() => expect(topicToasts().map((item) => item.text)).toEqual(['Listening stopped.']));
    expect(seen.flat()).toContain('Trying to stop listening again…');
    expect(seen.filter((texts) => texts.length === 0)).toEqual([]);
    await waitFor(() => expect(document.activeElement).toBe(main()), { timeout: 2000 });
  });

  it('takes the sentence down when the next press starts listening, and a Retry from it stops nothing', async () => {
    const page = mountBooth(2);
    await coldReadThenStop();
    await waitFor(() => expect(toasts(page)).toHaveLength(1), { timeout: 4000 });
    const [toast] = toasts(page);
    await act(async () => void fireEvent.click(main()));
    await waitFor(() => expect(toasts(page)).toHaveLength(0));
    const calls = page.teleprompterStop.mock.calls.length;
    await act(async () => toast.action?.onAction());
    expect(page.teleprompterStop).toHaveBeenCalledTimes(calls);
  });

  it('does not stop the session a take joined 0.35 s after the refused stop (no claim held, no start made)', async () => {
    const page = mountBooth(1);
    await ready();
    await act(async () => void fireEvent.click(main()));
    await waitFor(() => expect(main().textContent).toBe('Stop'));
    await act(async () => void (await new Promise((resolve) => setTimeout(resolve, 1500))));
    await act(async () => void fireEvent.click(main()));
    await waitFor(() => expect(page.teleprompterStop).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(main().textContent).toMatch(/Record|Stop/));
    await act(async () => void fireEvent.click(screen.getByRole('button', { name: /^Record$/ })));
    const starts = page.teleprompterStart.mock.calls.length;
    await act(async () => void (await new Promise((resolve) => setTimeout(resolve, 2500))));
    // The press joined the running session (no new start) and the automatic retry was not sent under it.
    expect(page.teleprompterStart).toHaveBeenCalledTimes(starts);
    expect(page.teleprompterStop).toHaveBeenCalledTimes(1);
    expect(toasts(page)).toHaveLength(0);
  });

  it("a sentence of an earlier Booth goes when that Booth is left, so a later session's Retry is never its Retry", async () => {
    const page = mountBooth(2);
    await coldReadThenStop();
    await waitFor(() => expect(toasts(page)).toHaveLength(1), { timeout: 4000 });
    const [old] = toasts(page);
    page.view.unmount();
    await act(async () => void page.publish({ phase: 'stopped' }));
    expect(toasts(page)).toHaveLength(0);
    const calls = page.teleprompterStop.mock.calls.length;
    await act(async () => old.action?.onAction());
    expect(page.teleprompterStop).toHaveBeenCalledTimes(calls);
  });

  it("a take the DAW begins elsewhere is not the Booth's: Record says so, and the sentence and its Retry stay for the session that is still open", async () => {
    const page = mountBooth(2);
    await ready();
    await act(async () => void fireEvent.click(main()));
    await waitFor(() => expect(main().textContent).toBe('Stop'));
    await act(async () => void (await new Promise((resolve) => setTimeout(resolve, 1500))));
    await act(async () => void fireEvent.click(main()));
    await waitFor(() => expect(toasts(page)).toHaveLength(1), { timeout: 5000 });
    await act(async () => page.pushTransport({ recording: true }));
    // The page did not adopt it (no Stop button): the take is REAPER's own, the Booth follows nothing, and the open microphone is still the Booth's to close.
    await waitFor(() => expect(document.body.textContent).toMatch(/already recording/i));
    expect(main().textContent).toBe('Record');
    expect(toasts(page)).toHaveLength(1);
  });

  it('says nothing when the Booth is left while the stop is refused (the release is unknown, not failed)', async () => {
    const page = mountBooth(2);
    await coldReadThenStop();
    await waitFor(() => expect(page.teleprompterStop).toHaveBeenCalledTimes(1));
    page.view.unmount();
    // Leaving may send a stop of its own; whatever it sends is not sent again, and its refusal is not said.
    await act(async () => void (await new Promise((resolve) => setTimeout(resolve, 100))));
    const afterLeaving = page.teleprompterStop.mock.calls.length;
    await act(async () => void (await new Promise((resolve) => setTimeout(resolve, 2200))));
    expect(page.teleprompterStop).toHaveBeenCalledTimes(afterLeaving);
    expect(toasts(page)).toHaveLength(0);
  });
});
