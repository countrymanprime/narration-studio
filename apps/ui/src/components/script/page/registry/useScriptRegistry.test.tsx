// @vitest-environment jsdom
// The Script page's registrations over the mock host: what the sources answer once the lists load, the provider, the page's keys, and that
// unmounting removes every one of them.
import { act, cleanup, render, renderHook, waitFor } from '@testing-library/react';
import { type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../../../api/ApiContext';
import { createMockApi } from '../../../../api/mockApi';
import { gesture } from '../../../../input/gestures';
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
      useScriptRegistry({ ...handlers, lines: () => [], kinds: ['Character'], currentChapterId: () => current, ...extra });
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
  it('search-sources: the entries answer once the Story Bible has loaded, and the manuscript from the lines the page gives', async () => {
    const lines = [{ chapterId: 'c1', id: 'p1', index: 0, text: 'The White Rabbit ran' }];
    setup({ lines: () => lines });
    await waitFor(() => expect(searchAll('rabbit').some((hit) => hit.group === 'Story Bible' && hit.title === 'White Rabbit')).toBe(true));
    expect(searchAll('rabbit').some((hit) => hit.group === 'In the manuscript')).toBe(true);
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

  it('script-find-is-a-catalogue-row: Ctrl+F opens the Script’s Find and keeps the query, through the handler the page registers', async () => {
    const { hook, press } = setup();
    act(() => hook.result.current.update({ find: { open: false, q: 'rabbit', i: 2, list: false } }));
    const nonce = hook.result.current.view.findNonce;
    press('KeyF', ['Ctrl']);
    expect(hook.result.current.view.find).toEqual({ open: true, q: 'rabbit', i: 2, list: true });
    expect(hook.result.current.view.findNonce).toBe(nonce + 1);
  });

  it('script-find-is-a-catalogue-row: on every other page Ctrl+F still opens the jump menu, and on Script it does not', () => {
    let listener: ((event: GestureEvent) => void) | undefined;
    const source: InputSource = { subscribe: (onGesture) => ((listener = onGesture), () => void (listener = undefined)) };
    const ctrlF = () => act(() => listener?.({ gesture: gesture('keyboard', 'KeyF', ['Ctrl']), target: null, preventDefault: () => {} }));
    const jump = vi.fn();
    function Jump() {
      useCommand('jump.open', jump);
      return null;
    }
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
        kinds: [],
        currentChapterId: () => null,
      });
      return null;
    }
    const tree = (onScript: boolean) => (
      <ApiProvider api={createMockApi()}>
        <StudioProvider>
          <CommandRouter source={source}>
            <Jump />
            <CommandScope kind="page">{onScript ? <Script /> : null}</CommandScope>
          </CommandRouter>
        </StudioProvider>
      </ApiProvider>
    );
    const view = render(tree(false));
    ctrlF();
    expect(jump).toHaveBeenCalledTimes(1);
    view.rerender(tree(true));
    ctrlF();
    expect(jump).toHaveBeenCalledTimes(1);
    view.rerender(tree(false));
    ctrlF();
    expect(jump).toHaveBeenCalledTimes(2);
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
    act(() => hook.result.current.update({ find: { open: true, q: 'x', i: 0, list: true } }));
    press('Escape', [], scroller);
    expect(hook.result.current.view.find.open).toBe(false);
  });

  it('keys-follow-the-mock: Escape closes the drawer and leaves Find open while a drawer shows', () => {
    const { hook, press } = setup();
    const scroller = reader();
    act(() => hook.result.current.update({ find: { open: true, q: 'x', i: 0, list: true }, drawer: 'rail' }));
    press('Escape', [], scroller);
    expect(hook.result.current.view.drawer).toBeNull();
    expect(hook.result.current.view.find.open).toBe(true);
  });

  it('keys-follow-the-mock: Escape leaves Find open while a menu or popover is open (it closes itself), and closes the drawer only once it is gone', () => {
    const { hook, press } = setup();
    act(() => hook.result.current.update({ find: { open: true, q: 'x', i: 0, list: true } }));
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

  it('none fires while typing in a field: Escape and Ctrl+F', () => {
    const { hook, press } = setup();
    reader();
    act(() => hook.result.current.update({ find: { open: true, q: 'x', i: 0, list: true }, drawer: 'rail' }));
    press('Escape', [], document.getElementById('f'));
    expect(hook.result.current.view.drawer).toBe('rail');
    expect(hook.result.current.view.find.open).toBe(true);
    const nonce = hook.result.current.view.findNonce;
    press('KeyF', ['Ctrl'], document.getElementById('f'));
    expect(hook.result.current.view.findNonce).toBe(nonce);
  });

  it('unregister-on-unmount: the Script keys are gone too', () => {
    const { hook, press } = setup();
    const scroller = reader();
    act(() => hook.result.current.update({ find: { open: false, q: '', i: 0, list: true } }));
    const view = hook.result.current.view;
    hook.unmount();
    press('KeyF', ['Ctrl']);
    press('Escape', [], scroller);
    expect(view.find.open).toBe(false);
  });
});
