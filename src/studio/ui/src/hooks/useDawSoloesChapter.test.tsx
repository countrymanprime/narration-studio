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

  it('moves the solo to the next chapter without putting anything back', async () => {
    const { dawSoloChapter, dawSoloRestore, rerender } = await render({});
    await waitFor(() => expect(dawSoloChapter).toHaveBeenCalledTimes(1));
    rerender({ id: 'c-2' });
    await waitFor(() => expect(dawSoloChapter).toHaveBeenLastCalledWith('c-2'));
    expect(dawSoloRestore).not.toHaveBeenCalled();
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
