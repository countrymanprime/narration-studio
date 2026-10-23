// @vitest-environment jsdom
// The Script page's registrations over the mock host: what the sources answer once the lists load, the provider, the page's keys, and that
// unmounting removes every one of them.
import { act, cleanup, render, renderHook, waitFor } from '@testing-library/react';
import { type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../../../api/ApiContext';
import { createMockApi } from '../../../../api/mockApi';
import { gesture } from '../../../../input/gestures';
import { currentPageContext } from '../../../../input/pageCommands';
import type { GestureEvent, InputSource } from '../../../../input/InputSource';
import { CommandRouter, CommandScope } from '../../../../input/router';
import { useCommand } from '../../../../input/useCommand';
import { contextItemsFor } from '../../../../registries/context';
import { searchAll } from '../../../../registries/search';
import { StudioProvider } from '../../../../studio/StudioProvider';
import { useChapters, useScriptPrep, useScriptView } from '../data/useScriptData';
import { useScriptRegistry, type ScriptRegistryOptions } from './useScriptRegistry';

afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
});

function setup(extra: Partial<ScriptRegistryOptions> = {}) {
  let listener: ((event: GestureEvent) => void) | undefined;
  const source: InputSource = {
    subscribe(onGesture) {
      listener = onGesture;
      return () => void (listener = undefined);
    },
  };
  const press = (code: string, modifiers: Parameters<typeof gesture>[2] = [], target: EventTarget | null = null) =>
    listener?.({ gesture: gesture('keyboard', code, modifiers), target, preventDefault: () => {} });
  const handlers = {
    selectionAt: () => null,
    openFind: vi.fn(),
    showMark: vi.fn(),
    showWord: vi.fn(),
    showEntry: vi.fn(),
    lookUp: vi.fn(),
    copy: vi.fn(),
    goToChapter: vi.fn(),
    composeMark: vi.fn(),
  };
  let current: string | null = null;
  const wrapper = ({ children }: { children: ReactNode }) => (
    <ApiProvider api={createMockApi()}>
      <StudioProvider>
        <CommandRouter source={source}>
          <CommandScope kind="page">{children}</CommandScope>
        </CommandRouter>
      </StudioProvider>
    </ApiProvider>
  );
  const hook = renderHook(
    () => {
      useScriptRegistry({
        ...handlers,
        lines: () => [],
        locationOf: () => '',
        matchCount: () => 0,
        kinds: ['Character'],
        currentChapterId: () => current,
        ...extra,
      });
      const [view, update] = useScriptView((state) => state);
      return { ...useChapters(), view, update, prepOf: useScriptPrep().prepOf };
    },
    { wrapper },
  );
  return { hook, press: (...args: Parameters<typeof press>) => act(() => void press(...args)), handlers, at: (id: string | null) => void (current = id) };
}

/** The reader's scroller as `Reader.tsx` draws it: the focusable region whose child is the `[data-reader]` text. */
function reader(): HTMLElement {
  document.body.innerHTML = '<div id="rd" role="region" tabindex="0"><div data-reader=""><p id="text">Words</p></div></div><input id="f" />';
  return document.getElementById('rd')!;
}

describe('registrations', () => {
  it('search-sources: the manuscript answers under In the script from the lines the page gives; the Story Bible is a page item, not a second hit', async () => {
    const lines = [{ chapterId: 'c1', id: 'p1', index: 0, text: 'The White Rabbit ran' }];
    setup({ lines: () => lines });
    await waitFor(() => expect(currentPageContext()!.items.some((row) => row.group === 'Story Bible' && row.label === 'White Rabbit')).toBe(true));
    const hits = searchAll('rabbit');
    expect(hits.some((hit) => hit.group === 'In the script')).toBe(true);
    expect(hits.some((hit) => hit.group === 'Story Bible')).toBe(false);
  });

  it('page-items: the Script offers its chapters, the Story Bible entries and the mark types, and replaces the global Chapters group', async () => {
    const { hook, handlers } = setup({ kinds: ['Character'] });
    await waitFor(() => expect(hook.result.current.value?.length).toBeGreaterThan(1));
    await waitFor(() => expect(currentPageContext()!.items.some((row) => row.group === 'Story Bible')).toBe(true));
    const context = currentPageContext()!;
    expect(context).toMatchObject({ id: 'script', label: 'Script', supersedes: ['Chapters'] });
    const groups = [...new Set(context.items.map((row) => row.group))];
    expect(groups).toEqual(expect.arrayContaining(['Chapters', 'Story Bible', 'Mark types']));
    const chapter = context.items.find((row) => row.group === 'Chapters')!;
    expect(chapter.icon).toBe('goToChapter');
    chapter.run();
    expect(handlers.goToChapter).toHaveBeenCalledWith(chapter.id.replace('chapter.', ''));
    const entry = context.items.find((row) => row.label === 'White Rabbit')!;
    expect(entry.keywords?.length).toBeGreaterThan(0);
    entry.run();
    expect(handlers.showEntry).toHaveBeenCalledWith(entry.id.replace('entry.', ''));
  });

  it('page-items: a mark type is off with the reason until text is selected, then marks that selection', async () => {
    let picked: { chapterId: string; paragraphId: string; start: number; end: number; quote: string } | null = null;
    const { hook, handlers } = setup({ selectionAt: () => picked as never });
    await waitFor(() => expect(currentPageContext()!.items.some((row) => row.group === 'Mark types')).toBe(true));
    const type = () => currentPageContext()!.items.find((row) => row.group === 'Mark types')!;
    expect(type().label).toMatch(/^Mark the selection as /);
    expect(type().disabledReason).toBe('Select some text in the reader first');
    picked = { chapterId: 'c1', paragraphId: 'p1', start: 0, end: 3, quote: 'The' };
    expect(type().disabledReason).toBeUndefined();
    type().run();
    expect(handlers.composeMark).toHaveBeenCalledWith(expect.any(String), picked);
    hook.unmount();
  });

  it('page-items: while a search is showing the menu offers the next and previous match and clearing it, with the count; none of them otherwise', () => {
    const { hook } = setup({ matchCount: () => 3 });
    const search = () => (currentPageContext()?.items ?? []).filter((row) => row.group === 'Search');
    expect(search()).toEqual([]);
    act(() => hook.result.current.update({ find: { open: true, q: 'rabbit', i: 0 } }));
    expect(search().map((row) => row.label)).toEqual(['Next match', 'Previous match', 'Clear the search']);
    expect(search()[0]!.hint).toBe('1 of 3 for “rabbit”');
    act(() => search()[0]!.run());
    expect(hook.result.current.view.find.i).toBe(1);
    act(() => search()[1]!.run());
    act(() => search()[1]!.run());
    expect(hook.result.current.view.find.i).toBe(2);
    act(() => search()[2]!.run());
    expect(hook.result.current.view.find.open).toBe(false);
  });

  it('keys: F3 and Shift+F3 step the matches, wrapping, and do nothing while no search shows', () => {
    const { hook, press } = setup({ matchCount: () => 3 });
    press('F3');
    expect(hook.result.current.view.find.i).toBe(0);
    act(() => hook.result.current.update({ find: { open: true, q: 'rabbit', i: 0 } }));
    press('F3', ['Shift']);
    expect(hook.result.current.view.find.i).toBe(2);
    press('F3');
    expect(hook.result.current.view.find.i).toBe(0);
  });

  it('the provider answers for the Script’s targets only', async () => {
    const { hook } = setup();
    await waitFor(() => expect(hook.result.current.value?.length).toBeGreaterThan(0));
    const id = hook.result.current.value![0].id;
    document.body.innerHTML = `<div data-jump="${id}"><b id="in">x</b></div><div id="out">y</div>`;
    expect(contextItemsFor(document.getElementById('in')!)?.[0].label).toBe('Go to this chapter');
    expect(contextItemsFor(document.getElementById('out')!)).toBeNull();
  });

  it('keys-follow-the-mock: Alt+Down and Alt+Up go to the chapter after or before the one in view, and stop at the ends', async () => {
    const { hook, press, handlers, at } = setup();
    await waitFor(() => expect(hook.result.current.value?.length).toBeGreaterThan(1));
    const ids = hook.result.current.value!.map((row) => row.id);
    at(ids[0]);
    press('ArrowDown', ['Alt']);
    expect(handlers.goToChapter).toHaveBeenLastCalledWith(ids[1]);
    at(ids[1]);
    press('ArrowUp', ['Alt']);
    expect(handlers.goToChapter).toHaveBeenLastCalledWith(ids[0]);
    at(ids[0]);
    press('ArrowUp', ['Alt']);
    expect(handlers.goToChapter).toHaveBeenLastCalledWith(ids[0]);
  });

  it('none fires while typing in a field', async () => {
    const { hook, press, handlers } = setup();
    await waitFor(() => expect(hook.result.current.value?.length).toBeGreaterThan(1));
    document.body.innerHTML = '<input id="f" />';
    press('ArrowDown', ['Alt'], document.getElementById('f'));
    expect(handlers.goToChapter).not.toHaveBeenCalled();
  });

  it('unregister-on-unmount: sources, provider and keys are gone', async () => {
    const { hook, press, handlers } = setup({ lines: () => [{ chapterId: 'c1', id: 'p1', index: 0, text: 'The White Rabbit ran' }] });
    await waitFor(() => expect(searchAll('rabbit').length).toBeGreaterThan(0));
    document.body.innerHTML = '<div data-jump="c"><b id="in">x</b></div>';
    expect(contextItemsFor(document.getElementById('in')!)).not.toBeNull();
    hook.unmount();
    expect(searchAll('rabbit')).toEqual([]);
    expect(contextItemsFor(document.getElementById('in')!)).toBeNull();
    press('ArrowDown', ['Alt']);
    expect(handlers.goToChapter).not.toHaveBeenCalled();
  });

  it('ctrl-f-is-the-jump-menus: on Script, as on every other page, Ctrl+F reaches jump.page and the page opens no find bar of its own', () => {
    let listener: ((event: GestureEvent) => void) | undefined;
    const source: InputSource = { subscribe: (onGesture) => ((listener = onGesture), () => void (listener = undefined)) };
    const ctrlF = () => act(() => listener?.({ gesture: gesture('keyboard', 'KeyF', ['Ctrl']), target: null, preventDefault: () => {} }));
    const jump = vi.fn();
    function Jump() {
      useCommand('jump.page', jump);
      return null;
    }
    let view: ReturnType<typeof useScriptView<unknown>>[0] | undefined;
    function Script() {
      useScriptRegistry({
        selectionAt: () => null,
        openFind: vi.fn(),
        showMark: vi.fn(),
        showWord: vi.fn(),
        showEntry: vi.fn(),
        lookUp: vi.fn(),
        copy: vi.fn(),
        goToChapter: vi.fn(),
        composeMark: vi.fn(),
        lines: () => [],
        locationOf: () => '',
        matchCount: () => 0,
        kinds: [],
        currentChapterId: () => null,
      });
      [view] = useScriptView((state) => state.find);
      return null;
    }
    render(
      <ApiProvider api={createMockApi()}>
        <StudioProvider>
          <CommandRouter source={source}>
            <Jump />
            <CommandScope kind="page">
              <Script />
            </CommandScope>
          </CommandRouter>
        </StudioProvider>
      </ApiProvider>,
    );
    ctrlF();
    expect(jump).toHaveBeenCalledTimes(1);
    expect(view).toMatchObject({ open: false });
  });

  it('keys-follow-the-mock: Left and Right on the reader step the prep state of the chapter in view', async () => {
    const { hook, press, at } = setup();
    await waitFor(() => expect(hook.result.current.value?.length).toBeGreaterThan(1));
    const id = hook.result.current.value![1].id;
    at(id);
    const scroller = reader();
    const before = hook.result.current.prepOf(id);
    const [key, after] = before === 'prepped' ? ['ArrowLeft', 'progress'] : ['ArrowRight', before === 'none' ? 'progress' : 'prepped'];
    press(key, [], scroller);
    await waitFor(() => expect(hook.result.current.prepOf(id)).toBe(after));
  });

  it('keys-follow-the-mock: Left and Right do nothing unless the reader itself has focus', async () => {
    const { hook, press, at } = setup();
    await waitFor(() => expect(hook.result.current.value?.length).toBeGreaterThan(1));
    const id = hook.result.current.value![1].id;
    at(id);
    reader();
    const before = hook.result.current.prepOf(id);
    press('ArrowRight', [], document.getElementById('text'));
    press('ArrowLeft', [], document.body);
    press('ArrowRight', [], document.getElementById('f'));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(hook.result.current.prepOf(id)).toBe(before);
  });

  it('keys-follow-the-mock: Escape closes Find when no menu is open and no drawer shows', () => {
    const { hook, press } = setup();
    const scroller = reader();
    act(() => hook.result.current.update({ find: { open: true, q: 'x', i: 0 } }));
    press('Escape', [], scroller);
    expect(hook.result.current.view.find.open).toBe(false);
  });

  it('keys-follow-the-mock: Escape closes the drawer and leaves Find open while a drawer shows', () => {
    const { hook, press } = setup();
    const scroller = reader();
    act(() => hook.result.current.update({ find: { open: true, q: 'x', i: 0 }, drawer: 'rail' }));
    press('Escape', [], scroller);
    expect(hook.result.current.view.drawer).toBeNull();
    expect(hook.result.current.view.find.open).toBe(true);
  });

  it('keys-follow-the-mock: Escape leaves Find open while a menu or popover is open (it closes itself), and closes the drawer only once it is gone', () => {
    const { hook, press } = setup();
    act(() => hook.result.current.update({ find: { open: true, q: 'x', i: 0 } }));
    document.body.innerHTML = '<div role="menu"><span id="item">Copy</span></div>';
    press('Escape', [], document.getElementById('item'));
    document.body.innerHTML = '<div id="page"></div><div data-popover-popup=""></div>';
    press('Escape', [], document.getElementById('page'));
    expect(hook.result.current.view.find.open).toBe(true);
    act(() => hook.result.current.update({ drawer: 'ch' }));
    // One layer per Escape: the popover on top owns this one (the router keeps page commands away while a popup shows), the drawer takes the next.
    press('Escape', [], document.getElementById('page'));
    expect(hook.result.current.view.drawer).toBe('ch');
    document.body.innerHTML = '<div id="page"></div>';
    press('Escape', [], document.getElementById('page'));
    expect(hook.result.current.view.drawer).toBeNull();
    expect(hook.result.current.view.find.open).toBe(true);
  });

  it('none fires while typing in a field: Escape', () => {
    const { hook, press } = setup();
    reader();
    act(() => hook.result.current.update({ find: { open: true, q: 'x', i: 0 }, drawer: 'rail' }));
    press('Escape', [], document.getElementById('f'));
    expect(hook.result.current.view.drawer).toBe('rail');
    expect(hook.result.current.view.find.open).toBe(true);
  });

  it('unregister-on-unmount: the Script keys are gone too', () => {
    const { hook, press } = setup();
    const scroller = reader();
    act(() => hook.result.current.update({ find: { open: false, q: '', i: 0 } }));
    const view = hook.result.current.view;
    hook.unmount();
    press('F3');
    press('Escape', [], scroller);
    expect(view.find.open).toBe(false);
  });
});
