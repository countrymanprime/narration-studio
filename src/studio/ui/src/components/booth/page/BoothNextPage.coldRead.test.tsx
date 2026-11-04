// @vitest-environment jsdom
// A cold read (#2251 item 13): the Booth follows the narrator's voice with a ghost, records nothing, and the real cursor never moves
// because of it. Only the toggle, a take or leaving the Booth ends it.
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../api/hostWindow', () => ({ toggleFullscreen: vi.fn(async () => true), exitFullscreen: vi.fn(async () => {}) }));
vi.mock('../takeTone', async (original) => ({ ...(await original<typeof import('../takeTone')>()), playTakeTone: vi.fn(async () => {}) }));

import type { TeleprompterEvent, TeleprompterStartOptions } from '../../../api/contracts/teleprompter';
import { currentPageContext, type PageItem } from '../../../input/pageCommands';
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

function renderPage(setup: Parameters<typeof dawFor>[0] = 'reaper') {
  const host = fakeHost();
  const daw = dawFor(setup);
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
// The main button: Record, or, once the side menu picked Cold read, Cold read (Stop while one listens).
const main = () => document.getElementById('brec') as HTMLButtonElement;
const mainName = () => main().textContent;
const chooseCold = async () => {
  await act(async () => void fireEvent.click(screen.getByRole('button', { name: 'Levels' })));
  const group = await screen.findByRole('radiogroup', { name: 'Main button' });
  await act(async () => void fireEvent.click(within(group).getByRole('radio', { name: 'Cold read' })));
  await act(async () => void fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape', code: 'Escape' }));
  await waitFor(() => expect(screen.queryByRole('radiogroup', { name: 'Main button' })).toBeNull());
};
const pressToggle = async () => {
  if (mainName() === 'Record') await chooseCold();
  await act(async () => void fireEvent.click(main()));
  await settle();
};
const ghost = () => document.querySelector<HTMLElement>('[data-ghost]');
const currentWord = () => {
  const word = document.querySelector<HTMLElement>('[data-current]');
  return `${word?.closest<HTMLElement>('[data-unit]')?.dataset.unit}:${word?.dataset.word}`;
};
const item = (id: string): PageItem | undefined => currentPageContext()?.items.find((entry) => entry.id === id);

describe('cold-read-is-off-by-default-and-starts-from-the-real-cursor', () => {
  it('draws Record, with no cold read choice made and no microphone badge, until the side menu picks Cold read and the button is pressed', async () => {
    const page = renderPage();
    await ready();
    expect(mainName()).toBe('Record');
    expect(screen.queryByRole('button', { name: 'Cold read' })).toBeNull();
    await chooseCold();
    expect(mainName()).toBe('Cold read');
    expect(page.teleprompterStart).not.toHaveBeenCalled();
    expect(screen.queryByText('Mic on · cold read')).toBeNull();
    expect(ghost()).toBeNull();
  });

  it('asks the host for a cold read with the engine chosen in Settings, from the real cursor, and shows the microphone is on', async () => {
    const page = renderPage();
    await ready();
    await pressToggle();
    expect(page.teleprompterStart).toHaveBeenCalledTimes(1);
    expect(page.teleprompterStart.mock.calls[0][0]).toMatchObject({ chapter: 'c1', coldRead: true, engine: 'whisper' });
    await waitFor(() => expect(mainName()).toBe('Stop'));
    expect(screen.getByText('Mic on · cold read')).toBeTruthy();
    expect(screen.queryByText('REC')).toBeNull();
    expect(page.recordStart).not.toHaveBeenCalled();
  });
});

describe('the-ghost-follows-the-voice-and-the-real-cursor-stays', () => {
  it('draws the ghost where it hears the narrator and never moves the real cursor, the progress line or the take', async () => {
    const page = renderPage();
    await ready();
    const before = currentWord();
    const progress = document.querySelector('#bprog')?.textContent;
    await pressToggle();
    await page.hear(heardAt(20));
    // The cursor walks to the word it heard (usePacedCursor), so the ghost arrives over a few frames.
    await waitFor(() => expect(ghost()?.closest('[data-paragraph]')?.getAttribute('data-paragraph')).toBe('p2'));
    await page.hear(heardAt(30));
    await waitFor(() => expect(ghost()!.closest('[data-paragraph]')?.getAttribute('data-paragraph')).toBe('p3'));
    expect(currentWord()).toBe(before);
    expect(document.querySelector('#bprog')?.textContent).toBe(progress);
  });

  it('keeps the flags it hears out of the suspected lines', async () => {
    const page = renderPage();
    await ready();
    await pressToggle();
    await page.hear({ type: 'flag', id: 1, kind: 'skipped', start: 3, end: 6, heard: '' });
    await pressToggle();
    await settle();
    expect(page.teleprompterSaveFlags).not.toHaveBeenCalled();
  });

  it('a click on a word moves the real cursor, not the ghost, and sends the cold read nowhere', async () => {
    const page = renderPage();
    await ready();
    await pressToggle();
    await page.hear(heardAt(20));
    await waitFor(() => expect(ghost()).toBeTruthy());
    const ghostBefore = ghost()!.textContent;
    const target = document.querySelector<HTMLElement>('[data-paragraph="p3"] [data-word="1"]')!;
    await act(async () => void fireEvent.click(target));
    expect(document.querySelector('[data-paragraph="p3"] [data-current]')).toBeTruthy();
    expect(ghost()!.textContent).toBe(ghostBefore);
  });
});

describe('only-the-toggle-a-take-or-leaving-ends-it', () => {
  it('a second press ends it and the ghost goes', async () => {
    const page = renderPage();
    await ready();
    await pressToggle();
    await page.hear(heardAt(20));
    await waitFor(() => expect(ghost()).toBeTruthy());
    await pressToggle();
    expect(page.teleprompterStop).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(ghost()).toBeNull());
    expect(mainName()).toBe('Cold read');
    expect(screen.queryByText('Mic on · cold read')).toBeNull();
  });

  it('keeps listening past the end of the chapter', async () => {
    const page = renderPage();
    await ready();
    await pressToggle();
    await page.hear({ type: 'position', read: 36, committed: 36, status: 'done', jump: null, skipped: null });
    await settle();
    expect(page.teleprompterStop).not.toHaveBeenCalled();
    expect(mainName()).toBe('Stop');
  });

  it('the jump menu picks the Cold read mode and starts one: the button reads Stop, and pressing it ends the cold read and leaves the mode on Cold read', async () => {
    const page = renderPage();
    await ready();
    expect(mainName()).toBe('Record');
    await act(async () => void item('booth.cold-read')!.run());
    await settle();
    expect(page.teleprompterStart.mock.calls[0][0]).toMatchObject({ coldRead: true });
    await waitFor(() => expect(mainName()).toBe('Stop'));
    expect(page.recordStart).not.toHaveBeenCalled();
    await act(async () => void fireEvent.click(main()));
    await settle();
    expect(page.teleprompterStop).toHaveBeenCalledTimes(1);
    expect(mainName()).toBe('Cold read');
    // The take is the other choice: nothing recorded so far, and Record is a pick away.
    expect(page.recordStart).not.toHaveBeenCalled();
  });

  it("the choice is the Booth visit's: a Booth opened again reads Record, so a lone Space records", async () => {
    renderPage();
    await ready();
    await chooseCold();
    expect(mainName()).toBe('Cold read');
    cleanup();
    renderPage();
    await ready();
    expect(mainName()).toBe('Record');
  });

  it('shows the cold-read mode unmistakably: the cold tone, and a hint that names Space and says nothing is recorded', async () => {
    renderPage();
    await ready();
    await chooseCold();
    expect(main().className).toContain('border-[var(--info)]');
    await act(async () => void main().focus());
    expect((await screen.findAllByText(/Start a cold read \(Space\)\. Nothing is recorded\./)).length).toBeGreaterThan(0);
  });

  it("does not blame Record for a cold read: with the recorder unavailable, the footer sentence is Record's only, and a cold read still starts", async () => {
    const page = renderPage('reaper-off');
    await screen.findByText('Nobody', { exact: false });
    await waitFor(() => expect(document.getElementById('brec-why')?.textContent).toBeTruthy());
    await chooseCold();
    expect(mainName()).toBe('Cold read');
    expect(document.getElementById('brec-why')?.textContent ?? '').toBe('');
    expect(main().getAttribute('aria-disabled')).toBeNull();
    await act(async () => void fireEvent.click(main()));
    await settle();
    expect(page.teleprompterStart.mock.calls[0][0]).toMatchObject({ coldRead: true });
  });

  it('with the mode on Cold read, Space starts the cold read instead of a take, and Space again stops it', async () => {
    const page = renderPage();
    await ready();
    await chooseCold();
    await act(async () => void fireEvent.keyDown(document.body, { key: ' ', code: 'Space' }));
    await settle();
    expect(page.teleprompterStart.mock.calls[0][0]).toMatchObject({ coldRead: true });
    expect(page.recordStart).not.toHaveBeenCalled();
    await waitFor(() => expect(mainName()).toBe('Stop'));
    await act(async () => void fireEvent.keyDown(document.body, { key: ' ', code: 'Space' }));
    await settle();
    expect(page.teleprompterStop).toHaveBeenCalledTimes(1);
    expect(mainName()).toBe('Cold read');
  });

  it('with the mode back on Record, the button records again', async () => {
    const page = renderPage();
    await ready();
    await chooseCold();
    await act(async () => void fireEvent.click(screen.getByRole('button', { name: 'Levels' })));
    const group = await screen.findByRole('radiogroup', { name: 'Main button' });
    await act(async () => void fireEvent.click(within(group).getByRole('radio', { name: 'Record' })));
    await act(async () => void fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape', code: 'Escape' }));
    await waitFor(() => expect(mainName()).toBe('Record'));
    expect(page.teleprompterStart).not.toHaveBeenCalled();
  });

  it('Escape leaves without a question and ends it', async () => {
    const page = renderPage();
    await ready();
    await pressToggle();
    await act(async () => void fireEvent.keyDown(document.body, { key: 'Escape', code: 'Escape' }));
    await settle();
    expect(page.overlay.getSnapshot().dialogs).toHaveLength(0);
    expect(page.teleprompterStop).toHaveBeenCalled();
    expect(page.navigate).toHaveBeenCalled();
  });

  it('leaving the Booth any other way ends it', async () => {
    const page = renderPage();
    await ready();
    await pressToggle();
    page.view.unmount();
    expect(page.teleprompterStop).toHaveBeenCalled();
  });
});

describe('cold-read-in-the-jump-menu', () => {
  it('offers Start cold read, then Stop cold read, and is off during a take', async () => {
    const page = renderPage();
    await ready();
    expect(item('booth.cold-read')?.label).toBe('Start cold read');
    await act(async () => item('booth.cold-read')!.run());
    await settle();
    expect(page.teleprompterStart).toHaveBeenCalledWith(expect.objectContaining({ coldRead: true }));
    await waitFor(() => expect(item('booth.cold-read')?.label).toBe('Stop cold read'));
    await act(async () => item('booth.cold-read')!.run());
    await settle();
    await waitFor(() => expect(item('booth.cold-read')?.label).toBe('Start cold read'));
    // The jump menu left the mode on Cold read: Record is the other choice in the side menu.
    await act(async () => void fireEvent.click(screen.getByRole('button', { name: 'Levels' })));
    const group = await screen.findByRole('radiogroup', { name: 'Main button' });
    await act(async () => void fireEvent.click(within(group).getByRole('radio', { name: 'Record' })));
    await act(async () => void fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape', code: 'Escape' }));
    await waitFor(() => expect(mainName()).toBe('Record'));
    skipStartGuard();
    await act(async () => void fireEvent.click(screen.getByRole('button', { name: /^Record$/ })));
    await waitFor(() => expect(page.recordStart).toHaveBeenCalled());
    await waitFor(() => expect(item('booth.cold-read')?.disabledReason).toBe('Not while recording. Stop the take first.'));
  });
});
