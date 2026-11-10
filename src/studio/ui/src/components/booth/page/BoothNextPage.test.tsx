// @vitest-environment jsdom
import * as checkRecordings from '../../recordingcheck/openCheckRecordings';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useLocation, useNavigate } from 'react-router-dom';
import { afterEach, describe, expect, it, vi, beforeEach } from 'vitest';

const host = vi.hoisted(() => ({ toggleFullscreen: vi.fn(async () => true), exitFullscreen: vi.fn(async () => {}) }));
vi.mock('../../../api/hostWindow', () => host);
const tone = vi.hoisted(() => ({ order: [] as string[], gate: null as Promise<void> | null }));
vi.mock('../takeTone', async (original) => {
  const actual = await original<typeof import('../takeTone')>();
  return {
    ...actual,
    playTakeTone: vi.fn(async () => {
      tone.order.push('tone');
      await tone.gate;
    }),
  };
});

import type { Bookmark } from '../../../api/contracts/bookmarks';
import type { DawActionKind, DawCapabilities, DawResult } from '../../../api/contracts/daw';
import type { ManuscriptChapter } from '../../../api/contracts/manuscript';
import type { Mark, Marks } from '../../../api/contracts/marks';
import type { PickupItem, PickupList } from '../../../api/contracts/pickups';
import { DAW_SETUPS, type DawSetupId } from '../../../fixtures/daw';
import { createOverlayService } from '../../../overlay/overlayService';
import { createMockDawClient, type DawClient } from '../../../ports/daw';
import type { MeasurementsPort } from '../../../ports/measurements';
import { createMockMeasurements } from '../../../ports/measurements';
import { PortOverrides } from '../../../ports/usePort';
import type { GuideDialogueCue } from '../../../api/contracts/storyBible';
import type { TeleprompterEvent } from '../../../api/contracts/teleprompter';
import type { NarrationApi, TeleprompterState } from '../../../types';
import { TEXT_PREFS_STORAGE_KEY } from '../../script/page/tools/text/readerText';
import { BoothNextPage } from './BoothNextPage';
import { EnginePanelProvider } from '../../engine/EnginePanelContext';
import { BOOTH_SIZE_STORAGE_KEY } from './boothSize';
import { BoothHost, creditsChapter, dawFor, LOCATED, newJournal, pageApi } from './testPage';
import { forgetAppTake, skipStartGuard } from '../record/useRecordControl';
import { createJournal, type Journal } from '../../../studio/journal/createJournal';

// A take one test leaves running is not the next test's.
beforeEach(() => forgetAppTake());

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
  window.localStorage.clear();
});

type Options = {
  setup?: DawSetupId;
  daw?: DawClient;
  search?: string;
  api?: Partial<NarrationApi>;
  hasManuscript?: boolean;
  measurements?: MeasurementsPort;
  /** The shell's journal; by default one whose DAW cannot tell its last action. */
  journal?: (daw: DawClient) => Journal;
};

/** A DAW that records but whose roll replaces audio: it asks first (the mock's Audacity without backups). */
const destructive = (): DawClient => {
  const base = DAW_SETUPS.reaper;
  const setup: DawCapabilities = {
    ...base,
    daw: 'Audacity',
    capabilities: { ...base.capabilities, punch: { level: 'experimental' as const, available: true, destructive: true } },
  };
  return createMockDawClient(setup, { chapterIds: ['c1'], candidateIds: [], findingIds: [] });
};

function spied(daw: DawClient) {
  return {
    ...daw,
    recordStart: vi.fn(daw.recordStart),
    recordStop: vi.fn(daw.recordStop),
    roll: vi.fn(daw.roll),
    undoLast: vi.fn(daw.undoLast),
  };
}

function renderPage({ setup = 'reaper', daw: given, search, api: over = {}, hasManuscript = true, measurements, journal: journalFor }: Options = {}) {
  const openEnginePanel = vi.fn();
  const passageMapRecordRun = vi.fn(async () => {});
  const teleprompterStop = vi.fn(async () => {});
  const api = pageApi({ passageMapRecordRun, teleprompterStop, ...over } as Partial<NarrationApi>);
  const daw = spied(given ?? dawFor(setup));
  const journal = journalFor?.(daw) ?? newJournal();
  const overlay = createOverlayService();
  const navigate = vi.fn();
  const view = render(
    <BoothHost api={api} daw={daw} journal={journal} overlay={overlay} search={search}>
      <PortOverrides clients={measurements ? { daw, measurements } : { daw }}>
        <EnginePanelProvider value={openEnginePanel}>
          <BoothNextPage hasManuscript={hasManuscript} navigate={navigate} />
        </EnginePanelProvider>
      </PortOverrides>
      <Driver />
    </BoothHost>,
  );
  const dialog = () =>
    overlay.getSnapshot().dialogs[0] as { spec: { title: string; body: string; confirmLabel: string }; answer: (yes: boolean) => void } | undefined;
  return { view, daw, journal, overlay, navigate, openEnginePanel, dialog, passageMapRecordRun, teleprompterStop };
}

/** The router, from inside it: what the address is and a way to change it, as a link elsewhere in the app would. */
const driver = { go: (_to: string): void => undefined, search: (): string => '' };
function Driver() {
  const navigateTo = useNavigate();
  const location = useLocation();
  driver.go = (to) => void navigateTo(to);
  driver.search = () => location.search;
  return null;
}

// A key press is a narrator's, never the double-fire the start guard ignores (the guard has its own tests in record/recordBuiltIn.test.tsx).
const press = (key: string, code = key, init: KeyboardEventInit = {}, target: Element = document.body) =>
  act(() => {
    skipStartGuard();
    fireEvent.keyDown(target, { key, code, ...init });
  });
const space = () => press(' ', 'Space');
const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
const ready = async () => {
  await screen.findByText('Nobody', { exact: false });
  await waitFor(() => expect((screen.getByRole('button', { name: /^Record$/ }) as HTMLButtonElement).disabled).toBe(false));
};
const record = async (page: ReturnType<typeof renderPage>) => {
  await ready();
  await space();
  await waitFor(() => expect(screen.getByRole('button', { name: /^Stop$/ })).toBeTruthy());
  expect(page.daw.recordStart).toHaveBeenCalledTimes(1);
};
const current = () => document.querySelector<HTMLElement>('[data-state="cur"]')?.dataset.unit;

describe('the-page-asks-for-a-manuscript-first', () => {
  it('asks for a manuscript when there is none', () => {
    renderPage({ hasManuscript: false });
    expect(screen.getByText('This project has no manuscript yet. Import one to begin.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Record$/ })).toBeNull();
  });
});

describe('record-waits-for-the-live-model', () => {
  it('asks for the missing model first and records nothing while it is asked', async () => {
    const assetsList = vi.fn(async () => ({
      cacheRoot: 'C:/cache',
      defaultRoot: 'C:/cache',
      custom: false,
      previousRoot: '',
      folderNote: '',
      totalInstalledBytes: 0,
      assets: [
        {
          kind: 'whisper',
          kindLabel: 'Whisper model',
          id: 'tiny',
          displayName: 'Whisper tiny',
          version: '1',
          publisher: 'p',
          license: 'MIT',
          licenseUrl: 'https://example.test/l',
          modelCardUrl: 'https://example.test/m',
          provenanceUrl: 'https://example.test/p',
          attribution: 'a',
          downloadSize: 78_000_000,
          diskSize: 80_000_000,
          installState: 'not_installed' as const,
          path: 'C:/models',
          installedAt: '',
          verifiedAt: '',
          activeJobId: '',
        },
      ],
    }));
    const page = renderPage({ api: { assetsList } as Partial<NarrationApi> });
    await ready();
    await space();
    await settle();
    await waitFor(() => expect(assetsList).toHaveBeenCalled());
    await settle();
    expect(page.daw.recordStart).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: /^Stop$/ })).toBeNull();
  });
});

describe('space-records-and-stops-and-nothing-else-records', () => {
  it('Space records and stops through the Record control', async () => {
    const page = renderPage();
    await record(page);
    expect(page.daw.recordStart).toHaveBeenCalledWith('c1', undefined);
    expect(screen.getByText('REC')).toBeTruthy();
    await space();
    await waitFor(() => expect(page.daw.recordStop).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(page.passageMapRecordRun).toHaveBeenCalledTimes(1));
    expect(page.passageMapRecordRun.mock.calls[0]).toMatchObject(['c1', [{ kind: 'start', pid: 'p1' }, { kind: 'stop' }]]);
  });

  it('plays the start tone before the take starts, and none to stop it', async () => {
    tone.order = [];
    const page = renderPage();
    const begin = page.daw.recordStart.getMockImplementation()!;
    page.daw.recordStart.mockImplementation(async (...args) => {
      tone.order.push('start');
      return begin(...args);
    });
    await record(page);
    expect(tone.order).toEqual(['tone', 'start']);
    await space();
    await waitFor(() => expect(page.daw.recordStop).toHaveBeenCalledTimes(1));
    expect(tone.order).toEqual(['tone', 'start']);
  });

  it('holds the take until the tone has ended', async () => {
    let release = () => {};
    tone.gate = new Promise<void>((resolve) => (release = resolve));
    const page = renderPage();
    await ready();
    await space();
    await settle();
    expect(page.daw.recordStart).not.toHaveBeenCalled();
    release();
    tone.gate = null;
    await waitFor(() => expect(page.daw.recordStart).toHaveBeenCalledTimes(1));
  });

  it('says the take ended in a status region once it stops, and nothing while it records', async () => {
    const page = renderPage();
    await record(page);
    expect(screen.getByRole('status', { name: 'Take status' }).textContent).toBe('');
    await space();
    await waitFor(() => expect(page.daw.recordStop).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByRole('status', { name: 'Take status' }).textContent).toMatch(/^Stopped\. Recorded \d\d:\d\d\.$/));
    await space();
    await waitFor(() => expect(page.daw.recordStart).toHaveBeenCalledTimes(2));
    expect(screen.getByRole('status', { name: 'Take status' }).textContent).toBe('');
  });

  // R is no longer in this list: Punch and roll now starts a take when none runs (next test). A pedal still sends only Space (ruling CF-4).
  // Enter and numpad Enter record too, by the owner's request (#3039): they have their own describe below. A pedal still sends only Space.
  it('a pedal only starts and stops: no other key records, rolls or flags', async () => {
    const page = renderPage();
    await ready();
    for (const [key, code] of [
      ['f', 'KeyF'],
      ['p', 'KeyP'],
      ['ArrowDown', 'ArrowDown'],
      ['n', 'KeyN'],
    ])
      await press(key, code);
    await settle();
    expect(page.daw.recordStart).not.toHaveBeenCalled();
    expect(page.daw.roll).not.toHaveBeenCalled();
    // A USB pedal set to Space is a keyboard Space: the one recording key.
    await space();
    await waitFor(() => expect(page.daw.recordStart).toHaveBeenCalledTimes(1));
  });

  it('R before any take starts one in the same press, without a roll', async () => {
    const page = renderPage();
    await ready();
    await press('r', 'KeyR');
    await waitFor(() => expect(page.daw.recordStart).toHaveBeenCalledTimes(1));
    expect(page.daw.roll).not.toHaveBeenCalled();
  });

  it('a refused precondition says why and starts nothing', async () => {
    const page = renderPage({ setup: 'reaper-off' });
    await screen.findByText('Nobody', { exact: false });
    const button = await screen.findByRole('button', { name: /^Record$/ });
    await waitFor(() => expect(button.getAttribute('aria-disabled')).toBe('true'));
    expect(button.getAttribute('aria-describedby')).toBe('brec-why');
    await space();
    expect(page.daw.recordStart).not.toHaveBeenCalled();
    // The press is answered in front of the narrator, never only by the footer's sentence.
    await waitFor(() => expect(screen.queryByRole('dialog') ?? page.overlay.getSnapshot().toasts[0]).toBeTruthy());
  });
});

describe('every-way-out-asks-while-recording', () => {
  it('Escape asks "Stop recording?"; Escape again with the question open answers it, Keep recording, and the take goes on', async () => {
    const page = renderPage();
    await record(page);
    await press('Escape');
    expect(page.overlay.getSnapshot().dialogs).toHaveLength(1);
    await press('Escape');
    await settle();
    expect(page.overlay.getSnapshot().dialogs).toHaveLength(0);
    expect(page.daw.recordStop).not.toHaveBeenCalled();
    expect(screen.getByText('REC')).toBeTruthy();
  });

  it('Escape asks "Stop recording?" once; Keep recording changes nothing', async () => {
    const page = renderPage();
    await record(page);
    await press('Escape');
    expect(page.overlay.getSnapshot().dialogs).toHaveLength(1);
    expect(page.dialog()?.spec.title).toBe('Stop recording?');
    expect(page.dialog()?.spec.body).toBe('REAPER is recording. Leaving the Booth stops it.');
    // The question holds the take while it is open.
    expect(screen.getByText('REC · reading paused')).toBeTruthy();
    await act(async () => page.dialog()!.answer(false));
    await settle();
    expect(page.daw.recordStop).not.toHaveBeenCalled();
    expect(page.navigate).not.toHaveBeenCalled();
    expect(screen.getByText('REC')).toBeTruthy();
  });

  it('the question opens with focus on Keep recording, and closes with focus where it was, never on a chapter arrow', async () => {
    for (const closeWith of ['Escape', 'Keep recording']) {
      const page = renderPage();
      await record(page);
      expect(document.activeElement).toBe(document.body);
      await press('Escape');
      const dialog = await screen.findByRole('alertdialog');
      await waitFor(() => expect(document.activeElement).toBe(within(dialog).getByRole('button', { name: 'Keep recording' })));
      if (closeWith === 'Escape') await press('Escape');
      else await act(async () => void (await userEvent.click(within(dialog).getByRole('button', { name: 'Keep recording' }))));
      await settle();
      await waitFor(() => expect(page.overlay.getSnapshot().dialogs).toHaveLength(0));
      // Enter on whatever has focus now must not change the chapter mid-take.
      expect(document.activeElement).not.toBe(screen.getByRole('button', { name: /previous chapter/i }));
      expect(document.activeElement).not.toBe(screen.getByRole('button', { name: /next chapter/i }));
      expect(document.activeElement === document.body || document.activeElement?.tagName === 'MAIN').toBe(true);
      // The take goes on and Space still stops it with the question closed.
      expect(page.daw.recordStop).not.toHaveBeenCalled();
      await space();
      await waitFor(() => expect(page.daw.recordStop).toHaveBeenCalledTimes(1));
      cleanup();
    }
  });

  it('Stop and leave stops the recording the app started, writes the passage map and then leaves', async () => {
    const page = renderPage();
    await record(page);
    await press('Escape');
    await act(async () => page.dialog()!.answer(true));
    await waitFor(() => expect(page.navigate).toHaveBeenCalledWith('/script'));
    expect(page.daw.recordStop).toHaveBeenCalledTimes(1);
    expect(page.passageMapRecordRun).toHaveBeenCalledTimes(1);
  });

  it('the setup chip opens the Audio engine panel, as the header chip does, and leaves the take running', async () => {
    const page = renderPage();
    await record(page);
    await userEvent.click(screen.getByRole('button', { name: 'Recording setup: REAPER' }));
    expect(page.openEnginePanel).toHaveBeenCalledTimes(1);
    expect(page.dialog()).toBeUndefined();
    expect(page.navigate).not.toHaveBeenCalled();
    expect(page.daw.recordStop).not.toHaveBeenCalled();
  });

  it('the shell asks before the nav, Back, Forward, Alt+Arrow or a chapter opened in Script; its Yes stops the take as the page goes', async () => {
    const page = renderPage();
    expect(page.journal.checkLeave('/proof')).toBe('allow');
    await record(page);
    for (const path of ['/proof', '/script']) expect(page.journal.checkLeave(path)).toEqual({ ask: expect.objectContaining({ title: 'Stop recording?' }) });
    // The shell asked and the narrator said yes: the shell moves and the page goes.
    page.view.unmount();
    await waitFor(() => expect(page.daw.recordStop).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(page.passageMapRecordRun).toHaveBeenCalledTimes(1));
  });

  it('a chapter asked for in the address during a take asks first; Keep recording stays, Stop and leave changes chapter', async () => {
    const page = renderPage();
    await record(page);
    await act(async () => driver.go('/booth?chapter=c2'));
    await waitFor(() => expect(page.dialog()?.spec.title).toBe('Stop recording?'));
    await act(async () => page.dialog()!.answer(false));
    await settle();
    expect(page.daw.recordStop).not.toHaveBeenCalled();
    expect(driver.search()).toBe('?chapter=c1');
    expect(screen.getByText('Nobody', { exact: false })).toBeTruthy();
    await act(async () => driver.go('/booth?chapter=c2'));
    await waitFor(() => expect(page.dialog()).toBeTruthy());
    await act(async () => page.dialog()!.answer(true));
    await screen.findByText('court.', { exact: false });
    expect(page.daw.recordStop).toHaveBeenCalledTimes(1);
    expect(page.passageMapRecordRun).toHaveBeenCalledTimes(1);
  });

  it('with nothing recording, leaving needs no question', async () => {
    const page = renderPage();
    await ready();
    await press('Escape');
    expect(page.overlay.getSnapshot().dialogs).toHaveLength(0);
    expect(page.navigate).toHaveBeenCalledWith('/script');
  });
});

describe('a-built-in-take-is-guarded-too', () => {
  // The built-in recorder records through the DAW port like any engine (the host answers recordStart with the recorder behind it), so the
  // page asks the port once and needs no track; what the recorder does with a microphone is the host's tests'.
  it('records with the built-in recorder; leaving asks, and unmounting without the answer does not stop the take', async () => {
    const page = renderPage({ setup: 'builtin' });
    await ready();
    await space();
    await waitFor(() => expect(screen.getByRole('button', { name: /^Stop$/ })).toBeTruthy());
    expect(page.daw.recordStart).toHaveBeenCalledTimes(1);
    expect(page.daw.recordStart).toHaveBeenCalledWith('c1', undefined);
    await press('Escape');
    expect(page.dialog()?.spec.body).toBe('The built-in recorder is recording. Leaving the Booth stops it.');
    await act(async () => page.dialog()!.answer(false));
    page.view.unmount();
    await settle();
    expect(page.daw.recordStop).not.toHaveBeenCalled();
  });

  // The app's own recorder has no pre-roll to load the speech model in, and keeps its file from the first instant: it starts once listening has.
  it('starts the built-in recorder only once listening has started', async () => {
    let listening = (_value: { status: 'started' }) => {};
    const teleprompterStart = vi.fn(() => new Promise<{ status: 'started' }>((resolve) => (listening = resolve)));
    const settingsForScope = async () => ({
      Teleprompter: [{ key: 'input_device', label: 'Microphone', kind: 'text', value: 'USB Mic', effectiveValue: 'USB Mic', isSet: true }],
    });
    // The microphone chosen in settings is one the recorder lists: Record does not begin on one that is unplugged (#2810).
    const recorderDevices = async () => ({ devices: [{ name: 'USB Mic' }], error: null });
    const page = renderPage({ setup: 'builtin', api: { settingsForScope, teleprompterStart, recorderDevices } as never });
    await ready();
    await space();
    await waitFor(() => expect(teleprompterStart).toHaveBeenCalledTimes(1));
    await settle();
    expect(page.daw.recordStart).not.toHaveBeenCalled();
    await act(async () => listening({ status: 'started' }));
    await waitFor(() => expect(page.daw.recordStart).toHaveBeenCalledTimes(1));
  });

  it('"Stop and leave" stops the take through the port before the Booth goes', async () => {
    const page = renderPage({ setup: 'builtin' });
    await ready();
    await space();
    await waitFor(() => expect(screen.getByRole('button', { name: /^Stop$/ })).toBeTruthy());
    await press('Escape');
    await act(async () => page.dialog()!.answer(true));
    await waitFor(() => expect(page.daw.recordStop).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(page.navigate).toHaveBeenCalled());
  });
});

describe('a-reading-only-session-keeps-running', () => {
  const running: TeleprompterState = { phase: 'running', message: '', engine: 'whisper', chapter: 'c1', script: null, position: null };

  it('the nav leaves a listening session running; Exit asks "Stop reading?" and stops it', async () => {
    const page = renderPage({ api: { teleprompterState: async () => running } });
    await screen.findByText('Nobody', { exact: false });
    await settle();
    expect(page.journal.checkLeave('/proof')).toBe('allow');
    await press('Escape');
    expect(page.dialog()?.spec.title).toBe('Stop reading?');
    await act(async () => page.dialog()!.answer(true));
    await waitFor(() => expect(page.navigate).toHaveBeenCalledWith('/script'));
    expect(page.teleprompterStop).toHaveBeenCalled();
    expect(page.daw.recordStop).not.toHaveBeenCalled();
  });
});

describe('keys-register-through-the-catalogue', () => {
  it('down and up step a phrase, left and right a word', async () => {
    renderPage();
    await ready();
    // The chapter title is the first line (#2251 item 7): the reading starts on its first word.
    expect(current()).toBe('0');
    expect(document.querySelector('[data-current]')?.textContent).toBe('Chapter');
    await press('ArrowRight');
    expect(document.querySelector('[data-current]')?.textContent).toBe('One');
    await press('ArrowDown');
    expect(current()).toBe('1');
    await press('ArrowDown');
    expect(current()).toBe('2');
    await press('ArrowUp');
    expect(current()).toBe('1');
    await press('ArrowRight');
    expect(document.querySelector('[data-current]')?.textContent).toBe('Garden');
    await press('ArrowLeft');
    expect(document.querySelector('[data-current]')?.textContent).toBe('The');
  });

  it('a held arrow keeps stepping the word, and a held Down the phrase, but a held Space rolls once', async () => {
    const page = renderPage();
    await ready();
    await press('ArrowDown');
    await press('ArrowRight', 'ArrowRight', { repeat: true });
    await press('ArrowRight', 'ArrowRight', { repeat: true });
    expect(document.querySelector('[data-current]')?.textContent).toBe('was');
    await press('ArrowDown', 'ArrowDown', { repeat: true });
    await press('ArrowDown', 'ArrowDown', { repeat: true });
    expect(current()).toBe('3');
    await press('ArrowUp', 'ArrowUp', { repeat: true });
    expect(current()).toBe('2');
    await space();
    await press(' ', 'Space', { repeat: true });
    await press(' ', 'Space', { repeat: true });
    await settle();
    expect(page.daw.recordStart).toHaveBeenCalledTimes(1);
    expect(page.daw.recordStop).not.toHaveBeenCalled();
  });

  it('ignores keys while typing and with Ctrl held', async () => {
    const page = renderPage();
    await ready();
    const field = document.createElement('input');
    document.body.append(field);
    await press('ArrowDown', 'ArrowDown', {}, field);
    await press(' ', 'Space', {}, field);
    await press(' ', 'Space', { ctrlKey: true });
    await settle();
    expect(current()).toBe('0');
    expect(page.daw.recordStart).not.toHaveBeenCalled();
    field.remove();
  });

  it('+ and - change the text size within 24 to 72', async () => {
    renderPage();
    await ready();
    const text = () => document.querySelector<HTMLElement>('[data-booth-text] > div')!.style.fontSize;
    expect(text()).toBe('40px');
    await press('=', 'Equal');
    expect(text()).toBe('44px');
    for (let i = 0; i < 20; i++) await press('-', 'Minus');
    expect(text()).toBe('24px');
  });
});

describe('escape-closes-the-drawer-then-a-popover-then-exits', () => {
  it('at 1280 and below Escape closes the open drawer before it exits', async () => {
    // The medium layout: the side panel is a drawer and starts closed.
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('1280'), addEventListener: () => {}, removeEventListener: () => {} }));
    const page = renderPage();
    await ready();
    const panel = document.getElementById('booth-side')!;
    expect(panel.hidden).toBe(true);
    await userEvent.click(screen.getByRole('button', { name: /side panel/i }));
    expect(panel.hidden).toBe(false);
    await press('Escape');
    expect(panel.hidden).toBe(true);
    expect(page.navigate).not.toHaveBeenCalled();
    await press('Escape');
    expect(page.navigate).toHaveBeenCalledWith('/script');
    vi.unstubAllGlobals();
  });

  it('a popover takes Escape first; then Escape exits', async () => {
    const page = renderPage();
    await ready();
    await userEvent.click(screen.getByRole('button', { name: /record options/i }));
    const popover = await screen.findByRole('dialog');
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(popover.isConnected).toBe(false));
    expect(page.navigate).not.toHaveBeenCalled();
    await press('Escape');
    expect(page.navigate).toHaveBeenCalledWith('/script');
  });
});

describe('the-take-timer-follows-the-clock', () => {
  const timer = () => document.getElementById('btimer')?.textContent;
  const jump = (seconds: number) => {
    vi.setSystemTime(Date.now() + seconds * 1000);
    act(() => void window.dispatchEvent(new Event('focus')));
  };

  it('keeps counting while the Stop recording question holds the reading, and says only the reading is paused', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const page = renderPage();
    await record(page);
    expect(timer()).toBe('00:00');
    jump(65);
    expect(timer()).toBe('01:05');
    await press('Escape');
    expect(page.dialog()?.spec.title).toBe('Stop recording?');
    expect(screen.getByText('REC · reading paused')).toBeTruthy();
    jump(10);
    // REAPER records on while the question is open: the clock does not stop with the reading.
    expect(timer()).toBe('01:15');
    await act(async () => page.dialog()!.answer(false));
    await settle();
    expect(screen.getByText('REC')).toBeTruthy();
    expect(timer()).toBe('01:15');
  });

  it('shows the true time after the window slept for an hour', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const page = renderPage();
    await record(page);
    jump(3725);
    expect(timer()).toBe('1:02:05');
  });

  it('the next take starts from 00:00', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const page = renderPage();
    await record(page);
    jump(30);
    await space();
    await waitFor(() => expect(page.daw.recordStop).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByRole('button', { name: /^Record$/ })).toBeTruthy());
    await space();
    await waitFor(() => expect(page.daw.recordStart).toHaveBeenCalledTimes(2));
    expect(timer()).toBe('00:00');
  });
});

describe('the-take-is-held-while-a-menu-or-the-confirm-is-open', () => {
  const openMenu = async () => {
    const word = document.querySelector('[data-unit="1"] [data-word]')!;
    await act(async () => {
      fireEvent.contextMenu(word, { button: 2, clientX: 10, clientY: 10 });
    });
    return screen.findByRole('menu');
  };

  it('opening a menu while recording holds the take; Escape lets go', async () => {
    const page = renderPage();
    await record(page);
    const menu = await openMenu();
    await waitFor(() => expect(screen.getByText('REC · reading paused')).toBeTruthy());
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(menu.isConnected).toBe(false));
    await waitFor(() => expect(screen.getByText('REC')).toBeTruthy());
  });

  it('a click outside closes the menu and lets go', async () => {
    const page = renderPage();
    await record(page);
    const menu = await openMenu();
    await userEvent.click(document.body);
    await waitFor(() => expect(menu.isConnected).toBe(false));
    await waitFor(() => expect(screen.getByText('REC')).toBeTruthy());
  });

  it('choosing an item lets go and runs it', async () => {
    const page = renderPage();
    await record(page);
    const menu = await openMenu();
    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Next phrase' }));
    await waitFor(() => expect(screen.getByText('REC')).toBeTruthy());
  });

  it('a menu opened when not recording starts nothing', async () => {
    const page = renderPage();
    await ready();
    await openMenu();
    expect(screen.queryByText('REC · reading paused')).toBeNull();
    expect(page.daw.recordStart).not.toHaveBeenCalled();
  });

  it('a destructive roll asks with the take held; no rolls nothing, yes rolls confirmed', async () => {
    const page = renderPage({ setup: 'reaper', daw: destructive() });
    await record(page);
    await press('r', 'KeyR');
    await waitFor(() => expect(page.dialog()?.spec.title).toBe('Roll again from ¶ 1?'));
    expect(page.dialog()?.spec.body).toBe('Audacity will record over the audio from here, and what it replaces is not kept as a take.');
    expect(screen.getByText('REC · reading paused')).toBeTruthy();
    await act(async () => page.dialog()!.answer(false));
    await waitFor(() => expect(screen.getByText('REC')).toBeTruthy());
    expect(page.daw.roll).not.toHaveBeenCalled();
    await press('r', 'KeyR');
    await waitFor(() => expect(page.dialog()).toBeTruthy());
    await act(async () => page.dialog()!.answer(true));
    await waitFor(() => expect(page.daw.roll).toHaveBeenCalledWith('c1', expect.any(Number), { confirmed: true }));
  });

  it('REAPER rolls without a question and counts the punch', async () => {
    const page = renderPage();
    await record(page);
    await press('ArrowDown');
    await press('r', 'KeyR');
    await waitFor(() => expect(page.daw.roll).toHaveBeenCalledWith('c1', expect.any(Number), { confirmed: false }));
    expect(page.overlay.getSnapshot().dialogs).toHaveLength(0);
    await waitFor(() => expect(screen.getByText(/1 punch\b/)).toBeTruthy());
  });

  it('a roll counts from where the DAW says the take began, not the end of the recording', async () => {
    const base = dawFor('reaper');
    // A plain take that starts where the last one stopped, at 42 s, though the track's recording ends later.
    const daw: DawClient = { ...base, recordStart: async (chapterId, at) => ({ ...(await base.recordStart(chapterId, at)), position: 42 }) };
    const page = renderPage({ daw });
    await record(page);
    await press('ArrowDown');
    await press('r', 'KeyR');
    await waitFor(() => expect(page.daw.roll).toHaveBeenCalled());
    const at = page.daw.roll.mock.calls[0][1];
    expect(at).toBeGreaterThanOrEqual(42);
    expect(at).toBeLessThan(45);
  });

  it('after a take stops, Start from here still starts the next take from the chosen place', async () => {
    const page = renderPage();
    await record(page);
    await space();
    await waitFor(() => expect(screen.getByRole('button', { name: /^Record$/ })).toBeTruthy());
    const word = document.querySelector('[data-unit="3"] [data-word]')!;
    await act(async () => {
      fireEvent.contextMenu(word, { button: 2, clientX: 10, clientY: 10 });
    });
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Start from here' }));
    // Not recording, Start from here moves the place there and starts the take at once (useRoll.startFromHere).
    await waitFor(() => expect(current()).toBe('3'));
    await waitFor(() => expect(page.daw.recordStart).toHaveBeenCalledTimes(2));
    expect(current()).toBe('3');
  });
});

describe('start-from-here-and-record-from-here', () => {
  it('right-click Start from here moves the reading position there and says where the start is while the take is not running', async () => {
    // A lookup that is still out keeps the take from starting: the chip says where it will.
    renderPage({ api: { boothPunchTarget: () => new Promise(() => {}) } });
    await ready();
    // Unit 0 is the chapter title, so the second paragraph's first sentence is unit 3.
    const word = document.querySelector('[data-unit="3"] [data-word]')!;
    await act(async () => {
      fireEvent.contextMenu(word, { button: 2, clientX: 10, clientY: 10 });
    });
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Start from here' }));
    await waitFor(() => expect(current()).toBe('3'));
    expect(screen.getByText('Looking up ¶ 2…')).toBeTruthy();
  });

  it('opening the Booth at a paragraph and offset from Script starts there', async () => {
    renderPage({ search: '?chapter=c1&para=p3&at=28' });
    await ready();
    await waitFor(() => expect(current()).toBe('7'));
    expect(screen.getByText('Starts at ¶ 3')).toBeTruthy();
  });
});

describe('rapid-chapter-steps-are-not-dropped', () => {
  const shown = () => screen.getByRole('button', { name: /^Chapter: / }).getAttribute('aria-label');

  it('three presses of Next in one tick move three chapters, not one', async () => {
    renderPage();
    await ready();
    const start = shown();
    const next = screen.getByRole('button', { name: 'Next chapter' });
    act(() => {
      fireEvent.click(next);
      fireEvent.click(next);
      fireEvent.click(next);
    });
    await waitFor(() => expect(shown()).not.toBe(start));
    await settle();
    const rapid = shown();
    // The same three presses made one at a time end on the same chapter.
    cleanup();
    renderPage();
    await ready();
    for (let i = 0; i < 3; i++) {
      await userEvent.click(screen.getByRole('button', { name: 'Next chapter' }));
      await settle();
    }
    expect(rapid).toBe(shown());
  });

  it('Next then Previous before the chapter loads lands back where it began', async () => {
    renderPage();
    await ready();
    const start = shown();
    act(() => void fireEvent.click(screen.getByRole('button', { name: 'Next chapter' })));
    act(() => void fireEvent.click(screen.getByRole('button', { name: 'Previous chapter' })));
    await settle();
    await waitFor(() => expect(shown()).toBe(start));
  });
});

describe('the-chapter-cannot-change-during-a-take', () => {
  it('the picker and its arrows are disabled while recording', async () => {
    const page = renderPage();
    await ready();
    const picker = screen.getByRole('button', { name: /Chapter: .*Change chapter/ });
    expect((picker as HTMLButtonElement).disabled).toBe(false);
    await record(page);
    // The stepper is off, not a fieldset full of dead buttons: the arrows stay focusable and say why (aria-disabled), and a press changes nothing.
    const next = screen.getByRole('button', { name: 'Next chapter' });
    // The picker is a new element while it is off (its hint's wrapper is the tab stop and says why), so it is read again.
    const off = screen.getByRole('button', { name: /Chapter: .*Change chapter/ });
    expect(off.matches(':disabled') || off.getAttribute('aria-disabled') === 'true' || off.hasAttribute('data-disabled')).toBe(true);
    expect(screen.getByRole('group', { name: 'Not while recording. Stop the take first.' }).tabIndex).toBe(0);
    expect(next.getAttribute('aria-disabled')).toBe('true');
    expect(screen.getByRole('button', { name: 'Previous chapter' }).getAttribute('aria-disabled')).toBe('true');
    const before = picker.getAttribute('aria-label');
    await userEvent.click(next);
    await settle();
    expect(screen.getByRole('button', { name: /Chapter: .*Change chapter/ }).getAttribute('aria-label')).toBe(before);
  });

  it('the arrows promise no shortcut the Booth does not have, and say why they are off', async () => {
    const page = renderPage();
    await ready();
    await userEvent.hover(screen.getByRole('button', { name: 'Next chapter' }));
    expect(await screen.findByRole('tooltip')).toHaveProperty('textContent', 'Next chapter');
    await userEvent.unhover(screen.getByRole('button', { name: 'Next chapter' }));
    await record(page);
    await userEvent.hover(screen.getByRole('button', { name: 'Next chapter' }));
    await waitFor(() => expect(screen.getByRole('tooltip').textContent).toBe('Not while recording. Stop the take first.'));
  });
});

describe('engine-and-model-are-not-in-the-booth', () => {
  it('has no engine, model, microphone field or "Record with" control', async () => {
    renderPage();
    await ready();
    expect(screen.queryByText(/record with/i)).toBeNull();
    expect(screen.queryByRole('combobox', { name: /engine|model|microphone/i })).toBeNull();
    expect(screen.queryByText(/whisper|moonshine/i)).toBeNull();
  });
});

describe('credits-are-readable-and-recordable', () => {
  const credits = {
    creditsTemplates: async () => [{ id: 'o', kind: 'opening', name: 'Opening', body: '[Title]' }],
    creditsPreview: async () => ({ text: 'This is [Title].\nRead by the narrator.', words: 7, unresolved: ['Title'] }),
  };

  it('open as a source with the unresolved-token warning, and record to their own region', async () => {
    const page = renderPage({ search: '?chapter=credits-opening', api: credits as Partial<NarrationApi> });
    await screen.findByText('Read', { exact: false });
    expect(screen.getByRole('button', { name: /token has no value: Title/ })).toBeTruthy();
    await waitFor(() => expect((screen.getByRole('button', { name: /^Record$/ }) as HTMLButtonElement).disabled).toBe(false));
    await space();
    await waitFor(() => expect(page.daw.recordStart).toHaveBeenCalledWith('credits-opening', undefined));
    await waitFor(() => expect(screen.getByRole('button', { name: /^Stop$/ })).toBeTruthy());
    await space();
    // The take maps to the credits' own region in the passage map.
    await waitFor(() =>
      expect(page.passageMapRecordRun).toHaveBeenCalledWith(
        'credits-opening',
        expect.arrayContaining([expect.objectContaining({ kind: 'start', pid: 'credits-opening-0' })]),
      ),
    );
  });

  it('the old ?credits=opening address opens the same chapter', async () => {
    renderPage({ search: '?credits=opening', api: credits as Partial<NarrationApi> });
    await screen.findByText('Read', { exact: false });
    expect(screen.getByRole('button', { name: /token has no value: Title/ })).toBeTruthy();
  });

  it('are in the chapter picker as chapters: opening first, closing last, each one opens in the page', async () => {
    const both = {
      creditsTemplates: async () => [
        { id: 'o', kind: 'opening', name: 'Opening', body: 'Opening.' },
        { id: 'c', kind: 'closing', name: 'Closing', body: 'Closing.' },
      ],
      creditsPreview: async (body: string) => ({ text: body, words: 1, unresolved: [] }),
    } as Partial<NarrationApi>;
    renderPage({ search: '?chapter=c2', api: both });
    const next = await screen.findByRole('button', { name: 'Next chapter' });
    await waitFor(() => expect(next.getAttribute('aria-disabled')).not.toBe('true'));
    // Chapter Two is followed by the closing credits, the last chapter.
    await userEvent.click(next);
    await screen.findByText('Closing.', { exact: false });
    expect(screen.getByRole('button', { name: 'Next chapter' }).getAttribute('aria-disabled') ?? 'true').toBe('true');
    // And three steps back are Chapter Two, Chapter One and the opening credits, the first.
    for (let step = 0; step < 3; step++) {
      await userEvent.click(screen.getByRole('button', { name: 'Previous chapter' }));
      await settle();
    }
    await screen.findByText('Opening.', { exact: false });
  });

  it('with only credits in the book the Booth reads them, not "no chapters to read"', async () => {
    renderPage({
      search: '',
      api: {
        manuscriptChapters: async () => [creditsChapter('opening')],
        creditsTemplates: credits.creditsTemplates,
        creditsPreview: credits.creditsPreview,
      } as Partial<NarrationApi>,
    });
    await screen.findByText('Read', { exact: false });
    expect(screen.queryByText(/no chapters to read/)).toBeNull();
  });

  it('draw no bookmark ribbons or page breaks: the margin is left out', async () => {
    renderPage({ search: '?chapter=credits-opening', api: credits as Partial<NarrationApi> });
    await screen.findByText('Read', { exact: false });
    expect(screen.queryByRole('button', { name: /bookmark/i })).toBeNull();
    expect(document.querySelector('[data-page-breaks]')).toBeNull();
  });
});

describe('a page that has nothing to show says so and leaves a way out', () => {
  // The closing credits are a chapter, but the template renders to no words.
  const closingEmpty = {
    creditsTemplates: async () => [
      { id: 'o', kind: 'opening', name: 'Opening', body: 'Hello.' },
      { id: 'c', kind: 'closing', name: 'Closing', body: '' },
    ],
    creditsPreview: async (body: string) => ({ text: body, words: body ? 1 : 0, unresolved: [] }),
  } as Partial<NarrationApi>;

  it('credits with no text: a panel names what is missing and offers Settings, the chapters, and Escape', async () => {
    const page = renderPage({ search: '?chapter=credits-closing', api: closingEmpty });
    expect(await screen.findByRole('heading', { name: 'The closing credits are not set up' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Record$/ })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Set up credits in Settings' }));
    expect(page.navigate).toHaveBeenCalledWith('/settings#credits');
    await press('Escape');
    expect(page.navigate).toHaveBeenCalledWith('/script');
  });

  it('Back to the chapters goes to the chapter list (Script), not into a Booth already reading chapter 1', async () => {
    const page = renderPage({ search: '?credits=closing', api: closingEmpty });
    await userEvent.click(await screen.findByRole('button', { name: 'Back to the chapters' }));
    expect(page.navigate).toHaveBeenCalledWith('/script');
    expect(screen.queryByRole('button', { name: /^Record$/ })).toBeNull();
  });

  it('credits with no template are not in the list, yet asked for they get the credits panel (set one up), not "not in this book"', async () => {
    renderPage({ search: '?credits=closing' });
    expect(await screen.findByRole('heading', { name: 'The closing credits are not set up' })).toBeTruthy();
  });

  it('a chapter the book does not have says so too, and the way back works', async () => {
    const page = renderPage({ search: '?chapter=no-such-chapter' });
    expect(await screen.findByRole('heading', { name: 'That chapter is not in this book' })).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Back to the chapters' }));
    expect(page.navigate).toHaveBeenCalledWith('/script');
  });

  it('while the credits text is still being read there is no panel yet', async () => {
    renderPage({
      search: '?chapter=credits-closing',
      api: { ...closingEmpty, creditsPreview: () => new Promise(() => {}) },
    });
    await settle();
    expect(screen.queryByRole('heading', { name: /not set up/ })).toBeNull();
  });
});

describe('the resume line', () => {
  it('offers where the recording ends and choosing it moves the reading position', async () => {
    renderPage({ api: { teleprompterLocate: async () => LOCATED } });
    await ready();
    await userEvent.click(await screen.findByRole('button', { name: /Resume at ¶ 2/ }));
    expect(current()).not.toBe('0');
  });
});

describe('a refused stop keeps the take and the question', () => {
  it('shows the sentence and does not leave', async () => {
    const refused: DawResult = { ok: false, changed: false, message: 'Not now.', undoSteps: 0, refused: 'Not now.' };
    const page = renderPage();
    page.daw.recordStop.mockResolvedValueOnce(refused);
    await record(page);
    await press('Escape');
    await act(async () => page.dialog()!.answer(true));
    await waitFor(() => expect(page.dialog()?.spec.body).toContain('Not now.'));
    expect(page.dialog()?.spec.confirmLabel).toBe('Leave anyway');
    expect(page.navigate).not.toHaveBeenCalled();
  });
});

// SN-O103: the bookmarks (SN-O81) and the pickup session (SN-O82) on the page.
const held = (over: Partial<Bookmark>): Bookmark => ({
  id: 'b1',
  chapterId: 'c1',
  paragraphId: 'p3',
  paragraph: 2,
  offset: 28,
  kind: 'spot',
  label: '',
  note: '',
  createdAt: '2026-10-11T10:00:00Z',
  stale: false,
  ...over,
});
const currentText = () => document.querySelector<HTMLElement>('[data-state="cur"]')?.textContent ?? '';
const bodyText = () => document.querySelector('[data-booth-text]')?.textContent ?? '';
const ribbons = () => document.querySelectorAll('[data-bmk-margin] [data-bm]');

describe('bookmarks on the page', () => {
  it('B bookmarks the word being read and the toast Undo takes it back', async () => {
    const page = renderPage();
    await ready();
    // Off the chapter title, which is no manuscript paragraph a bookmark can name.
    await press('ArrowDown');
    await press('b', 'KeyB');
    await waitFor(() => expect(page.overlay.getSnapshot().toasts.map((toast) => toast.text)).toEqual(['Bookmark added.']));
    await waitFor(() => expect(ribbons()).toHaveLength(1));
    const toast = page.overlay.getSnapshot().toasts.find((item) => item.text === 'Bookmark added.');
    await act(async () => {
      await toast?.action?.onAction();
    });
    await waitFor(() => expect(ribbons()).toHaveLength(0));
  });

  it('Alt+] and Alt+[ step between bookmarks, into the next chapter when the next one is there', async () => {
    renderPage({ api: { bookmarksList: async () => [held({}), held({ id: 'b2', chapterId: 'c2', paragraphId: 'q1', paragraph: 0, offset: 2 })] } });
    await ready();
    await waitFor(() => expect(ribbons()).toHaveLength(1));
    await press(']', 'BracketRight', { altKey: true });
    await waitFor(() => expect(currentText()).toContain('The roses watched her go.'));
    await press(']', 'BracketRight', { altKey: true });
    await waitFor(() => expect(driver.search()).toContain('chapter=c2'));
    await waitFor(() => expect(bodyText()).toContain('A new day began in the court.'));
  });

  it('right-click offers Bookmark here on a word, and Edit and Delete on a ribbon', async () => {
    renderPage({ api: { bookmarksList: async () => [held({})] } });
    await ready();
    const word = document.querySelector('[data-unit="1"] [data-word="0"]')!;
    act(() => {
      fireEvent.contextMenu(word, { button: 2, clientX: 10, clientY: 10 });
    });
    const menu = await screen.findByRole('menu');
    const labels = within(menu)
      .getAllByRole('menuitem')
      .map((item) => item.textContent);
    expect(labels.slice(0, 2)).toEqual(['Start from here', 'Bookmark here']);
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    await waitFor(() => expect(ribbons()).toHaveLength(1));
    act(() => {
      fireEvent.contextMenu(ribbons()[0], { button: 2, clientX: 10, clientY: 10 });
    });
    const ribbonMenu = await screen.findByRole('menu');
    expect(
      within(ribbonMenu)
        .getAllByRole('menuitem')
        .map((item) => item.textContent),
    ).toEqual(['Edit bookmark', 'Delete bookmark']);
  });
});

const pickup = (id: string, chapterId: string, paragraphId: string, script: string): PickupItem => ({
  id,
  chapterId,
  paragraphId,
  paragraph: null,
  time: 65,
  at: null,
  type: 'misread',
  script,
  context: '',
  source: 'you',
  confidence: null,
  confReason: '',
  included: true,
  done: false,
  waiting: false,
});

function pickupHost() {
  let items = [pickup('k1', 'c1', 'p3', 'She turned and walked away.'), pickup('k2', 'c2', 'q1', 'A new day began in the court.')];
  const answer = (): PickupList => ({ pickups: items.map((item) => ({ ...item })), leftOut: [] });
  return {
    pickupsList: vi.fn(async () => answer()),
    pickupsSetDone: vi.fn(async (id: string, done: boolean) => {
      items = items.map((item) => (item.id === id ? { ...item, done } : item));
      return answer();
    }),
  };
}

describe('a pickup session on the page', () => {
  it('a pickup session lists its lines, steps with N and exits to Pickups', async () => {
    const host = pickupHost();
    const page = renderPage({ search: '?chapter=c1&pickups=k1,k2', api: host });
    await ready();
    const panel = await screen.findByRole('complementary', { name: 'Side panel' });
    await within(panel).findByText('Pickups · 2 open');
    // The reading starts on the session's first line, which is marked in the text.
    await waitFor(() => expect(currentText()).toContain('She turned'));
    expect(document.querySelector('#bkeys')?.textContent).toContain('Next pickup');
    await press('n', 'KeyN');
    await waitFor(() => expect(driver.search()).toContain('chapter=c2'));
    expect(decodeURIComponent(driver.search())).toContain('pickups=k1,k2');
    await waitFor(() => expect(bodyText()).toContain('A new day began in the court.'));
    await waitFor(() => expect(screen.getByRole('button', { name: /A new day began/ }).getAttribute('aria-current')).toBe('true'));
    // Shift+N goes back, into the first line's chapter and onto its paragraph.
    await press('N', 'KeyN', { shiftKey: true });
    await waitFor(() => expect(driver.search()).toContain('chapter=c1'));
    await waitFor(() => expect(currentText()).toContain('She turned'));
    await press('Escape');
    await waitFor(() => expect(page.navigate).toHaveBeenCalledWith('/pickups'));
  });

  it('a take marks the lines it read over as recorded', async () => {
    const host = pickupHost();
    const page = renderPage({ search: '?chapter=c1&pickups=k1,k2', api: host });
    await ready();
    await waitFor(() => expect(currentText()).toContain('She turned'));
    await record(page);
    await space();
    await waitFor(() => expect(host.pickupsSetDone).toHaveBeenCalledWith('k1', true));
    expect(host.pickupsSetDone).not.toHaveBeenCalledWith('k2', true);
    await waitFor(() => expect(screen.getAllByText('Pickups · 1 open').length).toBeGreaterThan(0));
  });

  it('opening the Booth any other way is no session: no list, no N, and Exit goes to the Script', async () => {
    const host = pickupHost();
    const page = renderPage({ api: host });
    await ready();
    expect(screen.queryByText(/^Pickups · /)).toBeNull();
    expect(host.pickupsList).not.toHaveBeenCalled();
    expect(document.querySelector('#bkeys')?.textContent).not.toContain('Next pickup');
    await press('Escape');
    await waitFor(() => expect(page.navigate).toHaveBeenCalledWith('/script'));
  });
});

// SN-O11: the rest of the Booth parity audit (the deleted parity note for the Booth, G2 to G15).
const toasts = (page: ReturnType<typeof renderPage>) => page.overlay.getSnapshot().toasts.map((toast) => toast.text);

/** A host whose listening session the test drives: it pushes the session's state and events as the sidecar would. */
function voiceHost() {
  const events = new Set<(event: TeleprompterEvent) => void>();
  const states = new Set<(state: TeleprompterState) => void>();
  return {
    api: {
      subscribeTeleprompterEvent: (on: (event: TeleprompterEvent) => void) => {
        events.add(on);
        return () => events.delete(on);
      },
      subscribeTeleprompterState: (on: (state: TeleprompterState) => void) => {
        states.add(on);
        return () => states.delete(on);
      },
      teleprompterStart: vi.fn(async () => ({ status: 'started' as const })),
    } as Partial<NarrationApi>,
    state: (state: Partial<TeleprompterState>) =>
      act(() => states.forEach((on) => on({ phase: 'running', message: '', engine: 'whisper', chapter: 'c1', script: null, position: null, ...state }))),
    event: (event: TeleprompterEvent) => act(() => events.forEach((on) => on(event))),
  };
}

describe('a take stops by itself at the end of the chapter', () => {
  it('a take stops by itself at the end of the chapter and says the take is saved', async () => {
    const voice = voiceHost();
    const page = renderPage({ api: voice.api });
    await record(page);
    await voice.state({});
    await voice.event({ type: 'position', read: 30, committed: 30, status: 'done', jump: null, skipped: null });
    // "Done - stopping in a few seconds unless you read on": the take runs on until the session stops itself.
    await settle();
    expect(page.daw.recordStop).not.toHaveBeenCalled();
    await voice.state({ phase: 'stopped', message: 'Stopped at the end of the chapter.' });
    // The same stop the Stop button makes: one recordStop through the Record control, and the passage map's run ends.
    await waitFor(() => expect(page.daw.recordStop).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByRole('button', { name: /^Record$/ })).toBeTruthy());
    await waitFor(() => expect(page.passageMapRecordRun).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(toasts(page)).toContain('Take saved'));
  });

  it('reading on past the end keeps the take, and a session that stops elsewhere does not stop it', async () => {
    const voice = voiceHost();
    const page = renderPage({ api: voice.api });
    await record(page);
    await voice.state({});
    await voice.event({ type: 'position', read: 30, committed: 30, status: 'done', jump: null, skipped: null });
    await voice.event({ type: 'position', read: 12, committed: 12, status: 'listening', jump: 'restart', skipped: null });
    await voice.state({ phase: 'stopped', message: '' });
    await settle();
    expect(page.daw.recordStop).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /^Stop$/ })).toBeTruthy();
  });
});

describe('the speaker chips write through the shared cues', () => {
  it('confirming a suggested chip writes the shared speaker', async () => {
    const cue: GuideDialogueCue = {
      id: 'cue-1',
      chapterId: 'c1',
      paragraphId: 'p2',
      quote_start: 0,
      quote_end: 20,
      quote_text: '“Off with her head,”',
      speaker_entity_id: 'e-queen',
      speaker_source: 'tag',
      evidence: {},
      corrected: false,
    } as GuideDialogueCue;
    const guideCorrectCue = vi.fn(async () => {});
    renderPage({ api: { guideDialogueCues: async () => [cue], guideCorrectCue } as Partial<NarrationApi> });
    await ready();
    await userEvent.click(await screen.findByRole('button', { name: 'Speaker Queen. Change speaker' }));
    await userEvent.click(await screen.findByRole('option', { name: 'Confirm “Queen”' }));
    await waitFor(() => expect(guideCorrectCue).toHaveBeenCalledWith('cue-1', 'e-queen'));
  });
});

describe('every way out of the page asks while a take records', () => {
  it('every way out of the page asks while a take records', async () => {
    const page = renderPage();
    await record(page);
    // Each exit the shell runs asks the page's guard before it moves: the palette's jump to a page, a link from a toast, the mouse's
    // Back and Forward buttons (the shell asks with no destination), the rail, and a project switch (the start page).
    const exits = { palette: '/proof', toast: '/pickups', mouseButtons: '', rail: '/production', projectSwitch: '/' };
    for (const [exit, path] of Object.entries(exits))
      expect({ exit, verdict: page.journal.checkLeave(path) }).toEqual({ exit, verdict: { ask: expect.objectContaining({ title: 'Stop recording?' }) } });
    // Asking stops nothing: only the narrator's Stop and leave does.
    await settle();
    expect(page.daw.recordStop).not.toHaveBeenCalled();
    expect(screen.getByText('REC')).toBeTruthy();
  });
});

describe('the right-click menu', () => {
  it('Punch and roll in the menu is gated like R: a blocked start answers with its dialog and starts nothing', async () => {
    const page = renderPage({ setup: 'reaper-off' });
    await screen.findByText('Nobody', { exact: false });
    const button = await screen.findByRole('button', { name: /^Record$/ });
    await waitFor(() => expect(button.getAttribute('aria-disabled')).toBe('true'));
    act(() => {
      fireEvent.contextMenu(document.querySelector('[data-unit="1"] [data-word="0"]')!, { button: 2, clientX: 10, clientY: 10 });
    });
    await userEvent.click(within(await screen.findByRole('menu')).getByRole('menuitem', { name: 'Punch and roll' }));
    await settle();
    expect(page.daw.recordStart).not.toHaveBeenCalled();
    expect(page.daw.roll).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole('dialog') ?? page.overlay.getSnapshot().toasts[0]).toBeTruthy());
    expect(
      page.overlay
        .getSnapshot()
        .toasts.map((t) => t.text)
        .join(' '),
    ).not.toMatch(/Starting from/);
  });

  it('right-click offers the phrase, take and text commands', async () => {
    const page = renderPage();
    await ready();
    const open = async () => {
      act(() => {
        fireEvent.contextMenu(document.querySelector('[data-unit="1"] [data-word="0"]')!, { button: 2, clientX: 10, clientY: 10 });
      });
      return screen.findByRole('menu');
    };
    const menu = await open();
    expect(
      within(menu)
        .getAllByRole('menuitem')
        .map((item) => item.textContent),
    ).toEqual([
      'Start from here',
      'Bookmark here',
      'Read to here',
      'Next phrase',
      'Back one phrase',
      'Punch and roll',
      'Larger text',
      'Smaller text',
      'Exit Booth',
    ]);
    const text = () => document.querySelector<HTMLElement>('[data-booth-text] > div')!.style.fontSize;
    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Larger text' }));
    expect(text()).toBe('44px');
    await userEvent.click(within(await open()).getByRole('menuitem', { name: 'Smaller text' }));
    expect(text()).toBe('40px');
    await userEvent.click(within(await open()).getByRole('menuitem', { name: 'Next phrase' }));
    expect(current()).toBe('1');
    await userEvent.click(within(await open()).getByRole('menuitem', { name: 'Back one phrase' }));
    expect(current()).toBe('0');
    await userEvent.click(within(await open()).getByRole('menuitem', { name: 'Exit Booth' }));
    await waitFor(() => expect(page.navigate).toHaveBeenCalledWith('/script'));
  });
});

describe('F11 and the window', () => {
  it('F11 takes the window fullscreen and the Booth gives it back on leaving', async () => {
    const page = renderPage();
    await ready();
    await press('F11');
    await waitFor(() => expect(host.toggleFullscreen).toHaveBeenCalledTimes(1));
    await settle();
    expect(host.exitFullscreen).not.toHaveBeenCalled();
    page.view.unmount();
    expect(host.exitFullscreen).toHaveBeenCalledTimes(1);
  });

  it('a Booth that did not make the window fullscreen leaves it as it is', async () => {
    const page = renderPage();
    await ready();
    page.view.unmount();
    expect(host.exitFullscreen).not.toHaveBeenCalled();
  });
});

describe('the footer room tone', () => {
  it("the footer shows the project's measured room tone", async () => {
    // The microphone saved in Settings is the one whose room tone the footer shows.
    const settingsForScope = async (scope: string) => (scope === 'global' ? { Teleprompter: [{ key: 'input_device', value: 'USB Mic', isSet: true }] } : {});
    renderPage({
      api: { settingsForScope } as unknown as Partial<NarrationApi>,
      measurements: createMockMeasurements({ roomTone: { 'USB Mic': -58.6 } }),
    });
    await ready();
    expect(await screen.findByText('Room −58.6 dB')).toBeTruthy();
  });

  it('says the room is not measured yet when there is no reading', async () => {
    renderPage({ measurements: createMockMeasurements({ none: true }) });
    await ready();
    const chip = await screen.findByText('Room not measured yet');
    // Why, and what measures it, is the chip's tooltip.
    await waitFor(() => expect(chip.closest('[title]')?.getAttribute('title')).toBe('Nothing has been measured yet.'));
  });
});

describe('the Levels menu', () => {
  it('the monitor slider off says the DAW’s reason and offers no way to Settings', async () => {
    const off = {
      level: 'experimental' as const,
      available: false,
      reason: 'not_running' as const,
      message: 'REAPER is not answering. Check that REAPER is open, then try again.',
    };
    const setup = DAW_SETUPS.reaper;
    const daw = createMockDawClient(
      { ...setup, capabilities: { ...setup.capabilities, monitor_level: off } },
      { chapterIds: ['c1', 'c2', 'credits-opening', 'credits-closing'], candidateIds: [], findingIds: [] },
    );
    const page = renderPage({ daw });
    await ready();
    await userEvent.click(screen.getByRole('button', { name: 'Record options' }));
    const levels = await screen.findByRole('dialog', { name: 'Record options' });
    expect(within(levels).getByText(off.message)).toBeTruthy();
    expect(within(levels).queryByRole('button', { name: 'Turn on in Settings' })).toBeNull();
    expect(page.navigate).not.toHaveBeenCalledWith(expect.stringContaining('/settings'));
  });
});

describe('Page Down and Page Up', () => {
  it('Page Down and Page Up scroll the view without moving the reading position', async () => {
    const sized = [
      vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(600),
      vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(5000),
    ];
    renderPage();
    await ready();
    const text = document.querySelector<HTMLElement>('[data-booth-text] > div')!;
    const y = () => parseFloat(/-?[\d.]+(?=px)/.exec(text.style.transform)?.[0] ?? '0');
    const y0 = y();
    await press('PageDown');
    expect(y0 - y()).toBeCloseTo(480);
    expect(current()).toBe('0');
    await press('PageUp');
    expect(y()).toBeCloseTo(y0);
    expect(current()).toBe('0');
    sized.forEach((spy) => spy.mockRestore());
  });
});

describe('the text choices are saved', () => {
  const text = () => document.querySelector<HTMLElement>('[data-booth-text] > div')!;

  it('the text size and font come from the saved choices', async () => {
    window.localStorage.setItem(BOOTH_SIZE_STORAGE_KEY, '52');
    window.localStorage.setItem(TEXT_PREFS_STORAGE_KEY, JSON.stringify({ font: 'Verdana', size: 18, spacing: 1.8, width: 64 }));
    renderPage();
    await ready();
    expect(text().style.fontSize).toBe('52px');
    expect(text().style.fontFamily).toContain('Verdana');
  });

  it('a size changed by the keys is the one the next visit opens with', async () => {
    renderPage();
    await ready();
    await press('=', 'Equal');
    expect(window.localStorage.getItem(BOOTH_SIZE_STORAGE_KEY)).toBe('44');
    cleanup();
    renderPage();
    await ready();
    expect(text().style.fontSize).toBe('44px');
  });
});

describe('the chapter is named as the manuscript heads it', () => {
  const chapters = (title: string, next: string): ManuscriptChapter[] =>
    [
      { id: 'c1', title, subtitle: 'Down the Rabbit-Hole', index: 0, wordCount: 30, status: 'not_started', contentKind: 'narration' },
      { id: 'c2', title: next, subtitle: 'The Pool of Tears', index: 1, wordCount: 6, status: 'not_started', contentKind: 'narration' },
    ] as ManuscriptChapter[];

  it.each([
    ['gutenberg', 'CHAPTER I.', 'CHAPTER II.'],
    ['numbered', '1.', '2.'],
    ['colon', 'Chapter 1:', 'Chapter 2:'],
  ])('names the chapter in the manuscript style (%s)', async (_style, title, next) => {
    renderPage({ api: { manuscriptChapters: async () => chapters(title, next) } });
    await ready();
    const picker = screen.getByRole('button', { name: /Chapter: .*Change chapter/ });
    expect(picker.textContent).toContain(`${title} Down the Rabbit-Hole`);
    await userEvent.click(picker);
    expect(await screen.findByRole('menuitemradio', { name: `${next} The Pool of Tears` })).toBeTruthy();
  });
});

describe('the reference in the side panel', () => {
  const mark = (over: Partial<Mark>): Mark => ({
    id: 'm1',
    chapterId: 'c1',
    paragraphId: 'p1',
    paragraph: 0,
    start: 15,
    end: 20,
    quote: 'quiet',
    type: 'stress',
    text: 'Soft, almost a whisper.',
    thread: [{ who: 'author', text: 'Yes, hushed.', at: '2026-10-01T10:00:00Z' }],
    createdAt: '2026-10-01T09:00:00Z',
    stale: false,
    ...over,
  });
  const MARKS: Marks = {
    types: [{ key: 'stress', name: 'Word stress', colour: 'copper', style: 'highlight', asks: false }],
    marks: [mark({})],
  };
  const reference = () => document.getElementById('booth-reference');
  const word = (unit: number, index: number) => document.querySelector<HTMLElement>(`[data-unit="${unit}"] [data-word="${index}"]`)!;

  it('clicking a marked word shows the note and its thread in the side panel', async () => {
    renderPage({ api: { marksList: async () => MARKS } });
    await ready();
    await waitFor(() => expect(word(1, 3).title).toBe('Word stress'));
    expect(reference()).toBeNull();
    await userEvent.click(word(1, 3));
    const ref = within(reference()!);
    expect(ref.getByText('Word stress')).toBeTruthy();
    expect(ref.getByText('“quiet”')).toBeTruthy();
    expect(ref.getByText('Soft, almost a whisper.')).toBeTruthy();
    expect(ref.getByText('Yes, hushed.')).toBeTruthy();
    expect(ref.getByText(/Author/)).toBeTruthy();
    // The click still moves the reading position.
    expect(current()).toBe('1');
  });

  it('a note under a paragraph opens its text; empty space or a plain word clears the reference', async () => {
    renderPage({ api: { marksList: async () => MARKS } });
    await ready();
    const note = await screen.findByRole('button', { name: 'Word stress: Soft, almost a whisper.' });
    await userEvent.click(note);
    expect(within(reference()!).getByText('Yes, hushed.')).toBeTruthy();
    await userEvent.click(document.querySelector<HTMLElement>('[data-booth-text]')!);
    expect(reference()).toBeNull();
    await userEvent.click(note);
    expect(reference()).not.toBeNull();
    await userEvent.click(word(2, 1));
    expect(reference()).toBeNull();
    expect(current()).toBe('2');
  });

  it('above 1280 clicking the text does not close the inline panel', async () => {
    renderPage();
    await ready();
    const panel = document.getElementById('booth-side')!;
    expect(panel.hidden).toBe(false);
    await userEvent.click(word(1, 2));
    await userEvent.click(document.querySelector<HTMLElement>('[data-booth-text]')!);
    expect(panel.hidden).toBe(false);
  });

  it('a Story Bible name shows its entry', async () => {
    renderPage({ api: { marksList: async () => MARKS } });
    await ready();
    await userEvent.click(word(1, 1));
    expect(within(reference()!).getByText('The walled rose garden.')).toBeTruthy();
  });

  it('a marks list the host refuses leaves the text unmarked and says why', async () => {
    const page = renderPage({ api: { marksList: () => Promise.reject(new Error('The marks file could not be read.')) } });
    await ready();
    await waitFor(() => expect(page.overlay.getSnapshot().toasts.map((toast) => toast.text)).toContain('The marks file could not be read.'));
    expect(screen.queryByRole('button', { name: /Word stress/ })).toBeNull();
  });
});

describe('the text follows the voice: the listening microphone and the model', () => {
  const noSavedDevice = async () => ({});
  const savedDevice = (name: string, source?: 'daw' | 'chosen') => async () => ({
    Teleprompter: [
      { key: 'input_device', label: 'Microphone', kind: 'text', value: name, effectiveValue: name, isSet: true },
      ...(source ? [{ key: 'input_source', label: 'Microphone source', kind: 'choice', value: source, effectiveValue: source, isSet: true }] : []),
    ],
  });
  const reaperInput = (device?: string) => async () =>
    device
      ? {
          status: 'matched' as const,
          message: `REAPER records from "${device}", so the Booth listens to "${device}".`,
          reaperDevice: device,
          inputChannel: 'Input 2',
          device,
          candidates: [],
        }
      : {
          status: 'unavailable' as const,
          reason: 'reaper_no_device' as const,
          message: 'REAPER did not say which input device it has open. Choose the microphone in Record options.',
          candidates: [],
        };
  const two = async () => ({ devices: [{ name: 'USB Mic' }, { name: 'Line In' }], error: null });

  it('with no microphone chosen, a take listens to the one the DAW records from, saves nothing, and Levels names it', async () => {
    const teleprompterStart = vi.fn(async () => ({ status: 'started' as const }));
    const saveSettings = vi.fn(async () => {});
    const teleprompterReaperInput = vi.fn(reaperInput('Line In'));
    const page = renderPage({
      api: { settingsForScope: noSavedDevice, teleprompterReaperInput, teleprompterDevices: two, teleprompterStart, saveSettings } as never,
    });
    await record(page);
    await waitFor(() => expect(teleprompterStart).toHaveBeenCalledWith(expect.objectContaining({ device: 'Line In', chapter: 'c1' })));
    expect(teleprompterReaperInput).toHaveBeenCalledWith('c1');
    expect(saveSettings).not.toHaveBeenCalledWith('Teleprompter', 'global', expect.objectContaining({ input_device: expect.anything() }));
    expect(document.getElementById('blisten-why')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Record options' }));
    const menu = await screen.findByRole('dialog', { name: 'Record options' });
    expect(within(menu).getByText('Line In')).toBeTruthy();
    expect(within(menu).getByText('Same as REAPER')).toBeTruthy();
    expect(within(menu).getByText('REAPER records from Line In · Input 2.')).toBeTruthy();
    expect(within(menu).queryByRole('combobox')).toBeNull();
  });

  // Behaviour change (#2251, owner: "read the mic that is linked to the DAW"): a saved microphone alone no longer outranks the DAW's input;
  // one saved before input_source existed cannot be told from an automatic one. Only "Choose a different one" (input_source: chosen) does.
  it('a microphone saved before is not kept over the DAW’s input', async () => {
    const teleprompterStart = vi.fn(async () => ({ status: 'started' as const }));
    const page = renderPage({
      api: { settingsForScope: savedDevice('USB Mic'), teleprompterReaperInput: reaperInput('Line In'), teleprompterDevices: two, teleprompterStart } as never,
    });
    await record(page);
    await waitFor(() => expect(teleprompterStart).toHaveBeenCalledWith(expect.objectContaining({ device: 'Line In' })));
  });

  it('a microphone the narrator chose over the DAW’s is kept, and Use REAPER’s input goes back', async () => {
    const teleprompterStart = vi.fn(async () => ({ status: 'started' as const }));
    const saveSettings = vi.fn(async () => {});
    const page = renderPage({
      api: {
        settingsForScope: savedDevice('USB Mic', 'chosen'),
        teleprompterReaperInput: reaperInput('Line In'),
        teleprompterDevices: two,
        teleprompterStart,
        saveSettings,
      } as never,
    });
    await record(page);
    await waitFor(() => expect(teleprompterStart).toHaveBeenCalledWith(expect.objectContaining({ device: 'USB Mic' })));
    await userEvent.click(screen.getByRole('button', { name: 'Record options' }));
    const menu = await screen.findByRole('dialog', { name: 'Record options' });
    await userEvent.click(within(menu).getByRole('button', { name: "Use REAPER's input" }));
    expect(saveSettings).toHaveBeenCalledWith('Teleprompter', 'global', { input_source: 'daw' });
    expect(await within(menu).findByText('Same as REAPER')).toBeTruthy();
  });

  it('when the DAW cannot say, the take listens to the first microphone listed with no trip to Settings, and a choice in Record options is the next', async () => {
    const teleprompterStart = vi.fn(async () => ({ status: 'started' as const }));
    const page = renderPage({
      api: { settingsForScope: noSavedDevice, teleprompterReaperInput: reaperInput(), teleprompterDevices: two, teleprompterStart } as never,
    });
    await ready();
    await userEvent.click(screen.getByRole('button', { name: 'Record options' }));
    const menu = await screen.findByRole('dialog', { name: 'Record options' });
    expect(within(menu).getByText('REAPER did not say which input device it has open. Choose the microphone in Record options.')).toBeTruthy();
    expect(within(menu).getByRole('combobox', { name: 'Microphone' })).toHaveProperty('value', 'USB Mic');
    expect(document.getElementById('blisten-why')).toBeNull();
    await userEvent.selectOptions(within(menu).getByRole('combobox', { name: 'Microphone' }), 'Line In');
    await userEvent.click(screen.getByRole('button', { name: 'Record options' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Record options' })).toBeNull());
    await record(page);
    await waitFor(() => expect(teleprompterStart).toHaveBeenCalledWith(expect.objectContaining({ device: 'Line In' })));
  });

  it('when the DAW’s input fits two microphones, Levels says so with one button each, and the pick is what the take listens to', async () => {
    const teleprompterStart = vi.fn(async () => ({ status: 'started' as const }));
    const saveSettings = vi.fn(async () => {});
    const uncertain = async () => ({
      status: 'uncertain' as const,
      reaperDevice: 'Focusrite USB ASIO',
      candidates: ['USB Mic', 'Line In'],
      message: 'REAPER records from "Focusrite USB ASIO", which could be any of 2 microphones here. Pick the one REAPER uses.',
    });
    const page = renderPage({
      api: { settingsForScope: noSavedDevice, teleprompterReaperInput: uncertain, teleprompterDevices: two, teleprompterStart, saveSettings } as never,
    });
    await ready();
    await userEvent.click(screen.getByRole('button', { name: 'Record options' }));
    const menu = await screen.findByRole('dialog', { name: 'Record options' });
    const group = await within(menu).findByRole('group', { name: 'Which microphone REAPER records from' });
    await userEvent.click(within(group).getByRole('button', { name: 'Line In' }));
    expect(saveSettings).toHaveBeenCalledWith('Teleprompter', 'global', { input_device: 'Line In' });
    // Settled, the menu names the pick as REAPER's input, the candidates still one click away.
    expect(await within(menu).findByText('Same as REAPER')).toBeTruthy();
    const settled = within(menu).getByRole('group', { name: 'Which microphone REAPER records from' });
    expect(within(settled).getByRole('button', { name: 'Line In' }).getAttribute('aria-pressed')).toBe('true');
    await userEvent.click(screen.getByRole('button', { name: 'Record options' }));
    await record(page);
    await waitFor(() => expect(teleprompterStart).toHaveBeenCalledWith(expect.objectContaining({ device: 'Line In' })));
  });

  it('a missing model is asked for when the take starts, no take begins behind the question, and nothing downloads until the narrator says so', async () => {
    const assetsInstall = vi.fn();
    const teleprompterStart = vi.fn(async () => ({
      status: 'asset_required' as const,
      engine: 'whisper' as const,
      model: {
        id: 'tiny',
        displayName: 'Whisper tiny',
        version: '1',
        publisher: 'OpenAI',
        license: 'MIT',
        licenseUrl: '',
        modelCardUrl: '',
        provenanceUrl: '',
      },
      installState: 'not_installed' as const,
      downloadSize: 1,
      diskSize: 1,
      installPath: 'C:/assets/whisper',
    }));
    const page = renderPage({ api: { settingsForScope: savedDevice('USB Mic'), teleprompterStart, assetsInstall } as never });
    page.daw.recordStop.mockImplementation(async () => ({ ok: true, changed: true, message: '', undoSteps: 0 }));
    await ready();
    await space();
    expect(await screen.findByRole('alertdialog', { name: 'Download local Whisper model?' })).toBeTruthy();
    // Changed 2026-11-01 (#2251): the DAW starts alongside listening, so a model the asset list did not report missing is found once it has;
    // the recording is stopped at once and nothing of it is kept, so no take runs behind the question.
    await waitFor(() => expect(page.daw.recordStop).toHaveBeenCalledTimes(1));
    expect(page.daw.recordStart).toHaveBeenCalledTimes(1);
    expect(page.passageMapRecordRun).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByText('REC')).toBeNull());
    expect(assetsInstall).not.toHaveBeenCalled();
  });

  // Changed 2026-11-01 (#2251): the DAW is asked to record alongside listening, not after it, so its pre-roll covers the model load; a take whose
  // text cannot follow is still never kept: the recording is stopped and anything it recorded is taken back.
  it('a session that fails to start stops the recording it began alongside, takes it back, and says so in the footer', async () => {
    let fail = (_reason: Error) => {};
    const teleprompterStart = vi.fn(() => new Promise<never>((_resolve, reject) => (fail = reject)));
    const page = renderPage({ api: { settingsForScope: savedDevice('USB Mic'), teleprompterStart } as never });
    page.daw.recordStop.mockImplementation(async () => ({ ok: true, changed: true, message: '', undoSteps: 1 }));
    await ready();
    await space();
    // Listening is still starting and the DAW has already been asked: its pre-roll runs while the model loads.
    await waitFor(() => expect(page.daw.recordStart).toHaveBeenCalledTimes(1));
    expect(teleprompterStart).toHaveBeenCalledTimes(1);
    await act(async () => fail(new Error('The microphone is in use by another application.')));
    await waitFor(() =>
      expect(document.getElementById('blisten-why')?.textContent).toBe('The text cannot follow your voice: The microphone is in use by another application.'),
    );
    await waitFor(() => expect(page.daw.recordStop).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(page.daw.undoLast).toHaveBeenCalledWith('record_take', 1));
    expect(page.passageMapRecordRun).not.toHaveBeenCalled();
    expect(screen.queryByText(/Take saved/i)).toBeNull();
    expect(await screen.findByRole('button', { name: /^Record$/ })).toBeTruthy();
    // The recording that started did not start a second listening session behind the first.
    expect(teleprompterStart).toHaveBeenCalledTimes(1);
  });

  it("a session that fails inside the DAW's pre-roll stops the recording and has nothing to take back", async () => {
    const teleprompterStart = vi.fn(async () => {
      throw new Error('The microphone is in use by another application.');
    });
    const page = renderPage({ api: { settingsForScope: savedDevice('USB Mic'), teleprompterStart } as never });
    page.daw.recordStop.mockImplementation(async () => ({ ok: true, changed: true, message: '', undoSteps: 0 }));
    await ready();
    await space();
    await waitFor(() => expect(page.daw.recordStop).toHaveBeenCalledTimes(1));
    expect(page.daw.undoLast).not.toHaveBeenCalled();
    expect(page.passageMapRecordRun).not.toHaveBeenCalled();
    expect(await screen.findByRole('button', { name: /^Record$/ })).toBeTruthy();
  });

  it('a recording the DAW refuses stops the listening started alongside it', async () => {
    const teleprompterStart = vi.fn(async () => ({ status: 'started' as const }));
    const page = renderPage({ api: { settingsForScope: savedDevice('USB Mic'), teleprompterStart } as never });
    page.daw.recordStart.mockImplementation(async () => ({
      ok: false,
      changed: false,
      message: 'REAPER is playing: stop it first.',
      refused: 'REAPER is playing: stop it first.',
      undoSteps: 0,
    }));
    await ready();
    await space();
    await waitFor(() => expect(teleprompterStart).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(page.teleprompterStop).toHaveBeenCalled());
    expect(page.daw.recordStop).not.toHaveBeenCalled();
  });
});

describe('a-pedals-space-records-and-stops-with-a-popup-open', () => {
  const spaceOn = (target: Element) => press(' ', 'Space', {}, target);
  const openContextMenu = async () => {
    const word = document.querySelector('[data-unit="1"] [data-word]')!;
    await act(async () => {
      fireEvent.contextMenu(word, { button: 2, clientX: 10, clientY: 10 });
    });
    return screen.findByRole('menu');
  };
  const openPopover = async (name: string) => {
    await userEvent.click(screen.getByRole('button', { name }));
    return screen.findByRole('dialog', { name });
  };

  it('stops the take from an open context menu, and closes the menu', async () => {
    const page = renderPage();
    await record(page);
    const menu = await openContextMenu();
    await spaceOn((menu.querySelector('[role="menuitem"]') as Element | null) ?? menu);
    await waitFor(() => expect(page.daw.recordStop).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(menu.isConnected).toBe(false));
    expect(screen.queryByText('Stop recording?')).toBeNull();
    expect(page.navigate).not.toHaveBeenCalled();
  });

  it('does not choose the focused menu item with the pedal', async () => {
    const page = renderPage();
    await ready();
    const menu = await openContextMenu();
    const item = menu.querySelector('[role="menuitem"]') as HTMLElement;
    const click = vi.fn();
    item.addEventListener('click', click);
    await spaceOn(item);
    await waitFor(() => expect(page.daw.recordStart).toHaveBeenCalledTimes(1));
    expect(click).not.toHaveBeenCalled();
  });

  it.each([
    ['Text settings', () => screen.getByRole('combobox', { name: 'Font' })],
    ['Text settings', () => screen.getByRole('slider', { name: /Size/ })],
    ['Record options', () => document.activeElement ?? document.body],
  ])('starts a take from the %s popover with focus on a non-text control', async (name, pick) => {
    const page = renderPage();
    await ready();
    const popover = await openPopover(name);
    const target = pick();
    (target as HTMLElement).focus?.();
    await spaceOn(target);
    await waitFor(() => expect(page.daw.recordStart).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(popover.isConnected).toBe(false));
  });

  it('stops a running take from the Levels popover', async () => {
    const page = renderPage();
    await record(page);
    const popover = await openPopover('Record options');
    await spaceOn(document.activeElement ?? popover);
    await waitFor(() => expect(page.daw.recordStop).toHaveBeenCalledTimes(1));
  });

  it('still types a space into a text field inside a popup', async () => {
    const page = renderPage();
    await ready();
    const popover = await openPopover('Record options');
    const field = document.createElement('input');
    field.type = 'text';
    popover.append(field);
    await spaceOn(field);
    const area = document.createElement('textarea');
    popover.append(area);
    await spaceOn(area);
    await settle();
    expect(page.daw.recordStart).not.toHaveBeenCalled();
    expect(popover.isConnected).toBe(true);
  });

  it('leaves Space to a modal question: the Stop recording question is answered, not recorded behind', async () => {
    const page = renderPage();
    await record(page);
    await press('Escape');
    const dialog = await screen.findByRole('alertdialog');
    await spaceOn(within(dialog).getAllByRole('button')[0]);
    await settle();
    expect(page.daw.recordStop).not.toHaveBeenCalled();
  });
});

describe('the Booth offers Check recordings once a take has stopped (#2833)', () => {
  const offer = (page: ReturnType<typeof renderPage>) => page.overlay.getSnapshot().toasts.find((toast) => toast.action?.label === 'Check recordings');

  it('offers nothing while a take runs, then one Check recordings action once it stops, opening the dialog with this chapter', async () => {
    const open = vi.spyOn(checkRecordings, 'openCheckRecordings').mockReturnValue(() => {});
    const page = renderPage();
    await record(page);
    expect(offer(page)).toBeUndefined();
    await space();
    await waitFor(() => expect(offer(page)).toBeTruthy());
    expect(page.overlay.getSnapshot().toasts.filter((toast) => toast.action?.label === 'Check recordings')).toHaveLength(1);
    await act(async () => offer(page)?.action?.onAction());
    expect(open).toHaveBeenCalledWith([expect.any(String)]);
  });

  // qa-breaker: the offer is about the take just stopped, so it goes when the next take starts, when the Booth is left, and when the DAW can no longer check.
  it('the offer goes when the next take starts', async () => {
    const page = renderPage();
    await record(page);
    await space();
    await waitFor(() => expect(offer(page)).toBeTruthy());
    await space();
    await waitFor(() => expect(page.daw.recordStart).toHaveBeenCalledTimes(2));
    expect(offer(page)).toBeUndefined();
  });

  it('the offer goes when the Booth is left', async () => {
    const page = renderPage();
    await record(page);
    await space();
    await waitFor(() => expect(offer(page)).toBeTruthy());
    page.view.unmount();
    expect(offer(page)).toBeUndefined();
  });

  it('offers nothing while the DAW cannot check recordings', async () => {
    const page = renderPage({ setup: 'reaper-off' });
    await ready();
    await space();
    await settle();
    expect(offer(page)).toBeUndefined();
  });
});

describe('a-take-is-undone-in-the-daw', () => {
  /** The shell's journal over the page's DAW, as StudioProvider wires it. */
  const dawJournal = (daw: DawClient): Journal =>
    createJournal({ dawName: () => 'REAPER', dawLastAction: async (action) => (action ? daw.lastAction(action.kind as DawActionKind) : 'unknown') });
  const toastNamed = (page: ReturnType<typeof renderPage>, text: string) => page.overlay.getSnapshot().toasts.find((toast) => toast.text === text);

  it('a take stopped in the DAW is one history entry, and Undo takes it back in the DAW', async () => {
    const page = renderPage({ journal: dawJournal });
    await record(page);
    await space();
    await waitFor(() => expect(page.daw.recordStop).toHaveBeenCalledTimes(1));
    await waitFor(async () =>
      expect((await page.journal.entries()).map((row) => [row.label, row.refusal])).toEqual([['Recorded a take of Chapter One', null]]),
    );
    expect(await page.journal.undoLast()).toMatchObject({ ok: true });
    expect(page.daw.undoLast).toHaveBeenCalledWith('record_take', 1);
    expect(await page.journal.entries()).toEqual([]);
    expect(await page.daw.lastAction('record_take')).toBe('other');
  });

  it('a take the narrator stops in the DAW itself is a history entry too, and Undo takes it back in the DAW', async () => {
    let ended: ((undoSteps: number) => void) | undefined;
    const daw = {
      ...dawFor('reaper'),
      lastAction: async () => 'this' as const,
      undoLast: async () => ({ ok: true, changed: true, message: '', undoSteps: 1 }),
      subscribeRecordEnded: (on: (undoSteps: number) => void) => ((ended = on), () => (ended = undefined)),
    };
    const page = renderPage({ daw, journal: dawJournal });
    await record(page);
    await act(async () => ended?.(1));
    await waitFor(async () =>
      expect((await page.journal.entries()).map((row) => [row.label, row.refusal])).toEqual([['Recorded a take of Chapter One', null]]),
    );
    expect(await page.journal.undoLast()).toMatchObject({ ok: true });
    expect(page.daw.undoLast).toHaveBeenCalledWith('record_take', 1);
  });

  it('a take the DAW ended with no undo points (an older script) is journaled with its reason and no inverse', async () => {
    let ended: ((undoSteps: number) => void) | undefined;
    const daw = { ...dawFor('reaper'), subscribeRecordEnded: (on: (undoSteps: number) => void) => ((ended = on), () => (ended = undefined)) };
    const page = renderPage({ daw, journal: dawJournal });
    await record(page);
    await act(async () => ended?.(0));
    await waitFor(async () => expect(await page.journal.entries()).toHaveLength(1));
    expect(await page.journal.undoLast()).toMatchObject({ ok: false });
    expect(page.daw.undoLast).not.toHaveBeenCalled();
  });

  it('says the take is saved with an Undo that takes it back in the DAW', async () => {
    const page = renderPage({ journal: dawJournal });
    await record(page);
    await space();
    await waitFor(() => expect(toastNamed(page, 'Take saved')).toBeTruthy());
    await act(async () => {
      await toastNamed(page, 'Take saved')?.action?.onAction();
    });
    expect(page.daw.undoLast).toHaveBeenCalledWith('record_take', 1);
    expect(await page.journal.entries()).toEqual([]);
  });

  it('takes an undone take out of This session (#2655)', async () => {
    let now = 1_000_000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    const page = renderPage({ journal: dawJournal });
    const figure = () => screen.getByText(/^Recorded/).querySelector('b')?.textContent;
    await record(page);
    now += 2000;
    await space();
    await waitFor(() => expect(toastNamed(page, 'Take saved')).toBeTruthy());
    expect(figure()).toBe('00:02');
    await act(async () => {
      await toastNamed(page, 'Take saved')?.action?.onAction();
    });
    await waitFor(() => expect(figure()).toBe('00:00'));
  });

  it('an Undo after something else came on top of the take in the DAW is refused in the DAW words, and the take stays', async () => {
    const page = renderPage({ journal: () => createJournal({ dawName: () => 'REAPER', dawLastAction: async () => 'other' }) });
    await record(page);
    await space();
    await waitFor(async () => expect(await page.journal.entries()).toHaveLength(1));
    expect(await page.journal.undoLast()).toEqual({
      ok: false,
      refusal: { code: 'daw-last-action', reason: "REAPER's last action is not this one, so it was left alone. Use Edit > Undo in REAPER." },
    });
    expect(page.daw.undoLast).not.toHaveBeenCalled();
    expect(await page.journal.entries()).toHaveLength(1);
  });

  it('Stop and leave journals the take too, so it can be undone from the next page', async () => {
    const page = renderPage({ journal: dawJournal });
    await record(page);
    await press('Escape');
    await waitFor(() => expect(page.dialog()?.spec.title).toBe('Stop recording?'));
    await act(async () => page.dialog()?.answer(true));
    await waitFor(() => expect(page.daw.recordStop).toHaveBeenCalledTimes(1));
    await waitFor(async () => expect((await page.journal.entries()).map((row) => row.label)).toEqual(['Recorded a take of Chapter One']));
    expect(toastNamed(page, 'Take saved')).toBeUndefined();
  });

  it('a take with the built-in recorder is not a DAW entry', async () => {
    const page = renderPage({ setup: 'builtin', journal: dawJournal });
    await record(page);
    await space();
    await waitFor(() => expect(page.daw.recordStop).toHaveBeenCalledTimes(1));
    await settle();
    expect(await page.journal.entries()).toEqual([]);
    expect(toastNamed(page, 'Take saved')).toBeUndefined();
  });
});

describe('the-built-in-recorder-names-the-microphone-it-records-on', () => {
  // Issue 2810: the Record options select showed the first microphone listed while Record used the one the project last recorded with.
  const noSavedDevice = async () => ({});
  const two = async () => ({ devices: [{ name: 'USB Mic' }, { name: 'Line In' }], error: null });
  const recorderState = (device: string) => async () => ({ phase: 'idle', device, hasProject: true, takes: [] }) as never;
  const levelsSelect = async () => {
    await userEvent.click(screen.getByRole('button', { name: 'Record options' }));
    const menu = await screen.findByRole('dialog', { name: 'Record options' });
    return within(menu).getByRole('combobox', { name: 'Microphone' }) as HTMLSelectElement;
  };

  it('names the microphone the project last recorded with, not the first listed, and listens on it', async () => {
    const teleprompterStart = vi.fn(async () => ({ status: 'started' as const }));
    const page = renderPage({
      setup: 'builtin',
      api: {
        settingsForScope: noSavedDevice,
        teleprompterDevices: two,
        recorderDevices: two,
        recorderState: recorderState('Line In'),
        teleprompterStart,
      } as never,
    });
    await ready();
    await waitFor(async () => expect((await levelsSelect()).value).toBe('Line In'));
    await userEvent.keyboard('{Escape}');
    await record(page);
    await waitFor(() => expect(teleprompterStart).toHaveBeenCalledWith(expect.objectContaining({ device: 'Line In' })));
    expect(teleprompterStart).not.toHaveBeenCalledWith(expect.objectContaining({ device: 'USB Mic' }));
  });

  it('does not count a remembered microphone that is no longer listed, and starts nothing on it', async () => {
    const teleprompterStart = vi.fn(async () => ({ status: 'started' as const }));
    const page = renderPage({
      setup: 'builtin',
      api: {
        settingsForScope: noSavedDevice,
        teleprompterDevices: two,
        recorderDevices: two,
        recorderState: recorderState('Unplugged mic'),
        teleprompterStart,
      } as never,
    });
    await ready();
    expect((await levelsSelect()).value).toBe('');
    await userEvent.keyboard('{Escape}');
    await space();
    await settle();
    expect(page.overlay.getSnapshot().toasts.find((toast) => toast.text === 'Choose the microphone in Record options, then press Record.')).toBeTruthy();
    expect(teleprompterStart).not.toHaveBeenCalled();
    expect(page.daw.recordStart).not.toHaveBeenCalled();
  });

  it('says no microphone was found, not to choose one, when none is listed', async () => {
    const none = async () => ({ devices: [], error: null });
    const teleprompterStart = vi.fn(async () => ({ status: 'started' as const }));
    const page = renderPage({
      setup: 'builtin',
      api: {
        settingsForScope: noSavedDevice,
        teleprompterDevices: none,
        recorderDevices: none,
        recorderState: recorderState('Unplugged mic'),
        teleprompterStart,
      } as never,
    });
    await ready();
    await space();
    await settle();
    expect(page.overlay.getSnapshot().toasts.find((toast) => toast.text === 'No microphone found. Plug one in, then press Record again.')).toBeTruthy();
    expect(teleprompterStart).not.toHaveBeenCalled();
    expect(page.daw.recordStart).not.toHaveBeenCalled();
  });

  const toastText = (page: ReturnType<typeof renderPage>) => page.overlay.getSnapshot().toasts.map((toast) => toast.text);
  const noneSaved = noSavedDevice;
  const list =
    (...names: string[]) =>
    async () => ({ devices: names.map((name) => ({ name })), error: null });
  const savedAs = (name: string) => async () => ({
    Teleprompter: [{ key: 'input_device', label: 'Microphone', kind: 'text', value: name, effectiveValue: name, isSet: true }],
  });

  it('judges Record options and Record by the recorder’s list alone when the speech listener’s list disagrees (several here, none there)', async () => {
    const page = renderPage({
      setup: 'builtin',
      api: { settingsForScope: noneSaved, teleprompterDevices: list(), recorderDevices: list('A', 'B', 'C'), recorderState: recorderState('') } as never,
    });
    await ready();
    expect((await levelsSelect()).value).toBe('');
    await userEvent.keyboard('{Escape}');
    await space();
    await settle();
    expect(toastText(page)).toContain('Choose the microphone in Record options, then press Record.');
    expect(toastText(page)).not.toContain('No microphone found. Plug one in, then press Record again.');
  });

  it('says no microphone was found when the recorder lists none, even if the speech listener lists some', async () => {
    const page = renderPage({
      setup: 'builtin',
      api: { settingsForScope: noneSaved, teleprompterDevices: list('A', 'B'), recorderDevices: list(), recorderState: recorderState('') } as never,
    });
    await ready();
    await space();
    await settle();
    expect(toastText(page)).toContain('No microphone found. Plug one in, then press Record again.');
    expect(page.daw.recordStart).not.toHaveBeenCalled();
  });

  it('shows why when the microphone listing fails, instead of "Listing microphones…" for good, and does not start', async () => {
    const page = renderPage({
      setup: 'builtin',
      api: {
        settingsForScope: noneSaved,
        teleprompterDevices: list('A', 'B'),
        recorderDevices: async () => {
          throw new Error('PortAudio is not installed');
        },
        recorderState: recorderState(''),
      } as never,
    });
    await ready();
    await userEvent.click(screen.getByRole('button', { name: 'Record options' }));
    const menu = await screen.findByRole('dialog', { name: 'Record options' });
    expect(await within(menu).findByText(/PortAudio is not installed/)).toBeTruthy();
    expect(within(menu).queryByText('Listing microphones…')).toBeNull();
    await userEvent.keyboard('{Escape}');
    await space();
    await settle();
    expect(page.daw.recordStart).not.toHaveBeenCalled();
  });

  it('lists the microphones again when the window gets focus while Record options is open', async () => {
    let names = ['A', 'B'];
    renderPage({
      setup: 'builtin',
      api: {
        settingsForScope: noneSaved,
        teleprompterDevices: list('A', 'B'),
        recorderDevices: async () => ({ devices: names.map((name) => ({ name })), error: null }),
        recorderState: recorderState(''),
      } as never,
    });
    await ready();
    const select = await levelsSelect();
    await waitFor(() => expect([...select.options].map((o) => o.value)).toContain('B'));
    names = ['C', 'D'];
    act(() => void window.dispatchEvent(new Event('focus')));
    await waitFor(() => expect([...select.options].map((o) => o.value)).toEqual(expect.arrayContaining(['C', 'D'])));
    expect([...select.options].map((o) => o.value)).not.toContain('B');
  });

  it('treats a microphone named only spaces as none: not listed, not a choice', async () => {
    const page = renderPage({
      setup: 'builtin',
      api: { settingsForScope: savedAs('   '), teleprompterDevices: list('   '), recorderDevices: list('   '), recorderState: recorderState('') } as never,
    });
    await ready();
    await space();
    await settle();
    expect(toastText(page)).toContain('No microphone found. Plug one in, then press Record again.');
    expect(page.daw.recordStart).not.toHaveBeenCalled();
  });

  it('refuses to record on a chosen microphone that is no longer listed, and names it', async () => {
    const page = renderPage({
      setup: 'builtin',
      api: { settingsForScope: savedAs('Gone mic'), teleprompterDevices: list('A'), recorderDevices: list('A'), recorderState: recorderState('') } as never,
    });
    await ready();
    await space();
    await settle();
    expect(toastText(page)).toContain('Gone mic was not found. Choose another microphone in Record options, then press Record.');
    expect(page.daw.recordStart).not.toHaveBeenCalled();
  });

  it('says why the microphone is the one shown while the narrator has not chosen it', async () => {
    renderPage({
      setup: 'builtin',
      api: { settingsForScope: noSavedDevice, teleprompterDevices: two, recorderDevices: two, recorderState: recorderState('Line In') } as never,
    });
    await ready();
    await waitFor(async () => expect((await levelsSelect()).value).toBe('Line In'));
    expect(
      within(screen.getByRole('dialog', { name: 'Record options' })).getByText('The microphone this project last recorded with, until you choose one.'),
    ).toBeTruthy();
    await userEvent.selectOptions(within(screen.getByRole('dialog', { name: 'Record options' })).getByRole('combobox', { name: 'Microphone' }), 'USB Mic');
    await waitFor(() => expect(within(screen.getByRole('dialog', { name: 'Record options' })).queryByText(/last recorded with/)).toBeNull());
  });

  it('shows no microphone as chosen when several are listed and none was chosen or recorded with, and never listens on the first', async () => {
    const teleprompterStart = vi.fn(async () => ({ status: 'started' as const }));
    const page = renderPage({
      setup: 'builtin',
      api: { settingsForScope: noSavedDevice, teleprompterDevices: two, recorderDevices: two, recorderState: recorderState(''), teleprompterStart } as never,
    });
    await ready();
    expect((await levelsSelect()).value).toBe('');
    await userEvent.keyboard('{Escape}');
    await space();
    await settle();
    expect(page.overlay.getSnapshot().toasts.find((toast) => toast.text === 'Choose the microphone in Record options, then press Record.')).toBeTruthy();
    expect(teleprompterStart).not.toHaveBeenCalled();
    expect(page.daw.recordStart).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: /^Stop$/ })).toBeNull();
  });
});

// Listening and the recording start together (#2251): what a second press, a Stop or a failed stop does while listening is still starting.
// From the qa-breaker pass of 2026-11-02 (B1 to B4).
describe('a-record-press-while-listening-starts', () => {
  const settingsForScope = async () => ({
    Teleprompter: [{ key: 'input_device', label: 'Microphone', kind: 'text', value: 'USB Mic', effectiveValue: 'USB Mic', isSet: true }],
  });
  // A real double press: the start guard stays on.
  const rawSpace = () =>
    act(() => {
      fireEvent.keyDown(document.body, { key: ' ', code: 'Space' });
    });
  const stopped = (undoSteps: number) => async () => ({ ok: true, changed: true, message: '', undoSteps });
  const toasts = (page: ReturnType<typeof renderPage>) => page.overlay.getSnapshot().toasts.map((t) => t.text);
  /** A host whose one session the test settles by hand, and that tells the page its phase as the real host does. */
  const manual = () => {
    let phase = 'idle';
    const states = new Set<(next: never) => void>();
    const publish = (next: string) => {
      phase = next;
      states.forEach((listener) =>
        listener({ phase, message: '', engine: 'whisper', chapter: 'c1', paused: false, coldRead: false, script: null, position: null } as never),
      );
    };
    let pending: { ok: () => void; fail: (e: Error) => void } = { ok: () => {}, fail: () => {} };
    const start = vi.fn(() => {
      act(() => publish('starting'));
      return new Promise<{ status: 'started' }>((resolve, reject) => {
        pending = {
          ok: () => {
            publish('running');
            resolve({ status: 'started' });
          },
          fail: (error) => {
            publish('stopped');
            reject(error);
          },
        };
      });
    });
    const stop = vi.fn(async () => {
      if (phase === 'running' || phase === 'starting') act(() => publish('stopped'));
    });
    const api = {
      settingsForScope,
      teleprompterStart: start,
      teleprompterStop: stop,
      teleprompterState: async () => ({ phase, message: '', engine: null, chapter: null, paused: false, coldRead: false, script: null, position: null }),
      subscribeTeleprompterState: (listener: (next: never) => void) => {
        states.add(listener);
        return () => states.delete(listener);
      },
    };
    return { start, stop, api, listen: () => act(async () => pending.ok()), fail: (message: string) => act(async () => pending.fail(new Error(message))) };
  };

  it('a second press while listening is still starting starts nothing more', async () => {
    const host = manual();
    const page = renderPage({ api: host.api as never });
    await ready();
    await space();
    await rawSpace();
    await settle();
    await host.listen();
    await settle();
    expect(host.start).toHaveBeenCalledTimes(1);
    expect(page.daw.recordStart).toHaveBeenCalledTimes(1);
    expect(page.daw.recordStop).not.toHaveBeenCalled();
  });

  it('Stop while listening starts waits for it; listening up, the take stops and is kept as usual', async () => {
    const host = manual();
    const page = renderPage({ api: host.api as never });
    await ready();
    await space();
    await waitFor(() => expect(screen.getByRole('button', { name: /^Stop$/ })).toBeTruthy());
    await space();
    await settle();
    expect(page.daw.recordStop).not.toHaveBeenCalled();
    await host.listen();
    await waitFor(() => expect(page.daw.recordStop).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(host.stop).toHaveBeenCalled());
    expect(page.daw.undoLast).not.toHaveBeenCalled();
  });

  it('Stop while listening starts, then listening fails: one stop, the take taken back, nothing saved or mapped', async () => {
    const host = manual();
    const page = renderPage({ api: host.api as never });
    page.daw.recordStop.mockImplementation(stopped(1));
    await ready();
    await space();
    await waitFor(() => expect(screen.getByRole('button', { name: /^Stop$/ })).toBeTruthy());
    await space();
    await host.fail('The microphone is in use by another application.');
    await waitFor(() => expect(page.daw.undoLast).toHaveBeenCalledWith('record_take', 1));
    await settle();
    expect(page.daw.recordStop).toHaveBeenCalledTimes(1);
    expect(page.daw.recordStart).toHaveBeenCalledTimes(1);
    expect(page.passageMapRecordRun).not.toHaveBeenCalled();
    // The mock DAW refuses the undo (it never recorded the take this stop reports); its own sentence says what to do, once.
    expect(toasts(page).filter((text) => /Take saved|could not be stopped/i.test(text))).toEqual([]);
    expect(toasts(page).filter((text) => /Undo it in/.test(text))).toEqual([]);
  });

  it('a stop that fails after a failed listen is said, and the take is not mapped', async () => {
    const host = manual();
    const page = renderPage({ api: host.api as never });
    page.daw.recordStop.mockImplementation(async () => {
      throw new Error('bridge gone');
    });
    await ready();
    await space();
    await waitFor(() => expect(page.daw.recordStart).toHaveBeenCalledTimes(1));
    await host.fail('no mic');
    await waitFor(() => expect(toasts(page).some((text) => /could not be stopped/.test(text))).toBe(true));
    await settle();
    expect(page.passageMapRecordRun).not.toHaveBeenCalled();
    expect(toasts(page).some((text) => /Nothing was recorded/.test(text))).toBe(false);
  });
});

describe('enter-and-numpad-enter-record-and-stop-like-space', () => {
  const enter = (code: 'Enter' | 'NumpadEnter', init: KeyboardEventInit = {}, target: Element = document.body) => press('Enter', code, init, target);

  it.each(['Enter', 'NumpadEnter'] as const)('%s records and stops through the Record control, as Space does', async (code) => {
    const page = renderPage();
    await ready();
    await enter(code);
    await waitFor(() => expect(page.daw.recordStart).toHaveBeenCalledTimes(1));
    expect(screen.getByText('REC')).toBeTruthy();
    await enter(code);
    await waitFor(() => expect(page.daw.recordStop).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(page.passageMapRecordRun).toHaveBeenCalledTimes(1));
  });

  it.each(['Enter', 'NumpadEnter'] as const)('a held %s records once: its repeats are left alone', async (code) => {
    const page = renderPage();
    await ready();
    await enter(code);
    await enter(code, { repeat: true });
    await enter(code, { repeat: true });
    await settle();
    await waitFor(() => expect(page.daw.recordStart).toHaveBeenCalledTimes(1));
    expect(page.daw.recordStop).not.toHaveBeenCalled();
  });

  it.each(['Enter', 'NumpadEnter'] as const)('a focused button keeps %s: the button is pressed, the page does not also record', async (code) => {
    const page = renderPage();
    await ready();
    const caret = screen.getByRole('button', { name: 'Record options' });
    await enter(code, {}, caret);
    await settle();
    expect(page.daw.recordStart).not.toHaveBeenCalled();
  });

  it.each(['Enter', 'NumpadEnter'] as const)('a text field keeps %s', async (code) => {
    const page = renderPage();
    await ready();
    const field = document.createElement('input');
    document.body.append(field);
    await enter(code, {}, field);
    await settle();
    field.remove();
    expect(page.daw.recordStart).not.toHaveBeenCalled();
  });

  it.each(['Enter', 'NumpadEnter'] as const)('an open popover keeps %s: it is for the popover, not for the page behind it', async (code) => {
    const page = renderPage();
    await ready();
    await userEvent.click(screen.getByRole('button', { name: 'Text settings' }));
    await screen.findByRole('dialog', { name: 'Text settings' });
    await enter(code);
    await settle();
    expect(page.daw.recordStart).not.toHaveBeenCalled();
  });

  it("a pedal is still only Space: a USB pedal sends Space, and Enter is the keyboard's", async () => {
    const page = renderPage();
    await ready();
    await space();
    await waitFor(() => expect(page.daw.recordStart).toHaveBeenCalledTimes(1));
  });
});

describe('a start chosen with Start from here: the wait is shown, joined, dropped on leaving, and spent by the take (#3284)', () => {
  const FOUND = { outcome: 'found' as const, start: 12, end: 20 };
  /** A lookup the test answers by hand; `calls` counts the host calls. */
  const slowLookup = () => {
    let answer!: (value: typeof FOUND) => void;
    const pending = new Promise<typeof FOUND>((resolve) => (answer = resolve));
    const boothPunchTarget = vi.fn(() => pending);
    return { boothPunchTarget, answer };
  };
  const recordButton = () => screen.getByRole('button', { name: /^Record$/ });

  it('shows Record busy at once while the lookup is out, takes a second press as the same wait, and ends with the take', async () => {
    const lookup = slowLookup();
    const page = renderPage({ search: '?chapter=c1&para=p3&at=28', api: { boothPunchTarget: lookup.boothPunchTarget } });
    await ready();
    // Opening the Booth at a line asks where it was recorded (useMoveTarget); a press joins that call while it is out: one call in all.
    await space();
    // Pending right after the press, before any answer: the narrator sees the press was heard.
    expect(recordButton().getAttribute('aria-busy')).toBe('true');
    await space();
    await press('r', 'KeyR');
    await settle();
    expect(lookup.boothPunchTarget).toHaveBeenCalledTimes(1);
    expect(page.daw.recordStart).not.toHaveBeenCalled();
    await act(async () => lookup.answer(FOUND));
    await waitFor(() => expect(screen.getByRole('button', { name: /^Stop$/ })).toBeTruthy());
    expect(page.daw.recordStart).toHaveBeenCalledTimes(1);
    expect(page.daw.recordStart).toHaveBeenCalledWith('c1', 12);
    expect(lookup.boothPunchTarget).toHaveBeenCalledTimes(1);
  });

  it('pending Record is announced once: "Starting the take…" in the status line, and not again as a description', async () => {
    const lookup = slowLookup();
    renderPage({ search: '?chapter=c1&para=p3&at=28', api: { boothPunchTarget: lookup.boothPunchTarget } });
    await ready();
    const status = () => document.getElementById('brec-pending')!;
    expect(status().getAttribute('role')).toBe('status');
    expect(status().textContent).toBe('');
    await space();
    expect(recordButton().getAttribute('aria-describedby')).toBeNull();
    expect(status().textContent).toBe('Starting the take…');
    await space();
    expect(status().textContent).toBe('Starting the take…');
    await act(async () => lookup.answer(FOUND));
    await waitFor(() => expect(screen.getByRole('button', { name: /^Stop$/ })).toBeTruthy());
    expect(status().textContent).toBe('');
  });

  it('a take the DAW refuses after the lookup spends nothing: the start and its chip stay, and the next Record uses it', async () => {
    const boothPunchTarget = vi.fn(async () => FOUND);
    const page = renderPage({ search: '?chapter=c1&para=p3&at=28', api: { boothPunchTarget } });
    await ready();
    boothPunchTarget.mockClear();
    const refused = { ok: false as const, changed: false, undoSteps: 0, message: 'REAPER is not answering.', refused: 'REAPER is not answering.' };
    page.daw.recordStart.mockImplementationOnce(async () => refused as never);
    await space();
    await waitFor(() => expect(boothPunchTarget).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(recordButton().getAttribute('aria-busy')).toBeNull());
    // (a) the refusal is said, (b) no claim about recording over, (c) the start is still chosen and shown, (d) no take runs.
    await waitFor(() => expect(document.body.textContent).toContain('REAPER is not answering.'));
    expect(
      page.overlay
        .getSnapshot()
        .toasts.map((t) => t.text)
        .join('|'),
    ).not.toContain('Recording over');
    expect(screen.getByText('Starts at ¶ 3')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Stop$/ })).toBeNull();
    // (e) the next press uses that start again, and the chip goes once that take has ended.
    await space();
    await waitFor(() => expect(screen.getByRole('button', { name: /^Stop$/ })).toBeTruthy());
    expect(boothPunchTarget).toHaveBeenCalledTimes(2);
    expect(page.daw.recordStart).toHaveBeenLastCalledWith('c1', 12);
    await space();
    await waitFor(() => expect(recordButton()).toBeTruthy());
    expect(screen.queryByText(/^Starts at /)).toBeNull();
  });

  it('R (Punch and roll) before a take says where it starts, and the chip is gone once the take has ended', async () => {
    const lookup = slowLookup();
    const page = renderPage({ api: { boothPunchTarget: lookup.boothPunchTarget } });
    await ready();
    expect(screen.queryByText(/^Starts at /)).toBeNull();
    await press('r', 'KeyR');
    expect(screen.getByText(/^Looking up ¶ \d+…$/)).toBeTruthy();
    await act(async () => lookup.answer(FOUND));
    await waitFor(() => expect(screen.getByRole('button', { name: /^Stop$/ })).toBeTruthy());
    expect(screen.queryByText(/^(Starts at|Looking up) /)).toBeNull();
    await space();
    await waitFor(() => expect(recordButton()).toBeTruthy());
    expect(screen.queryByText(/^Starts at /)).toBeNull();
    expect(page.daw.recordStart).toHaveBeenCalledTimes(1);
  });

  describe('leaving the Booth during the waits after the lookup starts no take (the model check, the project check, the start tone)', () => {
    const gated = <T,>(value: T) => {
      let release!: () => void;
      const open = new Promise<void>((resolve) => (release = resolve));
      return { release, answer: async () => (await open, value) };
    };
    const leave = async (page: ReturnType<typeof renderPage>, release: () => void) => {
      await settle();
      expect(recordButton().getAttribute('aria-busy')).toBe('true');
      page.view.unmount();
      release();
      await settle();
      await settle();
      expect(page.daw.recordStart).not.toHaveBeenCalled();
    };

    for (const [name, search] of [
      ['a plain press', ''],
      ['a press with a start chosen', '?chapter=c1&para=p3&at=28'],
    ] as const) {
      it(`${name}: a slow model check`, async () => {
        const slow = gated({ assets: [] });
        const page = renderPage({ search, api: { assetsList: slow.answer } as unknown as Partial<NarrationApi> });
        await ready();
        await space();
        await leave(page, slow.release);
      });

      it(`${name}: a slow project check`, async () => {
        const slow = gated({ dawFileLinked: true, dawReachable: true, dawProjectMatches: true });
        const page = renderPage({ search, api: { bootstrap: slow.answer } as unknown as Partial<NarrationApi> });
        await ready();
        await space();
        await leave(page, slow.release);
      });

      it(`${name}: the start tone`, async () => {
        let release = () => {};
        tone.gate = new Promise<void>((resolve) => (release = resolve));
        try {
          const page = renderPage({ search });
          await ready();
          await space();
          await leave(page, release);
        } finally {
          tone.gate = null;
        }
      });
    }
  });

  it('a refused lookup ends the wait with the reason and a Record that is pressable again', async () => {
    const boothPunchTarget = vi.fn(async () => ({ outcome: 'refused' as const, message: 'The recording check is out of date.' }));
    const page = renderPage({ search: '?chapter=c1&para=p3&at=28', api: { boothPunchTarget } });
    await ready();
    await space();
    await waitFor(() => expect(recordButton().getAttribute('aria-busy')).toBeNull());
    expect(page.daw.recordStart).not.toHaveBeenCalled();
    expect(screen.queryByText(/^Starts at /)).toBeNull();
  });

  it('leaving the Booth while the lookup is out starts no take', async () => {
    const lookup = slowLookup();
    const page = renderPage({ search: '?chapter=c1&para=p3&at=28', api: { boothPunchTarget: lookup.boothPunchTarget } });
    await ready();
    await press('r', 'KeyR');
    expect(recordButton().getAttribute('aria-busy')).toBe('true');
    // One place per fact: the chip names the start, so no message does, here or on the next page.
    expect(screen.getByText(/^Looking up ¶ \d+…$/)).toBeTruthy();
    expect(
      page.overlay
        .getSnapshot()
        .toasts.map((t) => t.text)
        .join('|'),
    ).not.toMatch(/Starting from|Recording over/);
    page.view.unmount();
    expect(page.overlay.getSnapshot().toasts).toHaveLength(0);
    await act(async () => lookup.answer(FOUND));
    await settle();
    expect(page.daw.recordStart).not.toHaveBeenCalled();
  });

  it('the chosen start is for the next take only: after it ends, Record starts at the end of the audio with no lookup', async () => {
    const boothPunchTarget = vi.fn(async () => FOUND);
    const page = renderPage({ search: '?chapter=c1&para=p3&at=28', api: { boothPunchTarget } });
    await ready();
    expect(screen.getByText('Starts at ¶ 3')).toBeTruthy();
    boothPunchTarget.mockClear();
    await space();
    await waitFor(() => expect(screen.getByRole('button', { name: /^Stop$/ })).toBeTruthy());
    expect(boothPunchTarget).toHaveBeenCalledTimes(1);
    await space();
    await waitFor(() => expect(recordButton()).toBeTruthy());
    expect(screen.queryByText(/^Starts at /)).toBeNull();
    await space();
    await waitFor(() => expect(screen.getByRole('button', { name: /^Stop$/ })).toBeTruthy());
    expect(page.daw.recordStart).toHaveBeenCalledTimes(2);
    expect(page.daw.recordStart).toHaveBeenLastCalledWith('c1', undefined);
    expect(boothPunchTarget).toHaveBeenCalledTimes(1);
  });
});

describe('every wait of a press is one press: joined, bounded, and dropped with the Booth (#3284, round 2)', () => {
  const FOUND = { outcome: 'found' as const, start: 12, end: 20 };
  const gate = () => {
    let release!: () => void;
    const open = new Promise<void>((resolve) => (release = resolve));
    return { release, open };
  };
  const toastText = (page: ReturnType<typeof renderPage>) =>
    page.overlay
      .getSnapshot()
      .toasts.map((t) => t.text)
      .join('|');
  const START = '?chapter=c1&para=p3&at=28';
  const recordButton = () => screen.getByRole('button', { name: /^Record$/ });
  const savedDevice = (name: string) => async () => ({
    Teleprompter: [{ key: 'input_device', label: 'Microphone', kind: 'text', value: name, effectiveValue: name, isSet: true }],
  });

  /** Presses Space, R and Space again (a pedal tap) in the middle of a wait: none may ask the host again or say anything. */
  const pressMore = async () => {
    await space();
    await press('r', 'KeyR');
    await space();
    await settle();
  };

  const waits: [string, (hold: ReturnType<typeof gate>, page?: undefined) => Partial<NarrationApi>][] = [
    ['the model check', (hold) => ({ assetsList: (async () => (await hold.open, { assets: [] })) as never })],
    [
      'the project check',
      (hold) => ({ bootstrap: (async () => (await hold.open, { dawFileLinked: true, dawReachable: true, dawProjectMatches: true })) as never }),
    ],
  ];
  for (const [name, api] of waits) {
    it(`more presses during ${name} ask the host nothing more and say nothing, and one take starts`, async () => {
      const hold = gate();
      const boothPunchTarget = vi.fn(async () => FOUND);
      const page = renderPage({ search: START, api: { boothPunchTarget, ...api(hold) } });
      await ready();
      boothPunchTarget.mockClear();
      await space();
      await settle();
      const asked = boothPunchTarget.mock.calls.length;
      await pressMore();
      expect(boothPunchTarget).toHaveBeenCalledTimes(asked);
      expect(toastText(page)).toBe('');
      hold.release();
      await waitFor(() => expect(screen.getByRole('button', { name: /^Stop$/ })).toBeTruthy());
      expect(page.daw.recordStart).toHaveBeenCalledTimes(1);
    });
  }

  it("a start chosen while a press is already starting says nothing it will not do: the take is the first press's, and no chip or note claims another", async () => {
    const hold = gate();
    const boothPunchTarget = vi.fn(async () => FOUND);
    const page = renderPage({ api: { boothPunchTarget, assetsList: (async () => (await hold.open, { assets: [] })) as never } });
    await ready();
    await space();
    await settle();
    await press('r', 'KeyR');
    await settle();
    expect(boothPunchTarget).not.toHaveBeenCalled();
    expect(screen.queryByText(/^(Starts at|Looking up) /)).toBeNull();
    expect(toastText(page)).toBe('');
    hold.release();
    await waitFor(() => expect(screen.getByRole('button', { name: /^Stop$/ })).toBeTruthy());
    expect(page.daw.recordStart).toHaveBeenCalledTimes(1);
    expect(page.daw.recordStart).toHaveBeenCalledWith('c1', undefined);
  });

  it('a DAW start that is rejected ends the pending state and says why (the host has its own deadline: the UI adds none)', async () => {
    const page = renderPage();
    page.daw.recordStart.mockImplementation(async () => {
      throw new Error('the bridge did not answer');
    });
    await ready();
    await space();
    await waitFor(() => expect(document.body.textContent).toMatch(/Record did not start: .*the bridge did not answer/));
    expect(screen.getByRole('button', { name: /^Record$/ }).getAttribute('aria-busy')).toBeNull();
    expect(screen.queryByRole('button', { name: /^Stop$/ })).toBeNull();
  });

  it('more presses during the start tone and during the DAW call ask the host nothing more and say nothing', async () => {
    const tone_ = gate();
    tone.gate = tone_.open;
    try {
      const boothPunchTarget = vi.fn(async () => FOUND);
      const page = renderPage({ search: START, api: { boothPunchTarget } });
      await ready();
      boothPunchTarget.mockClear();
      await space();
      await settle();
      const asked = boothPunchTarget.mock.calls.length;
      await pressMore();
      expect(boothPunchTarget).toHaveBeenCalledTimes(asked);
      const dawCall = gate();
      const begin = page.daw.recordStart.getMockImplementation()!;
      page.daw.recordStart.mockImplementation(async (...args) => (await dawCall.open, begin(...args)));
      tone_.release();
      await settle();
      await pressMore();
      expect(boothPunchTarget).toHaveBeenCalledTimes(asked);
      expect(toastText(page)).toBe('');
      dawCall.release();
      await waitFor(() => expect(screen.getByRole('button', { name: /^Stop$/ })).toBeTruthy());
      expect(page.daw.recordStart).toHaveBeenCalledTimes(1);
    } finally {
      tone.gate = null;
    }
  });

  it('arriving with Record from here, a press while the opening lookup is out joins it: one host call', async () => {
    const hold = gate();
    const boothPunchTarget = vi.fn(async () => (await hold.open, FOUND));
    renderPage({ search: START, api: { boothPunchTarget } });
    await ready();
    await space();
    await settle();
    expect(boothPunchTarget).toHaveBeenCalledTimes(1);
    hold.release();
    await waitFor(() => expect(screen.getByRole('button', { name: /^Stop$/ })).toBeTruthy());
    expect(boothPunchTarget).toHaveBeenCalledTimes(1);
  });

  it('leaving the Booth while the DAW is being asked stops the take it then starts, and takes it back', async () => {
    const dawCall = gate();
    const page = renderPage({ search: START, api: { boothPunchTarget: async () => FOUND } });
    page.daw.recordStop.mockImplementation(async () => ({ ok: true, changed: true, message: '', undoSteps: 1 }));
    const begin = page.daw.recordStart.getMockImplementation()!;
    page.daw.recordStart.mockImplementation(async (...args) => (await dawCall.open, begin(...args)));
    await ready();
    await space();
    await waitFor(() => expect(page.daw.recordStart).toHaveBeenCalledTimes(1));
    page.view.unmount();
    dawCall.release();
    await waitFor(() => expect(page.daw.recordStop).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(page.daw.undoLast).toHaveBeenCalledWith('record_take', 1));
  });

  describe('a press the DAW refuses is over at once, not when listening has settled', () => {
    const slowListening = () => {
      const hold = gate();
      const teleprompterStart = vi.fn(async () => {
        await hold.open;
        return { status: 'started' as const };
      });
      return { hold, teleprompterStart };
    };
    const refusals: [string, (daw: ReturnType<typeof renderPage>['daw']) => void][] = [
      [
        'a refusal',
        (daw) =>
          daw.recordStart.mockImplementationOnce(
            async () =>
              ({ ok: false, changed: false, undoSteps: 0, message: 'REAPER is recording already.', refused: 'REAPER is recording already.' }) as never,
          ),
      ],
      [
        'a thrown start',
        (daw) =>
          daw.recordStart.mockImplementationOnce(async () => {
            throw new Error('the bridge did not answer');
          }),
      ],
    ];
    for (const [name, refuse] of refusals) {
      for (const search of ['', START]) {
        it(`${name}${search ? ' with a start chosen' : ''}: pending ends, and the next press is a new press (listening still starting)`, async () => {
          const host = slowListening();
          const page = renderPage({
            search,
            api: { teleprompterStart: host.teleprompterStart, settingsForScope: savedDevice('USB Mic'), boothPunchTarget: async () => FOUND } as never,
          });
          refuse(page.daw);
          await ready();
          await space();
          await waitFor(() => expect(page.daw.recordStart).toHaveBeenCalledTimes(1));
          await waitFor(() => expect(recordButton().getAttribute('aria-busy')).toBeNull());
          // Listening has not settled, and Record already works: the press that follows asks the DAW again.
          await space();
          await waitFor(() => expect(page.daw.recordStart).toHaveBeenCalledTimes(2));
          host.hold.release();
        });
      }
    }
  });

  it('a model check that answers "not installed" after the limit opens no question behind a take', async () => {
    const never = gate();
    const assetsList = (async () => {
      await never.open;
      return {
        assets: [
          {
            kind: 'whisper',
            id: 'tiny',
            installState: 'not_installed',
            displayName: 'Whisper tiny',
            version: '1',
            publisher: 'p',
            license: 'MIT',
            licenseUrl: '',
            modelCardUrl: '',
            provenanceUrl: '',
            attribution: '',
            downloadSize: 1,
            diskSize: 1,
            path: '',
            installedAt: '',
            verifiedAt: '',
            activeJobId: '',
            kindLabel: '',
          },
        ],
      };
    }) as never;
    const page = renderPage({ api: { assetsList } as Partial<NarrationApi> });
    await ready();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      await space();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(8400);
      });
    } finally {
      vi.useRealTimers();
    }
    await waitFor(() => expect(page.daw.recordStart).toHaveBeenCalledTimes(1));
    never.release();
    await settle();
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('the Stop-and-leave path stopping the take first means a late press does not stop it a second time', async () => {
    const hold = gate();
    const teleprompterStart = vi.fn(async () => {
      await hold.open;
      return { status: 'started' as const };
    });
    const page = renderPage({ api: { teleprompterStart, settingsForScope: savedDevice('USB Mic') } as never });
    page.daw.recordStop.mockImplementation(async () => ({ ok: true, changed: true, message: '', undoSteps: 0 }));
    await ready();
    await space();
    await waitFor(() => expect(screen.getByRole('button', { name: /^Stop$/ })).toBeTruthy());
    await press('Escape');
    await act(async () => page.dialog()!.answer(true));
    await waitFor(() => expect(page.navigate).toHaveBeenCalledWith('/script'));
    await waitFor(() => expect(page.daw.recordStop).toHaveBeenCalledTimes(1));
    page.view.unmount();
    hold.release();
    await settle();
    await settle();
    expect(page.daw.recordStop).toHaveBeenCalledTimes(1);
  });

  describe('a wait that never answers ends after the host limit and the press goes on or says so', () => {
    const never = () => new Promise<never>(() => {});
    const limit = async () => {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(8100);
      });
    };
    for (const [name, api, takes] of [
      ['the model check', { assetsList: never }, true],
      ['the project check', { bootstrap: never }, true],
      ['the voice choice', { boothPunchTarget: async () => ({ ...FOUND, trackGuid: 'T' }), boothVoiceSet: never }, false],
    ] as const) {
      it(name, async () => {
        const page = renderPage({ search: START, api: { boothPunchTarget: async () => FOUND, ...(api as object) } as never });
        await ready();
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
        try {
          await space();
          expect(recordButton().getAttribute('aria-busy')).toBe('true');
          await limit();
          await vi.advanceTimersByTimeAsync(400);
        } finally {
          vi.useRealTimers();
        }
        if (!takes) await waitFor(() => expect(recordButton().getAttribute('aria-busy')).toBeNull());
        if (takes) await waitFor(() => expect(page.daw.recordStart).toHaveBeenCalledTimes(1));
        else expect(page.daw.recordStart).not.toHaveBeenCalled();
      });
    }
  });

  describe('a take dropped because the text cannot follow the voice', () => {
    const failing = () => {
      let fail = (_reason: Error) => {};
      const teleprompterStart = vi.fn(() => new Promise<never>((_resolve, reject) => (fail = reject)));
      return { teleprompterStart, fail: (reason: Error) => fail(reason) };
    };
    const toastRetry = (page: ReturnType<typeof renderPage>) => page.overlay.getSnapshot().toasts.find((t) => t.action)?.action;

    it('does not spend the chosen start: the chip stays and Retry records from it again', async () => {
      const host = failing();
      const page = renderPage({
        search: START,
        api: { settingsForScope: savedDevice('USB Mic'), teleprompterStart: host.teleprompterStart, boothPunchTarget: async () => FOUND } as never,
      });
      page.daw.recordStop.mockImplementation(async () => ({ ok: true, changed: true, message: '', undoSteps: 1 }));
      await ready();
      await space();
      await waitFor(() => expect(page.daw.recordStart).toHaveBeenCalledTimes(1));
      await act(async () => host.fail(new Error('The microphone is in use by another application.')));
      await waitFor(() => expect(page.daw.recordStop).toHaveBeenCalledTimes(1));
      await waitFor(() => expect(screen.getByText('Starts at ¶ 3')).toBeTruthy());
      await waitFor(() => expect(toastRetry(page)).toBeTruthy());
      // Retry records from the chosen start again, not from the end of the chapter.
      await act(async () => void toastRetry(page)!.onAction());
      await waitFor(() => expect(page.daw.recordStart).toHaveBeenCalledTimes(2));
      expect(page.daw.recordStart).toHaveBeenLastCalledWith('c1', 12);
    });

    it('the message goes when a good take starts, and its Retry never stops a take', async () => {
      const host = failing();
      const page = renderPage({
        search: START,
        api: { settingsForScope: savedDevice('USB Mic'), teleprompterStart: host.teleprompterStart, boothPunchTarget: async () => FOUND } as never,
      });
      page.daw.recordStop.mockImplementation(async () => ({ ok: true, changed: true, message: '', undoSteps: 1 }));
      await ready();
      await space();
      await waitFor(() => expect(page.daw.recordStart).toHaveBeenCalledTimes(1));
      await act(async () => host.fail(new Error('The microphone is in use by another application.')));
      await waitFor(() => expect(toastRetry(page)).toBeTruthy());
      const retry = toastRetry(page)!;
      // A good take: listening starts this time.
      host.teleprompterStart.mockImplementationOnce((async () => ({ status: 'started' })) as never);
      await space();
      await waitFor(() => expect(screen.getByRole('button', { name: /^Stop$/ })).toBeTruthy());
      expect(toastRetry(page)).toBeUndefined();
      const stops = page.daw.recordStop.mock.calls.length;
      await act(async () => void retry.onAction());
      await settle();
      expect(page.daw.recordStop.mock.calls.length).toBe(stops);
      expect(screen.getByRole('button', { name: /^Stop$/ })).toBeTruthy();
    });

    it('leaving the Booth takes the failed-start message away, so no dead Retry shows on the next page', async () => {
      const host = failing();
      const page = renderPage({
        search: START,
        api: { settingsForScope: savedDevice('USB Mic'), teleprompterStart: host.teleprompterStart, boothPunchTarget: async () => FOUND } as never,
      });
      page.daw.recordStop.mockImplementation(async () => ({ ok: true, changed: true, message: '', undoSteps: 1 }));
      await ready();
      await space();
      await waitFor(() => expect(page.daw.recordStart).toHaveBeenCalledTimes(1));
      await act(async () => host.fail(new Error('The microphone is in use by another application.')));
      await waitFor(() => expect(toastRetry(page)).toBeTruthy());
      page.view.unmount();
      expect(toastRetry(page)).toBeUndefined();
    });

    it('a Retry on that message after the Booth was left starts nothing', async () => {
      const host = failing();
      const page = renderPage({
        search: START,
        api: { settingsForScope: savedDevice('USB Mic'), teleprompterStart: host.teleprompterStart, boothPunchTarget: async () => FOUND } as never,
      });
      page.daw.recordStop.mockImplementation(async () => ({ ok: true, changed: true, message: '', undoSteps: 1 }));
      await ready();
      await space();
      await waitFor(() => expect(page.daw.recordStart).toHaveBeenCalledTimes(1));
      await act(async () => host.fail(new Error('The microphone is in use by another application.')));
      await waitFor(() => expect(toastRetry(page)).toBeTruthy());
      const retry = toastRetry(page)!;
      page.view.unmount();
      await act(async () => void retry.onAction());
      await settle();
      expect(page.daw.recordStart).toHaveBeenCalledTimes(1);
    });
  });
});
