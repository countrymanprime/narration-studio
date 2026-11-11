// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../api/ApiContext';
import { createMockApi } from '../../api/mockApi';
import { useChapterTrackSnapshot } from './useChapterTrackSnapshot';

const wrap = (api: ReturnType<typeof createMockApi>) =>
  function Wrapper({ children }: { children: ReactNode }) {
    return <ApiProvider api={api}>{children}</ApiProvider>;
  };

describe('the snapshot of the project tracks and the chapter links (#3366)', () => {
  it('reads the tracks as REAPER has them now, so a rename or a delete not yet saved is seen by a page that reads once', async () => {
    const api = createMockApi({}, { voiceFolders: true });
    const live = await api.tracksLive();
    const [first, ...rest] = live.project.tracks;
    vi.spyOn(api, 'tracksLive').mockResolvedValue({ ...live, project: { ...live.project, tracks: [{ ...first, name: 'Renamed' }, ...rest.slice(1)] } });
    const { result } = renderHook(() => useChapterTrackSnapshot(), { wrapper: wrap(api) });

    const snapshot = await result.current();

    expect(snapshot.project?.tracks[0].name).toBe('Renamed');
    expect(snapshot.project?.tracks).toHaveLength(live.project.tracks.length - 1);
    expect(snapshot.mappings.length).toBeGreaterThan(0);
  });

  it('reads the links alone when the tracks are not wanted, and never asks REAPER', async () => {
    const api = createMockApi({}, { voiceFolders: true });
    const live = vi.spyOn(api, 'tracksLive');
    const { result } = renderHook(() => useChapterTrackSnapshot(), { wrapper: wrap(api) });

    const snapshot = await result.current({ tracks: false });

    expect(snapshot.project).toBeUndefined();
    expect(snapshot.mappings.length).toBeGreaterThan(0);
    expect(live).not.toHaveBeenCalled();
  });

  it('rejects when a read fails, the one way every page learns it', async () => {
    const api = createMockApi({}, { voiceFolders: true });
    vi.spyOn(api, 'tracksLive').mockRejectedValue(new Error('REAPER is busy'));
    const { result } = renderHook(() => useChapterTrackSnapshot(), { wrapper: wrap(api) });

    await expect(result.current()).rejects.toThrow('REAPER is busy');
  });
});
