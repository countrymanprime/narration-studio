// @vitest-environment jsdom
// Stop keeps the narrator's place (#2251): a take's highlight stays on the last word heard when the take stops, never jumping back to
// the word the take began on, and the next take's session starts there. Going back is the narrator's choice (a click, Start from here).
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../api/hostWindow', () => ({ toggleFullscreen: vi.fn(async () => true), exitFullscreen: vi.fn(async () => {}) }));
vi.mock('../takeTone', async (original) => ({ ...(await original<typeof import('../takeTone')>()), playTakeTone: vi.fn(async () => {}) }));

import type { TeleprompterEvent, TeleprompterStartOptions } from '../../../api/contracts/teleprompter';
import { createOverlayService } from '../../../overlay/overlayService';
import type { NarrationApi, TeleprompterState } from '../../../types';
import { forgetAppTake, skipStartGuard } from '../record/useRecordControl';
import { BoothNextPage } from './BoothNextPage';
import { BoothHost, dawFor, newJournal, pageApi } from './testPage';

beforeEach(() => forgetAppTake());
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  window.localStorage.clear();
});

const IDLE: TeleprompterState = { phase: 'idle', message: '', engine: null, chapter: null, paused: false, coldRead: false, script: null, position: null };
// Chapter One's script as the tracker numbers it: the title's two words, then the three paragraphs of testPage's c1.
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
const heardAt = (read: number): TeleprompterEvent => ({ type: 'position', read, committed: read, status: 'listening', jump: null, skipped: null });

/** A host whose one session the test drives: Start and Stop answer as the host does, and the test sends what the sidecar hears. */
function fakeHost() {
  let state: TeleprompterState = IDLE;
  const states = new Set<(next: TeleprompterState) => void>();
  const events = new Set<(event: TeleprompterEvent) => void>();
  const publish = (next: Partial<TeleprompterState>) => {
    state = { ...state, ...next };
    states.forEach((listener) => listener(state));
  };
  const hear = (event: TeleprompterEvent) => {
    if (event.type === 'position') state = { ...state, position: event };
    events.forEach((listener) => listener(event));
  };
  const teleprompterStart = vi.fn(async (options: TeleprompterStartOptions) => {
    publish({ phase: 'starting', chapter: 'c1', engine: 'whisper', coldRead: Boolean(options.coldRead), position: null });
    publish({ phase: 'running' });
    hear(SCRIPT);
    if (options.startWord) hear(heardAt(options.startWord));
    return { status: 'started' as const };
  });
  const teleprompterStop = vi.fn(async () => {
    if (state.phase === 'running' || state.phase === 'starting') publish({ phase: 'stopped' });
  });
  const teleprompterSaveFlags = vi.fn(async () => []);
  const api: Partial<NarrationApi> = {
    teleprompterStart,
    teleprompterStop,
    teleprompterSaveFlags,
    teleprompterState: async () => state,
    subscribeTeleprompterState: (listener) => {
      states.add(listener);
      return () => states.delete(listener);
    },
    subscribeTeleprompterEvent: (listener) => {
      events.add(listener);
      return () => events.delete(listener);
    },
  };
  return { api, teleprompterStart, teleprompterStop, teleprompterSaveFlags, hear: (event: TeleprompterEvent) => act(() => hear(event)) };
}

function renderPage() {
  const host = fakeHost();
  const daw = dawFor('reaper');
  const recordStart = vi.spyOn(daw, 'recordStart');
  const navigate = vi.fn();
  const overlay = createOverlayService();
  const view = render(
    <BoothHost api={pageApi({ passageMapRecordRun: async () => {}, ...host.api } as Partial<NarrationApi>)} daw={daw} journal={newJournal()} overlay={overlay}>
      <BoothNextPage hasManuscript navigate={navigate} />
    </BoothHost>,
  );
  return { ...host, view, recordStart, navigate, overlay };
}

const settle = () => act(async () => void (await new Promise((resolve) => setTimeout(resolve, 0))));
const ready = async () => {
  await screen.findByText('Nobody', { exact: false });
  await waitFor(() => expect((screen.getByRole('button', { name: /^Record$/ }) as HTMLButtonElement).disabled).toBe(false));
};
const currentPlace = () => {
  const word = document.querySelector<HTMLElement>('[data-current]');
  return `${word?.closest<HTMLElement>('[data-paragraph]')?.dataset.paragraph}:${word?.closest<HTMLElement>('[data-unit]')?.dataset.unit}`;
};
// The highlight walks to a heard word a step at a time (usePacedCursor, 45 ms a step): long enough for it to arrive.
const arrive = () => act(async () => void (await new Promise((resolve) => setTimeout(resolve, 600))));
const recordButton = () => screen.getByRole('button', { name: /^Record$/ });
const stopButton = () => screen.getByRole('button', { name: /^Stop$/ });
const press = async (button: HTMLElement) => {
  skipStartGuard();
  await act(async () => void fireEvent.click(button));
  await settle();
};

describe('stop-keeps-the-place', () => {
  it('a take that read on and stopped keeps the highlight on the last word heard, not the word it began on', async () => {
    const page = renderPage();
    await ready();
    const began = currentPlace();
    await press(recordButton());
    await waitFor(() => expect(stopButton()).toBeTruthy());
    await page.hear(heardAt(20));
    // Script word 20 is in p2: the title has 2 words and p1 has 11.
    await waitFor(() => expect(currentPlace()).toMatch(/^p2:/));
    const heard = currentPlace();
    await press(stopButton());
    await waitFor(() => expect(recordButton()).toBeTruthy());
    expect(page.teleprompterStop).toHaveBeenCalled();
    await settle();
    expect(currentPlace()).toBe(heard);
    expect(currentPlace()).not.toBe(began);
  });

  it('the next take starts listening where the last one stopped', async () => {
    const page = renderPage();
    await ready();
    await press(recordButton());
    await waitFor(() => expect(stopButton()).toBeTruthy());
    await page.hear(heardAt(30));
    await waitFor(() => expect(currentPlace()).toMatch(/^p3:/));
    await arrive();
    // p3 begins at script word 26 (the title's 2 words, p1's 11, p2's 13): the word shown when Stop is pressed.
    const shown = 26 + Number(document.querySelector<HTMLElement>('[data-current]')?.dataset.word);
    await press(stopButton());
    await waitFor(() => expect(recordButton()).toBeTruthy());
    await press(recordButton());
    await waitFor(() => expect(page.teleprompterStart).toHaveBeenCalledTimes(2));
    expect(page.teleprompterStart.mock.calls[1][0]).toMatchObject({ startWord: shown });
    expect(shown).toBeGreaterThan(26);
  });

  it('going back is the narrator choosing a word: a click after the stop moves the place there', async () => {
    const page = renderPage();
    await ready();
    await press(recordButton());
    await waitFor(() => expect(stopButton()).toBeTruthy());
    await page.hear(heardAt(30));
    await waitFor(() => expect(currentPlace()).toMatch(/^p3:/));
    await press(stopButton());
    await waitFor(() => expect(recordButton()).toBeTruthy());
    const target = document.querySelector<HTMLElement>('[data-paragraph="p1"] [data-word="2"]')!;
    await act(async () => void fireEvent.click(target));
    expect(currentPlace()).toMatch(/^p1:/);
  });
});
