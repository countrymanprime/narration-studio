// @vitest-environment jsdom
import { cleanup, renderHook, waitFor, act } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../api/ApiContext';
import type { DawCapabilities } from '../api/contracts/daw';
import type { ScopedSettingField } from '../api/contracts/system';
import { createMockApi } from '../api/mockApi';
import type { NarrationApi } from '../types';
import { useDawSoloesChapter } from './useDawSoloesChapter';

afterEach(cleanup);

const done = { ok: true, changed: true, message: '', undoSteps: 0 };

async function capsWith(followAvailable: boolean): Promise<DawCapabilities> {
  const caps = await createMockApi().dawCapabilities();
  const entry = caps.capabilities.follow_position;
  return { ...caps, capabilities: { ...caps.capabilities, follow_position: { ...entry, available: followAvailable } } };
}

const setting = (value: string): Record<string, ScopedSettingField[]> => ({
  Booth: [{ key: 'follow_chapter_in_daw', label: 'x', kind: 'bool', choices: [], value, isSet: true, effectiveValue: value, effectiveSource: 'repo default' }],
});

async function render(options: { available?: boolean; setting?: string; chapterId?: string; log?: string[]; solo?: NarrationApi['dawSoloChapter'] }) {
  const log = options.log ?? [];
  const dawSoloChapter = vi.fn(options.solo ?? (async (id: string) => (log.push(`solo ${id}`), done)));
  const dawSoloRestore = vi.fn(async () => (log.push('restore'), done));
  const caps = await capsWith(options.available ?? true);
  const api = createMockApi({
    dawSoloChapter,
    dawSoloRestore,
    settingsForScope: async () => setting(options.setting ?? 'true'),
    dawCapabilities: async () => caps,
    subscribeDawCapabilities: () => () => undefined,
  });
  const hook = renderHook(({ id }: { id: string | undefined }) => useDawSoloesChapter(id), {
    initialProps: { id: options.chapterId ?? 'c-1' },
    wrapper: ({ children }: { children: ReactNode }) => <ApiProvider api={api}>{children}</ApiProvider>,
  });
  return { dawSoloChapter, dawSoloRestore, log, ...hook };
}

describe('useDawSoloesChapter', () => {
  it('soloes the chapter once the setting and the DAW say so, and puts it back when the page is left', async () => {
    const { dawSoloChapter, dawSoloRestore, unmount } = await render({});
    await waitFor(() => expect(dawSoloChapter).toHaveBeenCalledExactlyOnceWith('c-1'));
    expect(dawSoloRestore).not.toHaveBeenCalled();
    unmount();
    await waitFor(() => expect(dawSoloRestore).toHaveBeenCalledTimes(1));
  });

  it('asks for the next chapter when the same page is given another one (the Booth remounts, so this is the hook only)', async () => {
    const { dawSoloChapter, dawSoloRestore, rerender } = await render({});
    await waitFor(() => expect(dawSoloChapter).toHaveBeenCalledTimes(1));
    rerender({ id: 'c-2' });
    await waitFor(() => expect(dawSoloChapter).toHaveBeenLastCalledWith('c-2'));
    expect(dawSoloRestore).not.toHaveBeenCalled();
  });

  it('puts the chapter back when the page stays open but has no chapter in view any more', async () => {
    const { dawSoloChapter, dawSoloRestore, rerender } = await render({});
    await waitFor(() => expect(dawSoloChapter).toHaveBeenCalledTimes(1));
    rerender({ id: '' });
    await waitFor(() => expect(dawSoloRestore).toHaveBeenCalledTimes(1));
    rerender({ id: 'c-2' });
    await waitFor(() => expect(dawSoloChapter).toHaveBeenLastCalledWith('c-2'));
  });

  it('keeps the calls in the order the page made them, so a chapter entered just after one was left stays soloed', async () => {
    const log: string[] = [];
    let release: () => void = () => undefined;
    const first = new Promise<void>((resolve) => (release = resolve));
    const { unmount, dawSoloChapter } = await render({
      log,
      solo: async (id: string) => {
        log.push(`solo ${id}`);
        if (log.length === 1) await first;
        return done;
      },
    });
    await waitFor(() => expect(dawSoloChapter).toHaveBeenCalledTimes(1));
    unmount();
    const second = await render({ log, chapterId: 'c-2' });
    await act(async () => {});
    expect(log).toEqual(['solo c-1']);
    release();
    await waitFor(() => expect(second.dawSoloChapter).toHaveBeenCalledTimes(1));
    expect(log).toEqual(['solo c-1', 'restore', 'solo c-2']);
  });

  it('puts it back when the switch turns off or the DAW cannot follow any more', async () => {
    const real = await capsWith(true);
    const off = await capsWith(false);
    let push: (caps: DawCapabilities) => void = () => undefined;
    const dawSoloChapter = vi.fn(async () => done);
    const dawSoloRestore = vi.fn(async () => done);
    const api = createMockApi({
      dawSoloChapter,
      dawSoloRestore,
      settingsForScope: async () => setting('true'),
      dawCapabilities: async () => real,
      subscribeDawCapabilities: (onUpdate: (caps: DawCapabilities) => void) => {
        push = onUpdate;
        return () => undefined;
      },
    });
    renderHook(() => useDawSoloesChapter('c-1'), { wrapper: ({ children }: { children: ReactNode }) => <ApiProvider api={api}>{children}</ApiProvider> });
    await waitFor(() => expect(dawSoloChapter).toHaveBeenCalledTimes(1));
    act(() => push(off));
    await waitFor(() => expect(dawSoloRestore).toHaveBeenCalledTimes(1));
  });

  it.each([
    ['the setting is off', { setting: 'false' }],
    ['the DAW cannot follow', { available: false }],
    ['no chapter is in view', { chapterId: '' }],
  ])('solos nothing and restores nothing when %s', async (_name, options) => {
    const { dawSoloChapter, dawSoloRestore, unmount } = await render(options);
    await act(async () => {});
    await act(async () => {});
    unmount();
    await act(async () => {});
    expect(dawSoloChapter).not.toHaveBeenCalled();
    expect(dawSoloRestore).not.toHaveBeenCalled();
  });

  it('says nothing when the DAW refuses or a call fails, and still puts it back', async () => {
    const log: string[] = [];
    const { result, unmount, dawSoloRestore } = await render({
      log,
      solo: async () => {
        throw new Error('bridge down');
      },
    });
    await waitFor(() => expect(dawSoloRestore).not.toHaveBeenCalled());
    expect(result.current).toBeUndefined();
    unmount();
    await waitFor(() => expect(dawSoloRestore).toHaveBeenCalledTimes(1));
  });
});

describe('a restore that did not reach the DAW', () => {
  const failed = {
    ok: false,
    changed: false,
    message: 'x',
    undoSteps: 0,
    refused:
      "The DAW could not put the chapter's track back after you left the Booth, so the other chapters may stay silent. Unsolo the chapter's track in the DAW.",
  };

  it('retries the restore when the DAW reports it can follow again, or says the chapter is still soloed', async () => {
    const real = await capsWith(true);
    const off = await capsWith(false);
    let push: (caps: DawCapabilities) => void = () => undefined;
    const answers = [failed, done];
    const dawSoloRestore = vi.fn(async () => answers.shift() ?? done);
    const api = createMockApi({
      dawSoloChapter: vi.fn(async () => done),
      dawSoloRestore,
      settingsForScope: async () => setting('true'),
      dawCapabilities: async () => real,
      subscribeDawCapabilities: (onUpdate: (caps: DawCapabilities) => void) => {
        push = onUpdate;
        return () => undefined;
      },
    });
    const wrapper = ({ children }: { children: ReactNode }) => <ApiProvider api={api}>{children}</ApiProvider>;
    const first = renderHook(() => useDawSoloesChapter('c-1'), { wrapper });
    await waitFor(() => expect(api.dawSoloChapter).toHaveBeenCalledTimes(1));
    first.unmount();
    await waitFor(() => expect(dawSoloRestore).toHaveBeenCalledTimes(1));
    // The DAW cannot be followed for a while and then can again: the owed restore is sent once more.
    renderHook(() => useDawSoloesChapter(''), { wrapper });
    act(() => push(off));
    act(() => push(real));
    await waitFor(() => expect(dawSoloRestore).toHaveBeenCalledTimes(2));
    await act(async () => {});
    expect(dawSoloRestore).toHaveBeenCalledTimes(2);
  });

  it('tells the narrator once, in a sentence that says what may be left soloed and what to do', async () => {
    const told: string[] = [];
    const { overlay } = await import('../overlay/overlayService');
    const toast = vi.spyOn(overlay, 'toast').mockImplementation((text: string) => void told.push(text));
    const { unmount, dawSoloRestore } = await render({});
    dawSoloRestore.mockImplementation(async () => failed);
    await waitFor(() => expect(dawSoloRestore).not.toHaveBeenCalled());
    await act(async () => {});
    unmount();
    await waitFor(() => expect(dawSoloRestore).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(told).toHaveLength(1));
    expect(told[0]).toContain('may stay silent');
    expect(told[0]).toContain('Unsolo');
    toast.mockRestore();
  });
});
