// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import axe from 'axe-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DAW_SETUPS, type DawSetupId } from '../../fixtures/daw';
import { EnginePanelProvider } from '../engine/EnginePanelContext';
import { providedCommands } from '../../input/commandProviders';
import { contextItemsFor } from '../../registries/context';
import { overlay } from '../../overlay/overlayService';
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

function mount({ setup = 'reaper', daw, api = {}, ...props }: Options = {}) {
  const view = render(
    <EditingHost api={pageApi(api)} daw={daw ?? dawFor(setup)} journal={newJournal()}>
      <EditingPage hasManuscript {...props} />
    </EditingHost>,
  );
  return view;
}

const script = () => screen.findByRole('textbox', { name: 'Script with what was heard' });
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

  describe('a-chapter-with-no-audio-says-why-and-where-to-fix-it', () => {
    const unlinked = noAudioApi('unlinked');
    const banner = () => document.querySelector<HTMLElement>('#noaudio');
    const shown = () =>
      waitFor(() => {
        const note = banner();
        expect(note).not.toBeNull();
        return note!;
      });

    it('no track linked: the script is plain, nothing is boxed "not read", and the banner offers the audio engine panel', async () => {
      const openPanel = vi.fn();
      render(
        <EditingHost api={pageApi(unlinked)} daw={dawFor('reaper')} journal={newJournal()}>
          <EnginePanelProvider value={openPanel}>
            <EditingPage hasManuscript />
          </EnginePanelProvider>
        </EditingHost>,
      );
      await script();
      const note = await shown();
      expect(note.getAttribute('role')).toBe('status');
      expect(note.textContent).toMatch(/Chapter One is not linked to a track/);
      expect(note.textContent).toMatch(/no audio to edit/);
      expect(document.querySelectorAll('[data-mark="miss"]')).toHaveLength(0);
      expect(document.querySelectorAll('[data-k]').length).toBeGreaterThan(0);
      expect(screen.queryByRole('group', { name: /What is marked/ })).toBeNull();
      expect(screen.queryByText('Not transcribed yet')).toBeNull();
      expect(screen.getByText('No audio to edit')).toBeTruthy();
      fireEvent.click(within(note).getByRole('button', { name: 'Open the audio engine panel' }));
      expect(openPanel).toHaveBeenCalledOnce();
    });

    it.each([
      ['missing', /linked track is not in the saved project/],
      ['empty', /track has no audio on it/],
    ] as const)('a linked track that is %s says so', async (kind, sentence) => {
      mount({ api: noAudioApi(kind) });
      await script();
      expect((await shown()).textContent).toMatch(sentence);
    });

    it('Read again reads the chapter again, so a link made in the audio engine panel opens the chapter', async () => {
      const whole = pageApi();
      let linked = false;
      mount({
        api: {
          chapterTrackMapList: async () => (linked ? await whole.chapterTrackMapList() : { documentId: 'd', mappings: [] }),
          workspaceAlignment: async (chapterId: string) => (linked ? await whole.workspaceAlignment(chapterId) : await unlinked.workspaceAlignment!(chapterId)),
        },
      });
      await script();
      const note = await shown();
      linked = true;
      fireEvent.click(within(note).getByRole('button', { name: 'Read again' }));
      await waitFor(() => expect(banner()).toBeNull());
      expect(document.querySelector('[data-mark="mis"]')).not.toBeNull();
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
      expect(within(note).queryByRole('button', { name: 'Open the audio engine panel' })).toBeNull();
    });
  });

  describe('daw-off-banner-is-read-only-and-plays-still-work', () => {
    it('shows the capability’s sentence with Retry, disables the edits with it, and still plays', async () => {
      mount({ setup: 'reaper-off' });
      await script();
      const banner = await waitFor(() => document.querySelector<HTMLElement>('#offbanner')!);
      const sentence = DAW_SETUPS['reaper-off'].capabilities['record'].message!;
      expect(banner.textContent).toContain(sentence);
      expect(within(banner).getByRole('button', { name: 'Retry' })).toBeTruthy();
      fireEvent.mouseDown(word('p1:1'), { button: 0, detail: 2 });
      const bar = screen.getByRole('toolbar', { name: 'Playback and selection' });
      const del = await within(bar).findByRole('button', { name: /Delete/ });
      await waitFor(() => expect(del.getAttribute('aria-disabled') === 'true' || (del as HTMLButtonElement).disabled).toBe(true));
      fireEvent.click(within(bar).getByRole('button', { name: 'Play the selection' }));
      await waitFor(() => expect(audios.some((a) => a.play.mock.calls.length > 0)).toBe(true));
    });

    it('shows no banner with REAPER linked or the built-in recorder, whose takes can be kept', async () => {
      mount({ setup: 'reaper' });
      await script();
      await act(async () => {});
      expect(document.querySelector('#offbanner')).toBeNull();
      cleanup();
      mount({ setup: 'builtin', passageId: 'ps-1' });
      await script();
      await waitFor(() => expect(document.querySelectorAll('[data-takes="p1"] [data-take]')).toHaveLength(2));
      expect(document.querySelector('#offbanner')).toBeNull();
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
    expect(document.querySelector('#offbanner')).toBeNull();
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
    mount({ onChapter, findingId: FINDING.id, t: 1.1 });
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
