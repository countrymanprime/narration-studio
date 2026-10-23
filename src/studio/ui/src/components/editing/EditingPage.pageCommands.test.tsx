// @vitest-environment jsdom
// What the Editing page offers the jump menu under "On this page": its chapters, the actions for the selection, and the drawer's tabs.
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DAW_SETUPS, type DawSetupId } from '../../fixtures/daw';
import { currentPageContext, type PageItem } from '../../input/pageCommands';
import { OverlayHost } from '../../overlay/OverlayHost';
import { createOverlayService, overlay } from '../../overlay/overlayService';
import { createMockDawClient, type DawClient } from '../../ports/daw';
import type { NarrationApi } from '../../types';
import { defaultKeymap } from '../../input/keymap';
import { COMMAND_CATALOG } from '../../input/commands.catalog';
import { openJumpMenu } from '../layout/JumpMenu';
import { EditingPage, type EditingPageProps } from './EditingPage';
import { dawFor, EditingHost, newJournal, pageApi } from './page/testPage';

beforeEach(() => {
  vi.stubGlobal(
    'Audio',
    class extends EventTarget {
      src = '';
      currentTime = 0;
      play = vi.fn().mockResolvedValue(undefined);
      pause = vi.fn();
    },
  );
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
    () => ({ width: 1440, height: 800, top: 0, left: 0, right: 1440, bottom: 800, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect,
  );
  Element.prototype.scrollIntoView = () => {};
});
afterEach(() => {
  cleanup();
  act(() => overlay.getSnapshot().dialogs.forEach((d) => (d.kind === 'confirm' ? d.answer(false) : d.close())));
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

type Options = Partial<EditingPageProps> & { setup?: DawSetupId; daw?: DawClient; api?: Partial<NarrationApi> & { heard?: boolean } };
function mount({ setup = 'reaper', daw, api = {}, ...props }: Options = {}) {
  return render(
    <EditingHost api={pageApi(api)} daw={daw ?? dawFor(setup)} journal={newJournal()}>
      <EditingPage hasManuscript {...props} />
    </EditingHost>,
  );
}
const script = () => screen.findByRole('textbox', { name: 'Script with what was heard' });
const word = (key: string) => document.querySelector<HTMLElement>(`[data-k="${key}"]`)!;
const items = (group?: string): readonly PageItem[] => (currentPageContext()?.items ?? []).filter((i) => group === undefined || i.group === group);
const item = (id: string): PageItem => {
  const found = items().find((i) => i.id === id);
  if (!found) throw new Error(`no page item ${id}; have ${items().map((i) => i.id)}`);
  return found;
};
const SELECT_FIRST = /Select some words/;

describe('Editing page commands', () => {
  it('registers-as-Editing-and-replaces-the-global-chapter-rows', async () => {
    mount();
    await script();
    expect(currentPageContext()).toMatchObject({ id: 'editing', label: 'Editing', supersedes: ['Chapters'] });
  });

  it('lists-the-chapters-the-page-read-and-choosing-one-stays-on-Editing', async () => {
    const onChapter = vi.fn();
    mount({ onChapter });
    await script();
    await waitFor(() => expect(items('Chapters').map((i) => i.id)).toEqual(['chapter.c1', 'chapter.c2']));
    expect(items('Chapters').map((i) => i.label)).toEqual([expect.stringContaining('Chapter One'), expect.stringContaining('Chapter Two')]);
    act(() => item('chapter.c2').run());
    expect(onChapter).toHaveBeenCalledWith('c2');
    expect(await screen.findByText('This chapter has no text yet.')).toBeTruthy();
    // The chapter in view shows it after the step.
    expect(items('Chapters').find((i) => i.id === 'chapter.c2')?.hint).toBe('Open now');
  });

  it('lists-the-chapters-while-the-first-chapter-is-still-loading', async () => {
    mount({ api: { workspaceAlignment: () => new Promise<never>(() => {}) } });
    await waitFor(() => expect(items('Chapters')).toHaveLength(2));
  });

  it('with-nothing-selected-the-selection-actions-are-listed-off-with-a-reason', async () => {
    mount();
    await script();
    for (const id of ['selection.delete', 'selection.mute', 'selection.fx']) {
      expect(item(id).disabledReason, id).toMatch(SELECT_FIRST);
      expect(item(id).group).toBe('Selection');
    }
  });

  it('a-selection-turns-the-actions-on-and-each-opens-its-question', async () => {
    mount();
    await script();
    fireEvent.mouseDown(word('p1:1'), { button: 0, detail: 2 });
    await waitFor(() => expect(item('selection.delete').disabledReason).toBeUndefined());
    expect(item('selection.mute').disabledReason).toBeUndefined();
    expect(item('selection.fx').disabledReason).toBeUndefined();
    act(() => item('selection.delete').run());
    expect(overlay.getSnapshot().dialogs).toHaveLength(1);
  });

  it('a-DAW-that-is-not-answering-turns-the-cut-and-FX-off-with-the-DAWs-own-reason', async () => {
    mount({ setup: 'reaper-off' });
    await script();
    fireEvent.mouseDown(word('p1:1'), { button: 0, detail: 2 });
    await waitFor(() => expect(item('selection.delete').disabledReason).toBeTruthy());
    expect(item('selection.delete').disabledReason).not.toMatch(SELECT_FIRST);
    expect(item('selection.mute').disabledReason).toBeTruthy();
    expect(item('selection.fx').disabledReason).toBeTruthy();
  });

  it('while-the-DAW-has-not-answered-the-actions-wait-with-a-reason', async () => {
    const silent = { ...createMockDawClient(DAW_SETUPS.reaper), capabilities: () => new Promise<never>(() => {}) } as DawClient;
    mount({ daw: silent });
    await script();
    fireEvent.mouseDown(word('p1:1'), { button: 0, detail: 2 });
    await waitFor(() => expect(item('selection.delete').disabledReason).toMatch(/Checking/));
  });

  it('Check-recording-is-offered-and-opens-the-check', async () => {
    mount();
    await script();
    await waitFor(() => expect(item('check.recording').disabledReason).toBeUndefined());
    expect(item('check.recording').icon).toBe('checkRecordings');
    act(() => item('check.recording').run());
    expect(await screen.findByRole('dialog')).toBeTruthy();
  });

  it('the-drawer-tabs-follow-what-the-DAW-offers-and-each-opens-the-drawer-on-its-tab', async () => {
    mount();
    await script();
    const tabs = () => items('Drawer').map((i) => i.id);
    await waitFor(() => expect(tabs()).toEqual(['drawer.cleanup', 'drawer.effects']));
    act(() => item('drawer.effects').run());
    expect(screen.getByRole('tab', { name: /Effects/ }).getAttribute('aria-selected')).toBe('true');
    cleanup();
    const withBackups = createMockDawClient({
      ...DAW_SETUPS.reaper,
      capabilities: { ...DAW_SETUPS.reaper.capabilities, backups: { level: 'supported', available: true } },
    });
    mount({ daw: withBackups });
    await script();
    await waitFor(() => expect(tabs()).toEqual(['drawer.cleanup', 'drawer.effects', 'drawer.backups']));
  });

  it('lists-nothing-twice-the-old-provider-rows-for-delete-FX-and-the-drawer-are-gone', async () => {
    const { providedCommands } = await import('../../input/commandProviders');
    mount();
    await script();
    const labels = providedCommands().map((c) => c.label);
    expect(labels).not.toContain('Delete the selected words and audio');
    expect(labels).not.toContain('Add FX to the selected words');
    expect(labels.filter((l) => l.startsWith('Editing: '))).toEqual([]);
    const ids = items().map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('the-menu-draws-them-under-On-this-page', async () => {
    mount();
    await script();
    const service = createOverlayService();
    render(<OverlayHost service={service} />);
    act(() => void openJumpMenu({ service, keymap: defaultKeymap(COMMAND_CATALOG, false), runCommand: () => {} }));
    const heads = Array.from(document.querySelectorAll('[role="listbox"] [role="presentation"]')).map((n) => n.textContent);
    expect(heads[0]).toBe('On this page');
    const rows = screen.getAllByRole('option').map((o) => o.textContent ?? '');
    expect(rows.slice(0, 4).join('|')).toMatch(/Chapters.*Selection/);
  });

  it('has-no-host-load-so-opening-the-menu-waits-on-nothing', async () => {
    mount();
    await script();
    expect(currentPageContext()?.load).toBeUndefined();
  });

  it('unmounting-the-page-takes-its-items-away', async () => {
    const view = mount();
    await script();
    expect(currentPageContext()).not.toBeNull();
    view.unmount();
    expect(currentPageContext()).toBeNull();
  });

  it('a-manuscript-less-project-offers-nothing', () => {
    mount({ hasManuscript: false });
    expect(currentPageContext()).toBeNull();
  });
});
