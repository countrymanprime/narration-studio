// @vitest-environment jsdom
import { cleanup, renderHook, waitFor, act } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../api/ApiContext';
import type { DawCapabilities } from '../api/contracts/daw';
import type { ScopedSettingField } from '../api/contracts/system';
import { createMockApi } from '../api/mockApi';
import type { NarrationApi } from '../types';
import { useDawGoesToChapter } from './useDawGoesToChapter';

afterEach(cleanup);

const moved = { ok: true, changed: true, message: '', undoSteps: 0 };

async function capsWith(followAvailable: boolean): Promise<DawCapabilities> {
  const caps = await createMockApi().dawCapabilities();
  const entry = caps.capabilities.follow_position;
  return { ...caps, capabilities: { ...caps.capabilities, follow_position: { ...entry, available: followAvailable } } };
}

const setting = (value: string): Record<string, ScopedSettingField[]> => ({
  Booth: [{ key: 'follow_chapter_in_daw', label: 'x', kind: 'bool', choices: [], value, isSet: true, effectiveValue: value, effectiveSource: 'repo default' }],
});

function wrapperFor(overrides: Partial<NarrationApi>) {
  const api = createMockApi(overrides);
  return ({ children }: { children: ReactNode }) => <ApiProvider api={api}>{children}</ApiProvider>;
}

async function renderFollow(options: { available?: boolean; setting?: string; chapterId?: string }) {
  const dawGoToChapter = vi.fn(async () => moved);
  const caps = await capsWith(options.available ?? true);
  const hook = renderHook(({ id }: { id: string | undefined }) => useDawGoesToChapter(id), {
    initialProps: { id: options.chapterId ?? 'c-1' },
    wrapper: wrapperFor({
      dawGoToChapter,
      settingsForScope: async () => setting(options.setting ?? 'true'),
      dawCapabilities: async () => caps,
      subscribeDawCapabilities: () => () => undefined,
    }),
  });
  return { dawGoToChapter, ...hook };
}

describe('useDawGoesToChapter', () => {
  it('sends the chapter once, to where its audio starts', async () => {
    const { dawGoToChapter, rerender } = await renderFollow({});
    await waitFor(() => expect(dawGoToChapter).toHaveBeenCalledExactlyOnceWith('c-1', 'start', 0));
    rerender({ id: 'c-1' });
    await act(async () => {});
    expect(dawGoToChapter).toHaveBeenCalledTimes(1);
  });

  it('moves on with the newest chapter', async () => {
    const { dawGoToChapter, rerender } = await renderFollow({});
    await waitFor(() => expect(dawGoToChapter).toHaveBeenCalledTimes(1));
    rerender({ id: 'c-2' });
    await waitFor(() => expect(dawGoToChapter).toHaveBeenLastCalledWith('c-2', 'start', 0));
  });

  it('does not move the DAW again for the same chapter when it reconnects', async () => {
    const dawGoToChapter = vi.fn(async () => moved);
    const real = await capsWith(true);
    const off = await capsWith(false);
    let push: (caps: DawCapabilities) => void = () => undefined;
    renderHook(() => useDawGoesToChapter('c-1'), {
      wrapper: wrapperFor({
        dawGoToChapter,
        settingsForScope: async () => setting('true'),
        dawCapabilities: async () => real,
        subscribeDawCapabilities: (onUpdate: (caps: DawCapabilities) => void) => {
          push = onUpdate;
          return () => undefined;
        },
      }),
    });
    await waitFor(() => expect(dawGoToChapter).toHaveBeenCalledTimes(1));
    act(() => push(off));
    act(() => push(real));
    await act(async () => {});
    expect(dawGoToChapter).toHaveBeenCalledTimes(1);
  });

  it('moves again when the chapter is chosen again after a page with no chapter', async () => {
    const { dawGoToChapter, rerender } = await renderFollow({});
    await waitFor(() => expect(dawGoToChapter).toHaveBeenCalledTimes(1));
    rerender({ id: '' });
    await act(async () => {});
    rerender({ id: 'c-1' });
    await waitFor(() => expect(dawGoToChapter).toHaveBeenCalledTimes(2));
  });

  it('follows a DAW that connects after the page opened, once', async () => {
    const dawGoToChapter = vi.fn(async () => moved);
    const real = await capsWith(true);
    const off = await capsWith(false);
    let push: (caps: DawCapabilities) => void = () => undefined;
    renderHook(() => useDawGoesToChapter('c-1'), {
      wrapper: wrapperFor({
        dawGoToChapter,
        settingsForScope: async () => setting('true'),
        dawCapabilities: async () => off,
        subscribeDawCapabilities: (onUpdate: (caps: DawCapabilities) => void) => {
          push = onUpdate;
          return () => undefined;
        },
      }),
    });
    await act(async () => {});
    expect(dawGoToChapter).not.toHaveBeenCalled();
    act(() => push(real));
    await waitFor(() => expect(dawGoToChapter).toHaveBeenCalledExactlyOnceWith('c-1', 'start', 0));
  });

  it.each([
    ['the setting is off', { setting: 'false' }],
    ['the DAW cannot follow', { available: false }],
    ['no chapter is in view', { chapterId: '' }],
  ])('moves nothing when %s', async (_name, options) => {
    const { dawGoToChapter } = await renderFollow(options);
    await act(async () => {});
    await act(async () => {});
    expect(dawGoToChapter).not.toHaveBeenCalled();
  });

  it('says nothing when the DAW refuses or the call fails', async () => {
    const failing = vi.fn(async () => {
      throw new Error('bridge down');
    });
    const caps = await capsWith(true);
    const { result } = renderHook(() => useDawGoesToChapter('c-1'), {
      wrapper: wrapperFor({
        dawGoToChapter: failing,
        settingsForScope: async () => setting('true'),
        dawCapabilities: async () => caps,
        subscribeDawCapabilities: () => () => undefined,
      }),
    });
    await waitFor(() => expect(failing).toHaveBeenCalledTimes(1));
    expect(result.current).toBeUndefined();
  });
});
