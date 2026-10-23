// @vitest-environment jsdom
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { ApiProvider } from '../../../api/ApiContext';
import type { AssetCatalog, AssetItem } from '../../../api/contracts/assets';
import { createMockApi } from '../../../api/mockApi';
import type { NarrationApi } from '../../../types';
import { useListeningModelState } from './useListeningModelState';

const item = (over: Partial<AssetItem>): AssetItem =>
  ({ kind: 'whisper', kindLabel: 'Whisper model', id: 'tiny', displayName: 'Tiny', installState: 'installed', ...over }) as AssetItem;
const catalog = (...assets: AssetItem[]): AssetCatalog => ({ cacheRoot: 'C:/cache', totalInstalledBytes: 0, assets });

function state(assetsList: () => Promise<AssetCatalog>, engine = 'whisper', model = 'tiny', again = 0) {
  const api = createMockApi({ assetsList } as Partial<NarrationApi>);
  const wrapper = ({ children }: { children: ReactNode }) => <ApiProvider api={api}>{children}</ApiProvider>;
  return renderHook(({ again: n }) => useListeningModelState(engine, model, n), { wrapper, initialProps: { again } });
}

// Whether the speech model the Booth listens with is on this computer, read from the download catalog before any start asks for it.
describe('useListeningModelState', () => {
  it('says missing when the catalog lists the model as not installed, and installed when it is', async () => {
    const missing = state(async () => catalog(item({ installState: 'not_installed' })));
    await waitFor(() => expect(missing.result.current).toBe('missing'));
    const there = state(async () => catalog(item({ installState: 'installed' })));
    await waitFor(() => expect(there.result.current).toBe('installed'));
  });

  it('a model that needs repair is not there either', async () => {
    const damaged = state(async () => catalog(item({ installState: 'verification_failed' })));
    await waitFor(() => expect(damaged.result.current).toBe('missing'));
  });

  it('cannot tell when the model is not in the catalog, the engine has none, or the read fails: it claims nothing', async () => {
    const none = state(async () => catalog(item({ id: 'small' })));
    const other = state(async () => catalog(item({ kind: 'moonshine', installState: 'not_installed' })));
    const failed = state(() => Promise.reject(new Error('no answer')));
    await waitFor(() => expect(none.result.current).toBe('unknown'));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(none.result.current).toBe('unknown');
    expect(other.result.current).toBe('unknown');
    expect(failed.result.current).toBe('unknown');
  });

  it('reads again when asked to, as after a download finishes', async () => {
    let installed = false;
    const hook = state(async () => catalog(item({ installState: installed ? 'installed' : 'not_installed' })));
    await waitFor(() => expect(hook.result.current).toBe('missing'));
    installed = true;
    hook.rerender({ again: 1 });
    await waitFor(() => expect(hook.result.current).toBe('installed'));
  });
});
