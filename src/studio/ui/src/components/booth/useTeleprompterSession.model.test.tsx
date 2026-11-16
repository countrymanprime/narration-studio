// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../api/ApiContext';
import { createMockApi } from '../../api/mockApi';
import type { AssetCatalog, AssetItem } from '../../types';
import { useTeleprompterSession } from './useTeleprompterSession';

/**
 * The live speech model is asked for when it is chosen and before a take begins, never behind a take that is already recording:
 * a missing model opens its install question at once, closing the question puts a choice back, and a download that finished only
 * installs (it does not start a session the narrator did not ask for).
 */

function asset(kind: string, id: string, installState: AssetItem['installState']): AssetItem {
  return {
    kind,
    kindLabel: 'Live model',
    id,
    displayName: `${kind} ${id}`,
    version: '1',
    publisher: 'p',
    license: 'MIT',
    licenseUrl: 'https://example.test/l',
    modelCardUrl: 'https://example.test/m',
    provenanceUrl: 'https://example.test/p',
    attribution: 'a',
    downloadSize: 78_000_000,
    diskSize: 80_000_000,
    installState,
    path: 'C:/models',
    installedAt: '',
    verifiedAt: '',
    activeJobId: '',
  };
}

function setup(assets: AssetItem[]) {
  const catalog: AssetCatalog = {
    cacheRoot: 'C:/cache',
    defaultRoot: 'C:/cache',
    custom: false,
    previousRoot: '',
    folderNote: '',
    totalInstalledBytes: 0,
    assets,
  };
  const saveSettings = vi.fn(async () => ({}) as never);
  const teleprompterStart = vi.fn(async () => ({ status: 'started' as const }));
  const api = createMockApi({ assetsList: async () => structuredClone(catalog), saveSettings, teleprompterStart } as never);
  const wrapper = ({ children }: { children: ReactNode }) => <ApiProvider api={api}>{children}</ApiProvider>;
  const hook = renderHook(() => useTeleprompterSession({ chapterId: 'c-0001', chapter: undefined, migrateLegacyDevice: false }), { wrapper });
  return { hook, saveSettings, teleprompterStart };
}

describe('the live model is asked for before anything records', () => {
  it('says yes without a question when the model is installed', async () => {
    const { hook } = setup([asset('whisper', 'tiny', 'installed')]);
    let answer = false;
    await act(async () => {
      answer = await hook.result.current.ensureModel();
    });
    expect(answer).toBe(true);
    expect(hook.result.current.prompt).toBeUndefined();
  });

  it('opens the install question and says no when the model is missing, so Record does not begin', async () => {
    const { hook } = setup([asset('whisper', 'tiny', 'not_installed')]);
    let answer = true;
    await act(async () => {
      answer = await hook.result.current.ensureModel();
    });
    expect(answer).toBe(false);
    expect(hook.result.current.prompt?.model.id).toBe('tiny');
    expect(hook.result.current.prompt?.downloadSize).toBe(78_000_000);
  });

  it('a check the caller gave up on opens no install question when it answers missing (#3321)', async () => {
    const { hook } = setup([asset('whisper', 'tiny', 'not_installed')]);
    let gaveUp = false;
    let answer = false;
    await act(async () => {
      const pending = hook.result.current.ensureModel(undefined, undefined, () => gaveUp);
      gaveUp = true;
      answer = await pending;
    });
    expect(answer).toBe(true);
    expect(hook.result.current.prompt).toBeUndefined();
    expect(hook.result.current.modelMissing).toBe(false);
  });

  it('claims nothing when the asset list cannot be read, and the take goes on', async () => {
    const api = createMockApi({
      assetsList: async () => {
        throw new Error('no host');
      },
    } as never);
    const wrapper = ({ children }: { children: ReactNode }) => <ApiProvider api={api}>{children}</ApiProvider>;
    const hook = renderHook(() => useTeleprompterSession({ chapterId: 'c-0001', chapter: undefined, migrateLegacyDevice: false }), { wrapper });
    let answer = false;
    await act(async () => {
      answer = await hook.result.current.ensureModel();
    });
    expect(answer).toBe(true);
  });
});

describe('a model found installed is not waited for again (#3432)', () => {
  const setupHeld = (state: 'installed' | 'not_installed') => {
    let hang = false;
    let listed = state;
    const assetsList = vi.fn(async () => {
      if (hang) return new Promise<never>(() => {});
      return {
        cacheRoot: 'C:/cache',
        defaultRoot: 'C:/cache',
        custom: false,
        previousRoot: '',
        folderNote: '',
        totalInstalledBytes: 0,
        assets: [asset('whisper', 'tiny', listed)],
      } satisfies AssetCatalog;
    });
    const api = createMockApi({ assetsList } as never);
    const wrapper = ({ children }: { children: ReactNode }) => <ApiProvider api={api}>{children}</ApiProvider>;
    const hook = renderHook(() => useTeleprompterSession({ chapterId: 'c-0001', chapter: undefined, migrateLegacyDevice: false }), { wrapper });
    return { hook, assetsList, hang: () => (hang = true), setListed: (value: typeof state) => (listed = value) };
  };

  it('answers yes at once, with the list never answering, once an earlier check found the model installed', async () => {
    const { hook, hang, assetsList } = setupHeld('installed');
    await act(async () => {
      expect(await hook.result.current.ensureModel()).toBe(true);
    });
    hang();
    const before = assetsList.mock.calls.length;
    let answered = false;
    await act(async () => {
      void hook.result.current.ensureModel().then(() => (answered = true));
    });
    expect(answered).toBe(true);
    // The list is still read again behind the press, so a model that went away is found by the press after.
    expect(assetsList.mock.calls.length).toBe(before + 1);
  });

  it('forgets the answer when the list read behind a press finds the model gone: the next press asks, and the question opens', async () => {
    const { hook, setListed } = setupHeld('installed');
    await act(async () => void (await hook.result.current.ensureModel()));
    setListed('not_installed');
    await act(async () => void (await hook.result.current.ensureModel()));
    expect(hook.result.current.prompt).toBeUndefined();
    let answer = true;
    await act(async () => {
      answer = await hook.result.current.ensureModel();
    });
    expect(answer).toBe(false);
    expect(hook.result.current.prompt?.model.id).toBe('tiny');
  });
});

describe('choosing an engine whose model is missing', () => {
  it('asks for the download at once and puts the engine back when the question is closed without one', async () => {
    const { hook, saveSettings } = setup([asset('whisper', 'tiny', 'installed'), asset('moonshine', 'tiny', 'not_installed')]);
    await waitFor(() => expect(hook.result.current.engine).toBe('whisper'));
    act(() => hook.result.current.changeEngine('moonshine'));
    await waitFor(() => expect(hook.result.current.prompt?.engine).toBe('moonshine'));
    expect(hook.result.current.engine).toBe('moonshine');

    act(() => hook.result.current.closeModelPrompt());

    expect(hook.result.current.engine).toBe('whisper');
    expect(hook.result.current.prompt).toBeUndefined();
    const saved = saveSettings.mock.calls.map((call) => JSON.stringify(call));
    expect(saved.some((call) => call.includes('"engine":"moonshine"'))).toBe(true);
    expect(saved[saved.length - 1]).toContain('"engine":"whisper"');
  });

  it('asks for nothing when the chosen engine already has its model', async () => {
    const { hook } = setup([asset('whisper', 'tiny', 'installed'), asset('moonshine', 'tiny', 'installed')]);
    await waitFor(() => expect(hook.result.current.settingsLoaded).toBe(true));
    act(() => hook.result.current.changeEngine('moonshine'));
    await act(async () => {});
    expect(hook.result.current.engine).toBe('moonshine');
    expect(hook.result.current.prompt).toBeUndefined();
  });
});
