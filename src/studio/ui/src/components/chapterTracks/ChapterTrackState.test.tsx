// @vitest-environment jsdom
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../api/ApiContext';
import { createMockApi } from '../../api/mockApi';
import { ChapterTrackStateProvider, useChapterTrackState, type ChapterTrackState } from './ChapterTrackState';

afterEach(cleanup);

function mount(api: ReturnType<typeof createMockApi>, { enabled = true, watch = true } = {}) {
  const notify = vi.fn();
  const seen: { current?: ChapterTrackState } = {};
  function Watcher() {
    seen.current = useChapterTrackState();
    return null;
  }
  render(
    <ApiProvider api={api}>
      <ChapterTrackStateProvider projectFolder="C:/Projects/Alice" enabled={enabled} notify={notify}>
        {watch && <Watcher />}
      </ChapterTrackStateProvider>
    </ApiProvider>,
  );
  return { notify, seen };
}

describe('the shared chapter-track state', () => {
  it('reads the tracks and the links together once a screen watches', async () => {
    const { seen } = mount(createMockApi({}, { voiceFolders: true }));
    await waitFor(() => expect(seen.current?.readAt).not.toBeNull());
    expect(seen.current?.project?.tracks.length).toBeGreaterThan(0);
    expect(seen.current?.mappings.length).toBeGreaterThan(0);
  });

  it('reads nothing while no screen watches, or while disabled', async () => {
    const api = createMockApi({}, { voiceFolders: true });
    const live = vi.spyOn(api, 'tracksLive');
    const links = vi.spyOn(api, 'chapterTrackMapList');
    mount(api, { watch: false });
    mount(api, { enabled: false });
    await act(async () => new Promise((r) => setTimeout(r, 30)));
    expect(live).not.toHaveBeenCalled();
    expect(links).not.toHaveBeenCalled();
  });

  it('a failed links read is one toast with Retry, and the state is not ready', async () => {
    const api = createMockApi({}, { voiceFolders: true });
    api.chapterTrackMapList = async () => {
      throw new Error('locked');
    };
    const { notify, seen } = mount(api);
    await waitFor(() => expect(notify).toHaveBeenCalledTimes(1));
    expect(notify.mock.calls[0][1]).toBe('error');
    expect(notify.mock.calls[0][2]).toBeDefined();
    expect(seen.current?.readAt).toBeNull();
  });
});
