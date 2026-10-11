// @vitest-environment jsdom
import { cleanup, render, renderHook, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { act } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../api/ApiContext';
import { createMockApi } from '../api/mockApi';
import type { ManuscriptChapter } from '../api/contracts/manuscript';
import type { ProjectAttachState } from '../api/contracts/system';
import { dawShortName, StudioProvider, useJournal, useStoreHandle, useStudio } from './StudioProvider';
import { createHostEvents, createSlots } from './slots';
import { createStudioStore } from './store/createStudioStore';

afterEach(cleanup);

const wrapper = (daw: 'REAPER' | 'Audacity' | 'none') =>
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <ApiProvider api={createMockApi({}, { daw: { daw } })}>
        <StudioProvider>{children}</StudioProvider>
      </ApiProvider>
    );
  };

describe('dawShortName', () => {
  it('names the DAW the way the header chip does', () => {
    expect(dawShortName('REAPER')).toBe('REAPER');
    expect(dawShortName('Audacity')).toBe('Audacity');
    expect(dawShortName('none')).toBe('Built-in');
  });
});

describe('StudioProvider', () => {
  it('gives every consumer the same journal', () => {
    const { result } = renderHook(() => [useJournal(), useJournal()], { wrapper: wrapper('REAPER') });
    expect(result.current[0]).toBe(result.current[1]);
  });

  it('starts empty and keeps what a page records', async () => {
    const { result } = renderHook(() => useJournal(), { wrapper: wrapper('REAPER') });
    expect(await result.current.entries()).toEqual([]);
    await result.current.act({
      label: 'Added a bookmark',
      touches: ['bookmarks'],
      run: async () => ({ ok: true, value: 1 }),
      undo: async () => ({ ok: true, value: 1 }),
    });
    expect((await result.current.entries()).map((row) => row.label)).toEqual(['Added a bookmark']);
  });

  it("words a DAW refusal with the DAW's name from the capabilities", async () => {
    const { result } = renderHook(() => useJournal(), { wrapper: wrapper('Audacity') });
    // The name arrives with the first capabilities answer.
    await waitFor(async () => {
      await result.current.act({
        label: 'Moved a marker',
        touches: ['markers'],
        daw: true,
        run: async () => ({ ok: true, value: 1 }),
        undo: async () => ({ ok: true, value: 1 }),
      });
      const [row] = await result.current.entries();
      expect(row?.refusal).toContain('Audacity');
    });
  });

  it('throws outside a provider, so a missing mount is found at once', () => {
    expect(() => renderHook(() => useJournal())).toThrow(/StudioProvider/);
  });

  it('renders its children', () => {
    render(
      <ApiProvider api={createMockApi({}, {})}>
        <StudioProvider>
          <p>inside</p>
        </StudioProvider>
      </ApiProvider>,
    );
    expect(screen.getByText('inside')).toBeTruthy();
  });
});

const chapter = (id: string) => ({ id, title: id, number: 1, index: 1, wordCount: 10, status: 'not_started' }) as unknown as ManuscriptChapter;

function projectRig(lists: Record<string, ManuscriptChapter[]>) {
  let folder = 'A';
  let attach: (state: ProjectAttachState) => void = () => undefined;
  const api = createMockApi({
    manuscriptChapters: async () => lists[folder] ?? [],
    subscribeProjectAttach: (cb) => {
      attach = cb;
      return () => undefined;
    },
  });
  return {
    api,
    switchTo: (next: string) => {
      folder = next;
      attach({ attached: true });
    },
  };
}

describe('provider-creates-and-starts-the-store', () => {
  it('starts the store on mount and stops it on unmount, using a store a test passes', () => {
    const stop = vi.fn();
    const store = createStudioStore({ registry: createSlots({ manuscriptChapters: async () => [] }), subscribe: () => () => undefined });
    const start = vi.spyOn(store, 'start').mockReturnValue(stop);
    const view = render(
      <ApiProvider api={createMockApi({}, {})}>
        <StudioProvider store={store}>
          <p>x</p>
        </StudioProvider>
      </ApiProvider>,
    );
    expect(start).toHaveBeenCalledOnce();
    view.unmount();
    expect(stop).toHaveBeenCalledOnce();
  });

  it('exposes one store to every consumer and useStudio reads its slots', async () => {
    const { api } = projectRig({ A: [chapter('c1')] });
    const { result } = renderHook(() => ({ store: useStoreHandle(), again: useStoreHandle(), chapters: useStudio((s) => s.slots.chapters) }), {
      wrapper: ({ children }) => (
        <ApiProvider api={api}>
          <StudioProvider>{children}</StudioProvider>
        </ApiProvider>
      ),
    });
    expect(result.current.store).toBe(result.current.again);
    expect(result.current.chapters).toBeUndefined();
    await act(() => result.current.store.load('chapters'));
    expect(result.current.chapters).toHaveLength(1);
  });
});

describe('project-switch-clears-both', () => {
  it('empties the slots and the journal, loads again for B, and drops an A load that lands late', async () => {
    const rig = projectRig({ A: [chapter('a1')], B: [chapter('b1'), chapter('b2')] });
    let release: (list: ManuscriptChapter[]) => void = () => undefined;
    const slow = new Promise<ManuscriptChapter[]>((resolve) => (release = resolve));
    const api = { ...rig.api, manuscriptChapters: vi.fn().mockReturnValueOnce(slow).mockImplementation(rig.api.manuscriptChapters) };
    const { result } = renderHook(() => ({ store: useStoreHandle(), journal: useJournal(), chapters: useStudio((s) => s.slots.chapters) }), {
      wrapper: ({ children }) => (
        <ApiProvider api={api}>
          <StudioProvider>{children}</StudioProvider>
        </ApiProvider>
      ),
    });
    // A's load is still in flight when the project switches.
    const inFlight = result.current.store.load('chapters');
    await result.current.journal.act({ label: 'Edit', touches: ['x'], run: async () => ({ ok: true, value: 1 }), undo: async () => ({ ok: true, value: 1 }) });
    act(() => rig.switchTo('B'));
    expect(await result.current.journal.entries()).toEqual([]);
    release([chapter('a1')]);
    await act(() => inFlight);
    expect(result.current.chapters).toBeUndefined();
    await act(() => result.current.store.load('chapters'));
    expect(result.current.chapters?.map((c) => c.id)).toEqual(['b1', 'b2']);
  });
});

describe('createHostEvents wired by the provider', () => {
  it('reloads the chapters slot when a job ends', async () => {
    let ended: () => void = () => undefined;
    const load = vi.fn().mockResolvedValue([]);
    const subscribe = createHostEvents({ subscribeJobEnded: (cb: () => void) => ((ended = cb), () => undefined) } as never);
    const store = createStudioStore({ registry: createSlots({ manuscriptChapters: load }), subscribe, subscribeFocus: () => () => undefined });
    store.start();
    ended();
    await Promise.resolve();
    expect(load).toHaveBeenCalledOnce();
  });
});
