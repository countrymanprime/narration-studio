// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import axe from 'axe-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DAW_SETUPS, type DawSetupId } from '../../fixtures/daw';
import { providedCommands } from '../../input/commandProviders';
import { overlay } from '../../overlay/overlayService';
import { createMockDawClient, type DawClient } from '../../ports/daw';
import type { NarrationApi } from '../../types';
import { clock } from './bar/clock';
import { useSelectionActions } from './bar/selectionActions';
import { drawSections } from './drawer/drawerSections';
import { useFlagActions } from './flags/flagActions';
import { buildWordMenu } from './menu/wordMenuRegistry';
import { EditingPage, type EditingPageProps } from './EditingPage';
import { useTakeControls } from './takes/takeControls';
import { dawFor, EditingHost, FINDING, newJournal, pageApi } from './page/testPage';
import { buildDoc } from './model';

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

  it('no-manuscript-and-no-text-states', async () => {
    mount({ hasManuscript: false });
    expect(screen.getByText(/This project has no manuscript yet/)).toBeTruthy();
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
    });
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
    mount({ onChapter });
    await script();
    fireEvent.mouseDown(word('p1:2'), { button: 0 });
    expect(cursorKey()).toBe('w-p1:2');
    press('ArrowDown', { altKey: true });
    expect(onChapter).toHaveBeenLastCalledWith('c2');
    expect(await screen.findByText('This chapter has no text yet.')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Chapter: Chapter Two/ })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Previous chapter' }));
    await script();
    expect(onChapter).toHaveBeenLastCalledWith('c1');
    expect(cursorKey()).toBeNull();
  });

  it('unmount-stops-everything', async () => {
    const view = mount({ passageId: 'ps-1' });
    await script();
    await waitFor(() => expect(document.querySelectorAll('[data-takes="p1"] [data-take]')).toHaveLength(2));
    fireEvent.mouseDown(word('p1:0'), { button: 0 });
    fireEvent.click(within(screen.getByRole('toolbar', { name: 'Playback and selection' })).getByRole('button', { name: /^Play/ }));
    await waitFor(() => expect(audios.some((a) => a.play.mock.calls.length > 0)).toBe(true));
    const playing = audios.find((a) => a.play.mock.calls.length > 0)!;
    expect(providedCommands().some((c) => c.group === 'Editing')).toBe(true);
    view.unmount();
    expect(playing.pause).toHaveBeenCalled();
    expect(providedCommands().some((c) => c.group === 'Editing')).toBe(false);
    const doc = buildDoc({
      paragraphs: [],
      aligner: { engine: () => ({ id: '', name: '' }), snap: (s) => s, heard: () => null },
      cuts: [],
      effects: [],
      accepted: [],
    });
    for (const tab of ['cleanup', 'effects', 'backups'] as const) expect(drawSections(tab, { doc, chapterId: 'c1' })).toHaveLength(0);
    expect(buildWordMenu({ doc, keys: [], summary: { items: [] } as never, play: () => {}, notify: () => {} }).groups).toHaveLength(0);
    const seen: Record<string, number> = {};
    function Probe() {
      seen.bar = useSelectionActions('bar').length;
      seen.toolbar = useSelectionActions('toolbar').length;
      seen.takes = useTakeControls().length;
      seen.flags = Object.keys(useFlagActions()).length;
      return null;
    }
    render(<Probe />);
    expect(seen).toEqual({ bar: 0, toolbar: 0, takes: 0, flags: 0 });
  });

  describe('whole-page-composes-the-slices', () => {
    it('shows every filled slot exactly once', async () => {
      mount({ passageId: 'ps-1' });
      await script();
      await waitFor(() => expect(document.querySelectorAll('[data-takes="p1"] [data-take]')).toHaveLength(2));
      fireEvent.mouseDown(word('p1:1'), { button: 0, detail: 2 });
      const bar = screen.getByRole('toolbar', { name: 'Playback and selection' });
      for (const name of [/^Delete/, /^Mute/, /^Add FX/]) expect(within(bar).getAllByRole('button', { name })).toHaveLength(1);
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
