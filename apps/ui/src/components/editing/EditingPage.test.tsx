// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import axe from 'axe-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DAW_SETUPS, type DawSetupId } from '../../fixtures/daw';
import { resetOpenOnce } from '../connection/useOpenOnce';
import { providedCommands } from '../../input/commandProviders';
import { contextItemsFor } from '../../registries/context';
import { overlay } from '../../overlay/overlayService';
import { createJournal } from '../../studio/journal/createJournal';
import { createMockDawClient, type DawClient } from '../../ports/daw';
import type { NarrationApi } from '../../types';
import { clock } from './bar/clock';
import { useSelectionActions } from './bar/selectionActions';
import { drawSections } from './drawer/drawerSections';
import { useFlagActions } from './flags/flagActions';
import { EditingPage, type EditingPageProps } from './EditingPage';
import { useTakeControls } from './takes/takeControls';
import { dawFor, EditingHost, FINDING, newJournal, noAudioApi, pageApi } from './page/testPage';
import { buildDoc } from './model';
import { finding } from './cleanup/cleanupFixtures';
import { HEADING_LABELS, styledChapters, type HeadingStyle } from '../script/page/chapters/chapterFixtures';

class FakeAudio extends EventTarget {
  src = '';
  currentTime = 0;
  play = vi.fn().mockResolvedValue(undefined);
  pause = vi.fn();
}
const audios: FakeAudio[] = [];

/** The width every element measures, so the page root is wide or narrow. */
let width = 1440;

beforeEach(() => {
  resetOpenOnce();
  audios.length = 0;
  width = 1440;
  vi.stubGlobal(
    'Audio',
    class extends FakeAudio {
      constructor() {
        super();
        audios.push(this);
      }
    },
  );
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() => ({
    width,
    height: 800,
    top: 0,
    left: 0,
    right: width,
    bottom: 800,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  }));
});
afterEach(() => {
  cleanup();
  act(() => {
    overlay.getSnapshot().dialogs.forEach((d) => (d.kind === 'confirm' ? d.answer(false) : d.close()));
    overlay.getSnapshot().toasts.forEach((t) => overlay.dismissToast(t.id));
  });
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

type Options = Partial<EditingPageProps> & { setup?: DawSetupId; daw?: DawClient; api?: Partial<NarrationApi> & { heard?: boolean } };

/** The DAW dialog waits this long after the app opens before it opens by itself; the page tests that are not about it never see it. */
const NEVER = 1_000_000_000;

function mount({ setup = 'reaper', daw, api = {}, ...props }: Options = {}) {
  const view = render(
    <EditingHost api={pageApi(api)} daw={daw ?? dawFor(setup)} journal={newJournal()}>
      <EditingPage hasManuscript dawConnectGraceMs={NEVER} {...props} />
    </EditingHost>,
  );
  return view;
}

// `hidden`: a connection dialog that opened by itself hides the page behind it from the accessibility tree, and the script is still what is being waited for.
const script = () => screen.findByRole('textbox', { name: 'Script with what was heard', hidden: true });
const cursorKey = () => screen.getByRole('textbox', { name: 'Script with what was heard' }).getAttribute('aria-activedescendant');
const word = (key: string) => document.querySelector<HTMLElement>(`[data-k="${key}"]`)!;
const codeOf = (key: string): string => (key.length === 1 ? `Key${key.toUpperCase()}` : key);
/** A key pressed with nothing focused, as the narrator reading on would. */
const press = (key: string, init: KeyboardEventInit = {}) =>
  act(() => {
    (document.activeElement as HTMLElement | null)?.blur();
    fireEvent.keyDown(document.body, { key, code: codeOf(key), ...init });
  });
const drawerButton = () => screen.getByRole('button', { name: 'Clean up and effects' });

describe('EditingPage', () => {
  it('the-page-is-the-script', async () => {
    mount();
    await script();
    expect(screen.getByRole('heading', { level: 1, name: 'Editing' })).toBeTruthy();
    expect(screen.getByRole('group', { name: 'Chapter' })).toBeTruthy();
    expect(screen.getByRole('group', { name: /What is marked\. Flagged by Whisper small/ })).toBeTruthy();
    expect(screen.getByRole('toolbar', { name: 'Playback and selection' })).toBeTruthy();
    expect(screen.getByRole('note', { name: 'Keyboard shortcuts' })).toBeTruthy();
    expect(word('p1:3').textContent).toContain('quiet');
    expect(document.querySelector('#drawer')).toBeNull();
    expect(document.querySelector('#timeline')).toBeNull();
  });

  it('the key hints sit at the bottom of the scrolling page', async () => {
    mount();
    await script();
    const wrap = screen.getByRole('note', { name: 'Keyboard shortcuts' }).parentElement!;
    expect(wrap.className).toContain('sticky');
    expect(wrap.className).toContain('bottom-0');
    expect(wrap.parentElement!.lastElementChild).toBe(wrap);
  });

  it('no-manuscript-and-no-text-states', async () => {
    mount({ hasManuscript: false });
    expect(screen.getByText(/This project has no manuscript yet/)).toBeTruthy();
    // The page keeps its level-one heading, as the loaded page's header has it (axe's page-has-heading-one).
    expect(screen.getByRole('heading', { level: 1, name: 'Editing' })).toBeTruthy();
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByRole('toolbar')).toBeNull();
    expect(screen.queryByRole('region', { name: 'Script editor' })).toBeNull();
    cleanup();
    mount({ chapterId: 'c2' });
    expect(await screen.findByText('This chapter has no text yet.')).toBeTruthy();
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('not-transcribed-state', async () => {
    mount({ api: { heard: false } });
    await script();
    expect(screen.getAllByText('Not transcribed yet').length).toBeGreaterThan(0);
    expect(screen.queryByRole('group', { name: /What is marked/ })).toBeNull();
    expect(document.querySelectorAll('[data-st="mis"], [data-st="extra"]')).toHaveLength(0);
  });

  it('a-chapter-never-checked-offers-to-check-its-recording-and-reads-again-when-the-check-closes', async () => {
    const api = pageApi({ heard: false });
    const workspaceAlignment = vi.spyOn(api, 'workspaceAlignment');
    mount({ api });
    await script();
    const first = workspaceAlignment.mock.calls.length;
    fireEvent.click(await screen.findByRole('button', { name: 'Check recording' }));
    const panel = await screen.findByRole('dialog');
    expect(panel).toBeTruthy();
    fireEvent.click(within(panel).getByRole('button', { name: /close/i }));
    await waitFor(() => expect(workspaceAlignment.mock.calls.length).toBeGreaterThan(first));
  });

  describe('a-chapter-with-no-audio-says-why-and-where-to-fix-it', () => {
    const unlinked = noAudioApi('unlinked');
    const banner = () => document.querySelector<HTMLElement>('#noaudio');
    const shown = () =>
      waitFor(() => {
        const note = banner();
        expect(note).not.toBeNull();
        return note!;
      });

    const dialog = () => screen.findByRole('dialog');
    const closeDialog = async () => {
      const open = await dialog();
      fireEvent.click(within(open).getByRole('button', { name: 'Close' }));
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    };
    const track = (guid: string, name: string, index: number) => ({ guid, name, index });
    const match = (over: Partial<Awaited<ReturnType<NarrationApi['chapterTrackMatch']>>> = {}) => ({
      chapterId: 'c1',
      chapterTitle: 'Chapter One',
      projectFile: 'C:/p.rpp',
      savedAt: '2026-09-01T12:00:00Z',
      status: 'matched' as const,
      track: null,
      candidates: [],
      warnings: [],
      tracks: [track('{T-A}', 'Intro', 0), track('{T-B}', 'Chapter One', 1), track('{T-C}', 'Chapter Two', 2)],
      recordedEnd: null,
      ...over,
    });
    const best = { trackGuid: '{T-B}', trackName: 'Chapter One', trackIndex: 1, score: 1, source: 'track-name' as const, region: null };

    it('no track linked: the script is plain, nothing is boxed "not read", and a dialog opens by itself to link the chapter', async () => {
      mount({ api: { ...unlinked, chapterTrackMatch: async () => match({ track: best, candidates: [best] }) } });
      await script();
      const open = await dialog();
      expect(within(open).getByText('Chapter One is not linked to a track')).toBeTruthy();
      expect(open.textContent).toMatch(/no audio to edit/);
      await closeDialog();
      const mark = await shown();
      expect(mark.textContent).toBe('Not linked to a track');
      expect(document.querySelectorAll('[data-mark="miss"]')).toHaveLength(0);
      expect(document.querySelectorAll('[data-k]').length).toBeGreaterThan(0);
      expect(screen.queryByRole('group', { name: /What is marked/ })).toBeNull();
      expect(screen.queryByText('Not transcribed yet')).toBeNull();
      expect(screen.getByText('No audio to edit')).toBeTruthy();
    });

    it('opens by itself once for the chapter: the mark reopens it, and moving off the chapter and back does not', async () => {
      mount({ api: { ...unlinked, chapterTrackMatch: async () => match() } });
      await script();
      await closeDialog();
      await act(async () => {});
      expect(screen.queryByRole('dialog')).toBeNull();
      fireEvent.click(within(await shown()).getByRole('button', { name: /Not linked to a track/ }));
      expect(await dialog()).toBeTruthy();
    });

    it('preselects the best match, lists every track the host found, and links the chosen one in place, then reads the chapter again', async () => {
      const whole = pageApi();
      let linked = false;
      const chapterTrackSet = vi.fn(async (chapterId: string, trackGuid: string) => {
        linked = true;
        return { documentId: 'd', link: { trackGuid, chapterId, chapterTitle: 'Chapter One', confirmedAt: '' }, displaced: null, mappings: [] };
      });
      mount({
        api: {
          chapterTrackMapList: async () => (linked ? await whole.chapterTrackMapList() : { documentId: 'd', mappings: [] }),
          workspaceAlignment: async (chapterId: string) => (linked ? await whole.workspaceAlignment(chapterId) : await unlinked.workspaceAlignment!(chapterId)),
          chapterTrackMatch: async () => match({ track: best, candidates: [best] }),
          chapterTrackSet,
        },
      });
      await script();
      const open = await dialog();
      const group = await within(open).findByRole('radiogroup', { name: 'Track for Chapter One' });
      expect(
        within(group)
          .getAllByRole('radio')
          .map((r) => r.getAttribute('aria-checked')),
      ).toEqual(['true', 'false', 'false']);
      expect(
        within(group)
          .getAllByRole('radio')
          .map((r) => r.closest('label')?.textContent),
      ).toEqual(['Chapter One', 'Intro', 'Chapter Two']);
      expect(within(group).getByText('Best match for this chapter')).toBeTruthy();
      fireEvent.click(within(open).getByRole('button', { name: 'Link track' }));
      await waitFor(() => expect(chapterTrackSet).toHaveBeenCalledWith('c1', '{T-B}'));
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
      await waitFor(() => expect(banner()).toBeNull());
      expect(document.querySelector('[data-mark="mis"]')).not.toBeNull();
    });

    it('shows a refused link in the dialog and keeps it open', async () => {
      mount({
        api: {
          ...unlinked,
          chapterTrackMatch: async () => match({ track: best, candidates: [best] }),
          chapterTrackSet: async () => Promise.reject(new Error('The chapter is not in the manuscript.')),
        },
      });
      await script();
      const open = await dialog();
      await within(open).findByRole('radiogroup');
      fireEvent.click(within(open).getByRole('button', { name: 'Link track' }));
      expect((await within(open).findByRole('alert')).textContent).toContain('The chapter is not in the manuscript.');
    });

    it('says when the saved project has no tracks, and a failed read of them, each with Check again', async () => {
      let tracks = true;
      mount({
        api: {
          ...unlinked,
          chapterTrackMatch: async () => (tracks ? match({ tracks: [] }) : Promise.reject(new Error('The project file could not be read.'))),
        },
      });
      await script();
      const open = await dialog();
      expect(await within(open).findByText(/has no tracks yet/)).toBeTruthy();
      expect(within(open).queryByRole('radiogroup')).toBeNull();
      tracks = false;
      fireEvent.click(within(open).getByRole('button', { name: 'Check again' }));
      expect((await within(open).findByRole('alert')).textContent).toContain('The project file could not be read.');
    });

    it('reads the chapter again when the window is focused while it has no audio, so a link made in REAPER or the engine panel opens it', async () => {
      const whole = pageApi();
      let linked = false;
      mount({
        api: {
          chapterTrackMapList: async () => (linked ? await whole.chapterTrackMapList() : { documentId: 'd', mappings: [] }),
          workspaceAlignment: async (chapterId: string) => (linked ? await whole.workspaceAlignment(chapterId) : await unlinked.workspaceAlignment!(chapterId)),
          chapterTrackMatch: async () => match(),
        },
      });
      await script();
      await closeDialog();
      linked = true;
      act(() => {
        window.dispatchEvent(new Event('focus'));
      });
      await waitFor(() => expect(banner()).toBeNull());
      expect(document.querySelector('[data-mark="mis"]')).not.toBeNull();
    });

    it('a linked track that is missing is the dialog’s, and one with nothing on it is the banner’s', async () => {
      mount({ api: { ...noAudioApi('missing'), chapterTrackMatch: async () => match() } });
      await script();
      const open = await dialog();
      expect(within(open).getByText('Chapter One’s track is not in the project')).toBeTruthy();
      expect(open.textContent).toMatch(/linked track is not in the saved project/);
      cleanup();
      mount({ api: noAudioApi('empty') });
      await script();
      expect(screen.queryByRole('dialog')).toBeNull();
      expect((await shown()).textContent).toMatch(/track has no audio on it/);
    });

    it('a chapter with its track and its words has no banner, and the words keep their marks', async () => {
      mount();
      await script();
      expect(banner()).toBeNull();
      expect(document.querySelector('[data-mark="mis"]')).not.toBeNull();
    });

    it('the built-in recorder, which has no track to link, points at recording instead', async () => {
      mount({ setup: 'builtin', api: unlinked });
      await script();
      const note = await shown();
      expect(note.textContent).toMatch(/Nothing is recorded for Chapter One yet/);
      expect(screen.queryByRole('dialog')).toBeNull();
    });
  });

  describe('daw-off-dialog-is-read-only-and-plays-still-work', () => {
    const dawDialog = () => screen.findByRole('dialog');
    const markOf = () => waitFor(() => document.querySelector<HTMLElement>('#dawoff')!);

    it('shows the capability’s sentence with Start and Check again in a dialog, disables the edits, and still plays', async () => {
      mount({ setup: 'reaper-off', dawConnectGraceMs: 0 });
      await script();
      const open = await dawDialog();
      const sentence = DAW_SETUPS['reaper-off'].capabilities['record'].message!;
      expect(open.textContent).toContain(sentence);
      expect(within(open).getByRole('button', { name: 'Check again' })).toBeTruthy();
      expect(within(open).getByRole('button', { name: 'Start REAPER' })).toBeTruthy();
      expect(within(open).getByText(/You can look at takes, findings and effects/)).toBeTruthy();
      fireEvent.click(within(open).getByRole('button', { name: 'Close' }));
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
      fireEvent.mouseDown(word('p1:1'), { button: 0, detail: 2 });
      const bar = screen.getByRole('toolbar', { name: 'Playback and selection' });
      const del = await within(bar).findByRole('button', { name: /Delete/ });
      await waitFor(() => expect(del.getAttribute('aria-disabled') === 'true' || (del as HTMLButtonElement).disabled).toBe(true));
      fireEvent.click(within(bar).getByRole('button', { name: 'Play the selection' }));
      await waitFor(() => expect(audios.some((a) => a.play.mock.calls.length > 0)).toBe(true));
    });

    it('draws no red banner: a quiet mark stands where it stood and reopens the dialog', async () => {
      mount({ setup: 'reaper-off', dawConnectGraceMs: 0 });
      await script();
      fireEvent.click(within(await dawDialog()).getByRole('button', { name: 'Close' }));
      expect(document.querySelector('#offbanner')).toBeNull();
      const mark = await markOf();
      fireEvent.click(within(mark).getByRole('button', { name: /REAPER not connected/ }));
      expect(await dawDialog()).toBeTruthy();
    });

    it('waits for the app to connect on its own before the dialog opens, and the mark is there meanwhile', async () => {
      mount({ setup: 'reaper-off' });
      await script();
      await markOf();
      await act(async () => {});
      expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('opens by itself once per connection: closing it keeps it closed through later reads, and a lost connection opens it again', async () => {
      const quiet = DAW_SETUPS['reaper-off'];
      const base = createMockDawClient(quiet, { chapterIds: ['c1', 'c2'], candidateIds: ['t1', 't2'], findingIds: [] });
      let current = quiet;
      const daw = { ...base, capabilities: async () => current, subscribeCapabilities: undefined } as DawClient;
      mount({ daw, dawConnectGraceMs: 0 });
      await script();
      fireEvent.click(within(await dawDialog()).getByRole('button', { name: 'Close' }));
      // The window is focused again and the DAW is asked again: still quiet, still closed.
      await act(async () => {
        window.dispatchEvent(new Event('focus'));
      });
      expect(screen.queryByRole('dialog')).toBeNull();
      // It connects: the mark and the dialog go.
      current = DAW_SETUPS['reaper'];
      await act(async () => {
        window.dispatchEvent(new Event('focus'));
      });
      await waitFor(() => expect(document.querySelector('#dawoff')).toBeNull());
      // It is lost again: a new connection loss opens the dialog once more.
      current = quiet;
      await act(async () => {
        window.dispatchEvent(new Event('focus'));
      });
      expect(await dawDialog()).toBeTruthy();
    });

    it('Check again asks the DAW now and says when it last looked; a read that fails says it cannot tell', async () => {
      const quiet = DAW_SETUPS['reaper-off'];
      const base = createMockDawClient(quiet, { chapterIds: ['c1', 'c2'], candidateIds: ['t1', 't2'], findingIds: [] });
      let failing = false;
      const capabilities = vi.fn(async () => (failing ? Promise.reject(new Error('The host did not answer.')) : quiet));
      mount({ daw: { ...base, capabilities } as DawClient, dawConnectGraceMs: 0 });
      await script();
      const open = await dawDialog();
      expect(open.textContent).toMatch(/Waiting for REAPER to answer\. Last checked \d+ s ago\./);
      const before = capabilities.mock.calls.length;
      failing = true;
      fireEvent.click(within(open).getByRole('button', { name: 'Check again' }));
      await waitFor(() => expect(capabilities.mock.calls.length).toBeGreaterThan(before));
      await waitFor(() => expect(open.textContent).toMatch(/Can't tell whether REAPER is answering\. Last heard|Can't tell whether REAPER is answering\./));
    });

    it('Start REAPER runs the host’s launcher, and a refusal is written in the dialog', async () => {
      const launchDaw = vi.fn(async () => Promise.reject(new Error('Link a REAPER project file before starting REAPER.')));
      mount({ setup: 'reaper-off', dawConnectGraceMs: 0, api: { launchDaw } });
      await script();
      const open = await dawDialog();
      fireEvent.click(within(open).getByRole('button', { name: 'Start REAPER' }));
      await waitFor(() => expect(launchDaw).toHaveBeenCalledOnce());
      expect((await within(open).findByRole('alert')).textContent).toContain('Link a REAPER project file before starting REAPER.');
    });

    it('says why Delete, Mute and Add FX are off in words on the page, not only in a hint', async () => {
      mount({ setup: 'reaper-off' });
      await script();
      const notice = await waitFor(() => document.querySelector<HTMLElement>('#editoff')!);
      expect(notice.textContent).toContain('Delete, Mute and Add FX are off.');
      expect(notice.textContent).toContain(DAW_SETUPS['reaper-off'].capabilities['cut_range'].message!);
    });

    it('has no such notice while the edits are on', async () => {
      mount({ setup: 'reaper' });
      await script();
      await act(async () => {});
      expect(document.querySelector('#editoff')).toBeNull();
    });

    it('keeps the setting out of the dialog: a quiet DAW is "not answering", and the switched-off edits are the notice’s to say', async () => {
      const off = { level: 'experimental', available: false, reason: 'experimental_off', message: 'Experimental: switched off in Settings.' } as const;
      const quiet = DAW_SETUPS['reaper-off'];
      const setting = { ...quiet, capabilities: { ...quiet.capabilities, record: off, cut_range: off, fx_range: off } };
      mount({ daw: createMockDawClient(setting, { chapterIds: ['c1', 'c2'], candidateIds: ['t1', 't2'], findingIds: [] }), dawConnectGraceMs: 0 });
      await script();
      const open = await dawDialog();
      expect(open.textContent).toContain('REAPER is not answering.');
      expect(open.textContent).not.toContain('Experimental');
      fireEvent.click(within(open).getByRole('button', { name: 'Close' }));
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
      expect(document.querySelector('#editoff')!.textContent).toContain('Experimental: switched off in Settings.');
    });

    it('blames the connection, not what the engine has not built: Audacity quiet says it is not answering, never "Record is not available with Audacity yet"', async () => {
      const audacity = DAW_SETUPS['audacity'];
      const notAnswering =
        'Audacity is not answering. Open the Audacity chip at the top for the steps: Audacity 3 must be open with scripting turned on (Audacity 4.0 has no scripting pipe).';
      const quiet = {
        ...audacity,
        reachable: false,
        capabilities: { ...audacity.capabilities, navigate: { level: 'experimental', available: false, reason: 'not_running', message: notAnswering } },
      } as const;
      expect(audacity.capabilities['record'].reason).toBe('not_yet');
      mount({ daw: createMockDawClient(quiet, { chapterIds: ['c1', 'c2'], candidateIds: ['t1', 't2'], findingIds: [] }), dawConnectGraceMs: 0 });
      await script();
      const open = await dawDialog();
      expect(open.textContent).toContain(notAnswering);
      expect(open.textContent).not.toContain('Record is not available');
    });

    it('keeps one takes chip in the Tab order: the cursor’s line, or the first before there is a cursor', async () => {
      mount({ chapterId: 'c1' });
      await script();
      await waitFor(() => expect(document.querySelector('[data-tchip="p1"]')).not.toBeNull());
      expect(document.querySelector('[data-tchip="p1"]')!.getAttribute('tabindex')).toBeNull();
      fireEvent.mouseDown(word('p2:1'), { button: 0, detail: 1 });
      await waitFor(() => expect(document.querySelector('[data-tchip="p1"]')!.getAttribute('tabindex')).toBe('-1'));
      fireEvent.mouseDown(word('p1:1'), { button: 0, detail: 1 });
      await waitFor(() => expect(document.querySelector('[data-tchip="p1"]')!.getAttribute('tabindex')).toBeNull());
    });

    it('shows no banner with REAPER linked or the built-in recorder, whose takes can be kept', async () => {
      mount({ setup: 'reaper' });
      await script();
      await act(async () => {});
      expect(document.querySelector('#dawoff')).toBeNull();
      cleanup();
      mount({ setup: 'builtin', passageId: 'ps-1' });
      await script();
      await waitFor(() => expect(document.querySelectorAll('[data-takes="p1"] [data-take]')).toHaveLength(2));
      expect(document.querySelector('#dawoff')).toBeNull();
      // Keeping one of the app's own takes goes through without the DAW being asked to be running.
      const keepT2 = await screen.findByRole('button', { name: 'Keep T-2' });
      await waitFor(() => expect(keepT2.getAttribute('aria-disabled')).not.toBe('true'));
      fireEvent.click(keepT2);
      await waitFor(() => expect(overlay.getSnapshot().toasts.some((t) => /Kept T-2/.test(t.text))).toBe(true));
    });
  });

  it("built-in recorder: hides the other takes and cleans up the app's own takes without a DAW", async () => {
    const base = dawFor('builtin');
    const hideTakes = vi.fn(async () => ({ ok: true, changed: true, message: 'Hid the other takes of this line. Their files are kept.', undoSteps: 1 }));
    mount({ setup: 'builtin', passageId: 'ps-1', daw: { ...base, hideTakes } as DawClient });
    await script();
    await waitFor(() => expect(document.querySelectorAll('[data-takes="p1"] [data-take]')).toHaveLength(2));
    // The recorder declares both edits itself: takes (hide) and cut_range (an edit list, mode app), with no DAW running.
    const support = (await base.capabilities()).capabilities;
    expect(support.takes).toMatchObject({ available: true, level: 'experimental' });
    expect(support.cut_range).toMatchObject({ available: true, level: 'experimental', mode: 'app' });
    expect(document.querySelector('#dawoff')).toBeNull();
    const keep = await screen.findByRole('button', { name: 'Keep T-2' });
    await waitFor(() => expect(keep.getAttribute('aria-disabled')).not.toBe('true'));
    fireEvent.click(keep);
    await waitFor(() => expect(overlay.getSnapshot().toasts.some((t) => /Kept T-2/.test(t.text))).toBe(true));
    // Hide the other takes: asked first, then the recorder hides them (never deletes) and one undo entry is made.
    fireEvent.click(await screen.findByRole('button', { name: /Hide the other 1 take/ }));
    await waitFor(() => expect(overlay.getSnapshot().dialogs.some((d) => d.kind === 'confirm')).toBe(true));
    act(() => {
      const dialog = overlay.getSnapshot().dialogs.find((d) => d.kind === 'confirm');
      if (dialog?.kind === 'confirm') dialog.answer(true);
    });
    await waitFor(() => expect(hideTakes).toHaveBeenCalledTimes(1));
  });

  it('Stack as 2 takes splits the take through the DAW from the mounted page', async () => {
    // Line one is read twice: the second read is the extra words heard after its last word, 2.4 s later.
    const base = pageApi();
    const read = ['The', 'Garden', 'was', 'quiet', 'today.'].map((text, i) => ({
      text,
      item: 0,
      start: 5 + i * 0.4,
      end: 5.35 + i * 0.4,
      conf: 0.9,
      timing: 'aligned',
    }));
    const api = {
      workspaceAlignment: async (id: string) => {
        const answer = await base.workspaceAlignment(id);
        if (id !== 'c1' || answer.state !== 'current') return answer;
        const at = { itemIndex: 0, itemGuid: '{ITEM-1}' };
        const extra = {
          text: read.map((w) => w.text).join(' '),
          tokens: read.length,
          start: { ...at, sourceTime: 5 },
          end: { ...at, sourceTime: 7 },
          afterToken: 4,
          words: read,
        };
        // The "um" and the misread "quiet" are gone, so the first four words are heard twice, one after another.
        const tokens = answer.tokens.map(({ heard: _heard, ...t }) => ({ ...t, status: 'read' as const }));
        return { ...answer, tokens, extras: [extra] };
      },
    } as Partial<NarrationApi>;
    const splitTake = vi.fn<DawClient['splitTake']>();
    const project = { chapterIds: ['c1', 'c2'], candidateIds: ['t1', 't2'], findingIds: [], splitTakes: { t1: { start: 0, length: 12 } } };
    const mock = createMockDawClient(DAW_SETUPS.reaper, project);
    splitTake.mockImplementation(mock.splitTake);
    mount({ passageId: 'ps-1', api, daw: { ...mock, splitTake } as DawClient });
    await script();
    fireEvent.click(await screen.findByRole('button', { name: 'Split into takes' }));
    await waitFor(() => expect(overlay.getSnapshot().dialogs.some((d) => d.kind === 'confirm')).toBe(true));
    act(() => {
      const dialog = overlay.getSnapshot().dialogs.find((d) => d.kind === 'confirm');
      if (dialog?.kind === 'confirm') dialog.answer(true);
    });
    await waitFor(() => expect(splitTake).toHaveBeenCalledTimes(1));
    const [chapterId, takeId, cutAt] = splitTake.mock.calls[0];
    expect([chapterId, takeId]).toEqual(['c1', 't1']);
    // The middle of the pause between the first read (ends 2.95) and the second (starts 5), on the item's project time.
    expect(cutAt).toBeCloseTo(3.975, 2);
    await waitFor(() => expect(overlay.getSnapshot().toasts.some((t) => /Split T-1 at/.test(t.text))).toBe(true));
  });

  it('strip-and-drawer-toggles-follow-the-width', async () => {
    mount();
    await script();
    const strip = await screen.findByRole('button', { name: 'Timeline' });
    expect(strip.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(strip);
    expect(strip.getAttribute('aria-pressed')).toBe('true');
    expect(document.querySelector('#timeline')).not.toBeNull();
    press('s');
    expect(strip.getAttribute('aria-pressed')).toBe('false');
    expect(drawerButton().getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(drawerButton());
    expect(drawerButton().getAttribute('aria-pressed')).toBe('true');
    expect(document.querySelector('#drawer')).not.toBeNull();
    press('C', { ctrlKey: true, shiftKey: true });
    expect(document.querySelector('#drawer')).toBeNull();
    cleanup();
    width = 1200;
    mount();
    await script();
    expect(screen.queryByRole('button', { name: 'Timeline' })).toBeNull();
    expect(drawerButton()).toBeTruthy();
  });

  it('Escape closes the drawer, from the text or from its tabs, and from its tabs gives the focus back to its button', async () => {
    mount();
    await script();
    fireEvent.click(drawerButton());
    expect(document.querySelector('#drawer')).not.toBeNull();
    press('Escape');
    expect(document.querySelector('#drawer')).toBeNull();
    fireEvent.click(drawerButton());
    const tab = within(document.querySelector<HTMLElement>('#drawer')!).getAllByRole('tab')[0];
    act(() => tab.focus());
    act(() => void fireEvent.keyDown(tab, { key: 'Escape', code: 'Escape' }));
    expect(document.querySelector('#drawer')).toBeNull();
    expect(document.activeElement).toBe(drawerButton());
  });

  it('measures the window, not the page beside the rail, as the mock does', async () => {
    // A 1440 window leaves the page root about 1150 wide; the mock still draws the full legend and the strip toggle.
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      const w = this === document.documentElement ? 1440 : 1150;
      return { width: w, height: 800, top: 0, left: 0, right: w, bottom: 800, x: 0, y: 0, toJSON: () => ({}) };
    });
    mount();
    await script();
    expect(await screen.findByRole('button', { name: 'Timeline' })).toBeTruthy();
    expect(document.querySelector('[data-legend="extra"] [data-legend-label]')!.textContent).toBe('Not in the script · 1');
  });

  it('below 1360, S opens the drawer on Timeline and closes it again', async () => {
    width = 1280;
    mount();
    await script();
    expect(screen.queryByRole('button', { name: 'Timeline' })).toBeNull();
    press('s');
    expect(drawerButton().getAttribute('aria-pressed')).toBe('true');
    expect(
      within(document.querySelector<HTMLElement>('#drawer')!)
        .getByRole('tab', { name: /^Timeline/ })
        .getAttribute('aria-selected'),
    ).toBe('true');
    press('s');
    expect(document.querySelector('#drawer')).toBeNull();
    // On another tab, S moves to Timeline instead of closing.
    fireEvent.click(drawerButton());
    fireEvent.click(within(document.querySelector<HTMLElement>('#drawer')!).getByRole('tab', { name: /^Effects/ }));
    press('s');
    expect(
      within(document.querySelector<HTMLElement>('#drawer')!)
        .getByRole('tab', { name: /^Timeline/ })
        .getAttribute('aria-selected'),
    ).toBe('true');
  });

  it('names the chapter in each heading style at 12 and 40 chapters', async () => {
    for (const style of ['gutenberg', 'numbered', 'colon'] as HeadingStyle[]) {
      for (const count of [12, 40]) {
        for (const n of [1, count]) {
          cleanup();
          mount({ chapterId: `s${n}`, api: { manuscriptChapters: async () => styledChapters(style, count) } });
          const name = `${HEADING_LABELS[style](n)} Title of ${n}`;
          expect(await screen.findByRole('button', { name: `Chapter: ${name}. Change chapter` }), `${style} ${count}: ${name}`).toBeTruthy();
        }
      }
    }
  });

  describe('the Enter hint names what Enter does here', () => {
    const hint = () => screen.getByRole('note', { name: 'Keyboard shortcuts' }).textContent ?? '';
    it('points at T on a word that is not flagged, and says Keep take once the takes are open', async () => {
      mount();
      await script();
      press('ArrowRight');
      await waitFor(() => expect(cursorKey()).toBe('w-p1:0'));
      expect(hint()).toContain('Keep take (T picks which)');
      press('t');
      await waitFor(() => expect(hint()).not.toContain('T picks which'));
      expect(hint()).toContain('Keep take');
    });
    it('says Open flag card on a flagged word, where Enter opens the card and does not keep a take', async () => {
      mount({ findingId: FINDING.id });
      await script();
      await waitFor(() => expect(cursorKey()).toBe('w-p1:3'));
      expect(hint()).toContain('Open flag card');
      expect(hint()).not.toContain('Keep take');
    });
  });

  describe('opens-at-a-passage-from-another-page', () => {
    it('opens a passage with its takes open under the line', async () => {
      mount({ chapterId: 'c1', passageId: 'ps-1' });
      await script();
      await waitFor(() => expect(document.querySelectorAll('[data-takes="p1"] [data-take]')).toHaveLength(2));
      expect(document.querySelector('[data-tchip="p1"]')!.getAttribute('aria-expanded')).toBe('true');
      expect(cursorKey()).toBe('w-p1:0');
    });
    it('opens a finding on the flagged word it names', async () => {
      mount({ findingId: FINDING.id });
      await script();
      await waitFor(() => expect(cursorKey()).toBe('w-p1:3'));
      expect(within(screen.getByRole('toolbar', { name: 'Playback and selection' })).getByText('1 word')).toBeTruthy();
      expect(document.querySelector('[data-flagcard]')).not.toBeNull();
    });
    it('opens a finding on all the words it names: its expected text in its paragraph, not the first word', async () => {
      const named = { id: 'f-run', manuscript: { chapter_id: 'c1', expected: 'turned and walked', span: { paragraph_id: 'p2' } } };
      mount({ findingId: 'f-run', api: { findingsGet: async () => named } as never });
      await script();
      await waitFor(() => expect(within(screen.getByRole('toolbar', { name: 'Playback and selection' })).getByText('3 words')).toBeTruthy());
    });
    it('keeps the finding’s words selected when the passage it came with is found later, as Proof’s Manage takes sends both', async () => {
      const named = { id: 'f-run', manuscript: { chapter_id: 'c1', expected: 'turned and walked', span: { paragraph_id: 'p2' } } };
      mount({ findingId: 'f-run', passageId: 'ps-1', api: { findingsGet: async () => named } as never });
      await script();
      await waitFor(() => expect(document.querySelector('[data-tchip="p1"]')!.getAttribute('aria-expanded')).toBe('true'));
      await act(async () => {});
      expect(within(screen.getByRole('toolbar', { name: 'Playback and selection' })).getByText('3 words')).toBeTruthy();
    });
    // SN-E9: the editing check's "Clean up in Editing" opens the page with the drawer on Clean up.
    it('opens with the drawer on the tab it is given', async () => {
      mount({ drawer: 'cleanup' });
      await script();
      expect(drawerButton().getAttribute('aria-pressed')).toBe('true');
      expect(await screen.findByRole('region', { name: 'Clean up findings' })).toBeTruthy();
    });
    it('Clean up Apply is on for Breaths with a DAW that reports range_gain', async () => {
      const breath = finding({ id: 'b1', start: 20, end: 20.4, cls: 'breath', db: -22 });
      const api = { findingsList: async () => ({ findings: [breath], total: 1 }), editingCandidates: async () => [breath] };
      mount({ drawer: 'cleanup', api });
      await script();
      fireEvent.click(await screen.findByRole('button', { name: /^Breaths/ }));
      const apply = await screen.findByRole('button', { name: 'Apply to 1 selected' });
      await waitFor(() => expect((apply as HTMLButtonElement).disabled).toBe(false));
    });
    it('opens a time with the playhead there', async () => {
      mount({ t: 1.1 });
      await script();
      await waitFor(() => expect(cursorKey()).toBe('w-p1:1'));
      expect(screen.getByRole('toolbar', { name: 'Playback and selection' }).textContent).toContain(clock(1.1));
    });
  });

  it('chapter-step-keeps-the-page-state-clean', async () => {
    const onChapter = vi.fn();
    // Both chapters are linked, so no link dialog opens when the page steps to the second (that is the next test's).
    const links = {
      documentId: 'd',
      mappings: ['c1', 'c2'].map((chapterId) => ({ chapterId, trackGuid: '{TRACK-1}', chapterTitle: chapterId, confirmedAt: '' })),
    };
    mount({ onChapter, findingId: FINDING.id, t: 1.1, api: { chapterTrackMapList: async () => links } });
    await script();
    const bar = () => screen.getByRole('toolbar', { name: 'Playback and selection' });
    // A card open on the finding's word, and the playhead where the link put it.
    await waitFor(() => expect(document.querySelector('[data-flagcard]')).not.toBeNull());
    expect(bar().textContent).toContain(`${clock(1.1)} /`);
    press('ArrowDown', { altKey: true });
    expect(onChapter).toHaveBeenLastCalledWith('c2');
    expect(await screen.findByText('This chapter has no text yet.')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Chapter: Chapter Two/ })).toBeTruthy();
    press('ArrowUp', { altKey: true });
    await script();
    expect(onChapter).toHaveBeenLastCalledWith('c1');
    // Cursor, card and playhead are gone; the old chapter's keys did not come back with it.
    expect(cursorKey()).toBeNull();
    expect(document.querySelector('[data-flagcard]')).toBeNull();
    expect(bar().textContent).toContain('Click a word to place the cursor');
    expect(bar().textContent).toContain('0:00 /');
    // A selection does not survive a step either.
    fireEvent.mouseDown(word('p1:1'), { button: 0 });
    fireEvent.mouseDown(word('p1:3'), { button: 0, shiftKey: true });
    expect(await screen.findByRole('toolbar', { name: 'Selection' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Next chapter' }));
    await screen.findByText('This chapter has no text yet.');
    fireEvent.click(screen.getByRole('button', { name: 'Previous chapter' }));
    await script();
    expect(screen.queryByRole('toolbar', { name: 'Selection' })).toBeNull();
    expect(document.querySelectorAll('[aria-selected="true"], [data-sel]')).toHaveLength(0);
    expect(cursorKey()).toBeNull();
  });

  it('unmount-stops-everything', async () => {
    const host = { api: pageApi(), daw: dawFor('reaper'), journal: newJournal() };
    const view = render(
      <EditingHost {...host}>
        <EditingPage hasManuscript passageId="ps-1" />
      </EditingHost>,
    );
    await script();
    await waitFor(() => expect(document.querySelectorAll('[data-takes="p1"] [data-take]')).toHaveLength(2));
    const doc = buildDoc({
      paragraphs: [],
      aligner: { engine: () => ({ id: '', name: '' }), snap: (s) => s, heard: () => null },
      cuts: [],
      effects: [],
      accepted: [],
    });
    const seen: Record<string, number> = {};
    function Probe() {
      seen.bar = useSelectionActions('bar').length;
      seen.toolbar = useSelectionActions('toolbar').length;
      seen.takes = useTakeControls().length;
      seen.flags = Object.keys(useFlagActions()).length;
      return null;
    }
    const registries = () => {
      const probe = render(<Probe />);
      probe.unmount();
      return {
        ...seen,
        drawer: (['cleanup', 'effects', 'backups'] as const).reduce((n, tab) => n + drawSections(tab, { doc, chapterId: 'c1' }).length, 0),
        commands: providedCommands().filter((c) => c.group === 'Editing').length,
      };
    };
    const detachedWord = () => {
      const box = document.createElement('div');
      box.dataset.script = '';
      box.innerHTML = '<span data-k="p1:1">Garden</span>';
      return box.firstElementChild!;
    };

    // While mounted, every registry holds the page's entries and the word menu answers.
    const before = registries();
    for (const [name, n] of Object.entries(before)) expect(n, name).toBeGreaterThan(0);
    expect(contextItemsFor(word('p1:1'))).not.toBeNull();

    fireEvent.mouseDown(word('p1:0'), { button: 0 });
    fireEvent.click(within(screen.getByRole('toolbar', { name: 'Playback and selection' })).getByRole('button', { name: /^Play/ }));
    await waitFor(() => expect(audios.some((a) => a.play.mock.calls.length > 0)).toBe(true));
    const playing = audios.find((a) => a.play.mock.calls.length > 0)!;

    // Unmount the page and keep the shell (router, overlay, context menu) mounted.
    view.rerender(<EditingHost {...host}>{null}</EditingHost>);
    expect(playing.pause).toHaveBeenCalled();
    expect(registries()).toEqual({ bar: 0, toolbar: 0, takes: 0, flags: 0, drawer: 0, commands: 0 });
    expect(contextItemsFor(detachedWord())).toBeNull();

    // No key handler is left behind: Space plays nothing and Delete asks nothing.
    const plays = audios.reduce((n, a) => n + a.play.mock.calls.length, 0);
    press(' ', { code: 'Space' });
    press('Delete');
    expect(audios.reduce((n, a) => n + a.play.mock.calls.length, 0)).toBe(plays);
    expect(overlay.getSnapshot().dialogs).toHaveLength(0);
  });

  describe('whole-page-composes-the-slices', () => {
    it('shows every filled slot exactly once', async () => {
      mount({ passageId: 'ps-1' });
      await script();
      await waitFor(() => expect(document.querySelectorAll('[data-takes="p1"] [data-take]')).toHaveLength(2));
      fireEvent.mouseDown(word('p1:1'), { button: 0, detail: 2 });
      const bar = screen.getByRole('toolbar', { name: 'Playback and selection' });
      for (const name of [/^Delete/, /^Mute/, /^Add FX/]) expect(within(bar).getAllByRole('button', { name })).toHaveLength(1);
      expect(await screen.findAllByRole('toolbar', { name: 'Selection' })).toHaveLength(1);
      fireEvent.click(drawerButton());
      const drawer = document.querySelector<HTMLElement>('#drawer')!;
      expect(within(drawer).getAllByRole('region', { name: 'Clean up findings' })).toHaveLength(1);
      fireEvent.click(within(drawer).getByRole('tab', { name: /^Effects/ }));
      expect(within(drawer).getAllByRole('region', { name: 'Effects' })).toHaveLength(1);
      const footer = document.querySelector<HTMLElement>('[data-takes="p1"] [data-takes-footer]');
      const ids = Array.from(footer?.querySelectorAll('button') ?? []).map((b) => b.textContent);
      expect(new Set(ids).size).toBe(ids.length);
      fireEvent.contextMenu(word('p1:1'));
      const menu = await screen.findByRole('menu');
      for (const name of ['Copy words', 'Mark for pickup']) expect(within(menu).getAllByRole('menuitem', { name: new RegExp(`^${name}`) })).toHaveLength(1);
    });

    it('renders without error while no slice has anything to offer', async () => {
      const silent = { ...createMockDawClient(DAW_SETUPS.reaper), capabilities: () => new Promise<never>(() => {}) } as DawClient;
      mount({ daw: silent });
      await script();
      expect(screen.getByRole('toolbar', { name: 'Playback and selection' })).toBeTruthy();
      expect(screen.getByRole('note', { name: 'Keyboard shortcuts' })).toBeTruthy();
    });
  });

  describe('the controls reach the host', () => {
    it("the word menu's Play selection plays the words", async () => {
      mount();
      await script();
      fireEvent.mouseDown(word('p1:0'), { button: 0 });
      fireEvent.contextMenu(word('p1:0'));
      const menu = await screen.findByRole('menu');
      fireEvent.click(within(menu).getByRole('menuitem', { name: /^Play selection/ }));
      await waitFor(() => expect(audios.some((a) => a.play.mock.calls.length > 0)).toBe(true));
    });

    it("Clean up's Preview plays through the page's playback", async () => {
      const breath = finding({ id: 'b1', start: 2, end: 2.4, cls: 'breath', db: -22 });
      mount({ drawer: 'cleanup', api: { findingsList: async () => ({ findings: [breath], total: 1 }), editingCandidates: async () => [breath] } });
      await script();
      const drawer = document.querySelector<HTMLElement>('#drawer')!;
      fireEvent.click(await within(drawer).findByRole('button', { name: /^Breaths/ }));
      fireEvent.click(within(drawer).getByRole('button', { name: 'Preview' }));
      expect(within(drawer).queryByText(/this page has no playback/)).toBeNull();
      await waitFor(() => expect(audios.some((a) => a.play.mock.calls.length > 0)).toBe(true));
    });

    it("the toolbar's Takes of this line opens the line's takes", async () => {
      mount({ chapterId: 'c1' });
      await script();
      await waitFor(() => expect(document.querySelector('[data-tchip="p1"]')).not.toBeNull());
      expect(document.querySelector('[data-tchip="p1"]')!.getAttribute('aria-expanded')).toBe('false');
      fireEvent.mouseDown(word('p1:1'), { button: 0, detail: 2 });
      const toolbar = await screen.findByRole('toolbar', { name: 'Selection' });
      fireEvent.click(await within(toolbar).findByRole('button', { name: 'Takes of this line' }));
      await waitFor(() => expect(document.querySelector('[data-tchip="p1"]')!.getAttribute('aria-expanded')).toBe('true'));
    });

    it("the takes footer's Show in the DAW moves the DAW to the line", async () => {
      const goTo = vi.fn(async () => ({ outcome: 'navigated' as const, projectTime: 65 }));
      const toast = vi.spyOn(overlay, 'toast');
      mount({ chapterId: 'c1', passageId: 'ps-1', api: { workspaceGoTo: goTo } as never });
      await script();
      const footer = await waitFor(() => {
        const el = document.querySelector<HTMLElement>('[data-takes="p1"] [data-takes-footer]');
        expect(el).not.toBeNull();
        return el!;
      });
      fireEvent.click(await within(footer).findByRole('button', { name: 'Show in the DAW' }));
      await waitFor(() => expect(goTo).toHaveBeenCalledWith('c1', expect.any(Number)));
      await waitFor(() => expect(toast).toHaveBeenCalledWith('Moved to 1:05 in the DAW.'));
    });

    it("the Clean up tab starts with the chapter's retry bar", async () => {
      mount({ chapterId: 'c1', drawer: 'cleanup' });
      await script();
      const drawer = document.querySelector<HTMLElement>('#drawer')!;
      const retries = await within(drawer).findByRole('region', { name: 'Retries' });
      expect(within(retries).getByText(/How retries are kept/)).toBeTruthy();
    });

    it('Undo choice takes a kept take back', async () => {
      const journal = createJournal({ dawName: () => 'the DAW', dawLastAction: async () => 'this' });
      render(
        <EditingHost api={pageApi()} daw={dawFor('reaper')} journal={journal}>
          <EditingPage hasManuscript chapterId="c1" passageId="ps-1" />
        </EditingHost>,
      );
      await script();
      await waitFor(() => expect(document.querySelectorAll('[data-takes="p1"] [data-take]')).toHaveLength(2));
      const lines = document.querySelector<HTMLElement>('[data-takes="p1"]')!;
      const keeps = within(lines).getAllByRole('button', { name: /^Keep / });
      fireEvent.click(keeps[keeps.length - 1]!);
      const undo = await within(lines).findByRole('button', { name: 'Undo choice' });
      fireEvent.click(undo);
      await waitFor(() => expect(within(lines).queryByRole('button', { name: 'Undo choice' })).toBeNull());
    });

    it('the marker after an effect selects its words and takes it off', async () => {
      const fx = {
        id: 'fx-1',
        chapterId: 'c1',
        pid: 'p1',
        keys: ['p1:1', 'p1:2'],
        words: [word('p1:1')?.textContent ?? '', ''],
        text: 'the words',
        a: 0,
        b: 1,
        off0: 0,
        off1: 1,
        chainId: 'Warm.RfxChain',
        chainName: 'Warm',
        source: 'REAPER',
        fadeMs: 10,
        daw: 'reaper',
        guid: 'g',
        at: '2026-10-01T00:00:00Z',
        paragraph: 0,
        stale: false,
        bypassed: false,
      };
      const removeFx = vi.fn(async () => ({ chapterId: 'c1', effects: [] }));
      mount({ api: { editingWordFxList: async (chapterId: string) => ({ chapterId, effects: [fx] }), editingWordFxRemove: removeFx } as never });
      await script();
      const [marker] = await within(await script()).findAllByRole('button', { name: 'Warm on the words. Options' });
      // The word menu offers to take it off too.
      fireEvent.contextMenu(word('p1:1'));
      expect(within(await screen.findByRole('menu')).getByRole('menuitem', { name: 'Remove Warm' })).toBeTruthy();
      fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
      await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
      fireEvent.click(marker!);
      fireEvent.click(await screen.findByRole('menuitem', { name: 'Select the words' }));
      await waitFor(() => expect(word('p1:1').hasAttribute('data-sel')).toBe(true));
      fireEvent.click(marker!);
      fireEvent.click(await screen.findByRole('menuitem', { name: 'Remove the effect' }));
      await waitFor(() => expect(removeFx).toHaveBeenCalled());
    });

    it('a DAW that edits in steps backs the words up before a cut', async () => {
      const base = dawFor('audacity-backups');
      const backupAround = vi.fn(base.backupAround);
      mount({ daw: { ...base, backupAround } });
      await script();
      fireEvent.mouseDown(word('p1:0'), { button: 0 });
      press('Delete');
      const dialog = await screen.findByRole('dialog');
      const go = within(dialog).getByRole('button', { name: /^Delete/ });
      await waitFor(() => expect(go.getAttribute('aria-disabled')).not.toBe('true'));
      fireEvent.click(go);
      await waitFor(() => expect(backupAround).toHaveBeenCalledTimes(1));
      expect(backupAround.mock.calls[0]![0]).toMatchObject({ chapterId: expect.any(String), firstToken: expect.any(Number) });
    });
  });

  it('axe-and-landmarks', async () => {
    for (const w of [1440, 1200]) {
      width = w;
      for (const theme of ['light', 'dark']) {
        document.documentElement.dataset.theme = theme;
        mount({ passageId: 'ps-1' });
        await script();
        expect(screen.getByRole('region', { name: 'Script editor' })).toBeTruthy();
        expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
        const result = await axe.run(document.body, { rules: { region: { enabled: false } } });
        expect(result.violations.map((v) => v.id)).toEqual([]);
        cleanup();
      }
    }
    delete document.documentElement.dataset.theme;
  });
});

// The loading state (definition-of-done.md state matrix): the page's header stays and the script is blocks while the chapters, or the chapter's
// lines, are read; then the page, the empty panel or the error; never a blank page or an endless skeleton.
describe('EditingPage loading state', () => {
  const never = () => new Promise<never>(() => {});
  const region = (name: string) => screen.queryByRole('group', { name });

  it('keeps the title and the header buttons and shows a busy region while the chapters are read, however long that takes', async () => {
    mount({ api: { manuscriptChapters: never } });
    expect(await screen.findByRole('heading', { level: 1, name: 'Editing' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Clean up and effects' })).toBeTruthy();
    expect(region('Loading the editor')?.getAttribute('aria-busy')).toBe('true');
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(region('Loading the editor')).toBeTruthy();
  });

  it('is replaced by the script when the chapters and lines arrive', async () => {
    mount();
    await script();
    expect(region('Loading the editor')).toBeNull();
    expect(region('Loading the chapter')).toBeNull();
  });

  it('shows the chapter skeleton, under the stepper, while one chapter is read', async () => {
    mount({ api: { manuscriptParagraphs: never } });
    expect(await screen.findByRole('group', { name: 'Loading the chapter' })).toBeTruthy();
    expect(screen.getByRole('group', { name: 'Chapter' })).toBeTruthy();
  });

  it('shows the empty panel, not a skeleton, for a manuscript with no narration chapters', async () => {
    mount({ api: { manuscriptChapters: async () => [] } });
    expect(await screen.findByText('This manuscript has no chapters to edit')).toBeTruthy();
    expect(region('Loading the editor')).toBeNull();
  });

  it('shows the error, not a skeleton, when the chapters cannot be read', async () => {
    mount({ api: { manuscriptChapters: () => Promise.reject(new Error('The manuscript could not be read.')) } });
    expect(await screen.findByText('The manuscript could not be read.')).toBeTruthy();
    expect(region('Loading the editor')).toBeNull();
  });

  // A failed read of the chapters (the page), or of one chapter's lines (the chapter under its stepper), offers Retry that reads again.
  describe.each([
    {
      what: 'the chapters',
      seam: 'manuscriptChapters',
      // The page-level error stands in for the page: its own title, no stepper.
      keepsStepper: false,
      skeleton: 'Loading the editor',
    },
    {
      what: 'a chapter',
      seam: 'workspaceAlignment',
      // The chapter's error sits under the stepper, so the narrator can still pick another chapter.
      keepsStepper: true,
      skeleton: 'Loading the chapter',
    },
  ])('a failed read of $what offers Retry', ({ seam, keepsStepper, skeleton }) => {
    const sentence = 'The read failed.';
    const fail = () => Promise.reject(new Error(sentence));
    const retry = () => screen.getByRole('button', { name: 'Retry' });
    // Each call takes the next step; the last step repeats.
    const steps = (list: Array<() => Promise<unknown>>) => vi.fn(() => (list.length > 1 ? (list.shift() as () => Promise<unknown>)() : list[0]()));
    const mountWith = (read: unknown) => mount({ api: { [seam]: read } as Partial<NarrationApi> });
    const real = () => pageApi()[seam as 'manuscriptChapters' | 'workspaceAlignment'] as unknown as (...args: string[]) => Promise<unknown>;

    it('shows the sentence as an alert with Retry, and no skeleton', async () => {
      mountWith(fail);
      const text = await screen.findByText(sentence);
      expect(text.getAttribute('role')).toBe('alert');
      expect(retry()).toBeTruthy();
      expect(region(skeleton)).toBeNull();
      expect(!!screen.queryByRole('group', { name: 'Chapter' })).toBe(keepsStepper);
    });

    it('shows the skeleton with no stale error while it reads again, then the script', async () => {
      let release: () => void = () => {};
      const held = new Promise<void>((resolve) => (release = resolve));
      mountWith(steps([fail, () => held.then(() => real()('c1'))]));
      await screen.findByText(sentence);
      await act(async () => retry().click());
      expect(region(skeleton)?.getAttribute('aria-busy')).toBe('true');
      expect(screen.queryByText(sentence)).toBeNull();
      expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
      await act(async () => release());
      await script();
      expect(region(skeleton)).toBeNull();
    });

    it('shows the new error with Retry when the second read fails too', async () => {
      mountWith(steps([() => Promise.reject(new Error('first')), () => Promise.reject(new Error('second'))]));
      await screen.findByText('first');
      await act(async () => retry().click());
      expect(await screen.findByText('second')).toBeTruthy();
      expect(screen.queryByText('first')).toBeNull();
      expect(retry()).toBeTruthy();
    });

    it('reads again once for a double press, as for a single press', async () => {
      // The page asks for the same answer from more than one place, so a double press is compared with a single one, not with a number.
      const reads = async (presses: number) => {
        const read = steps([fail, () => new Promise<never>(() => {})]);
        const view = mountWith(read);
        await screen.findByText(sentence);
        const before = read.mock.calls.length;
        const button = retry();
        await act(async () => {
          for (let press = 0; press < presses; press++) button.click();
        });
        const extra = read.mock.calls.length - before;
        view.unmount();
        cleanup();
        return extra;
      };
      const single = await reads(1);
      expect(single).toBeGreaterThan(0);
      expect(await reads(2)).toBe(single);
    });

    it('sets nothing when the page is left mid-retry', async () => {
      let release: () => void = () => {};
      const held = new Promise<void>((resolve) => (release = resolve));
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const view = mountWith(steps([fail, () => held.then(() => real()('c1'))]));
      await screen.findByText(sentence);
      await act(async () => retry().click());
      view.unmount();
      await act(async () => release());
      expect(spy).not.toHaveBeenCalled();
    });
  });
});
