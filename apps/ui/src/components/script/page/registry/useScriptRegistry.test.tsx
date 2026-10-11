// @vitest-environment jsdom
// The Script page's registrations over the mock host: what the sources answer once the lists load, the provider, the chapter keys, and that
// unmounting removes every one of them.
import { cleanup, renderHook, waitFor } from '@testing-library/react';
import { type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../../../api/ApiContext';
import { createMockApi } from '../../../../api/mockApi';
import { gesture } from '../../../../input/gestures';
import type { GestureEvent, InputSource } from '../../../../input/InputSource';
import { CommandRouter, CommandScope } from '../../../../input/router';
import { contextItemsFor } from '../../../../registries/context';
import { searchAll } from '../../../../registries/search';
import { StudioProvider } from '../../../../studio/StudioProvider';
import { useChapters } from '../data/useScriptData';
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
      return useChapters();
    },
    { wrapper },
  );
  return { hook, press, handlers, at: (id: string | null) => void (current = id) };
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
});
