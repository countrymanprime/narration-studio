// @vitest-environment jsdom
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../api/ApiContext';
import { createMockApi } from '../../api/mockApi';
import { LIVE_TRACKS_TIMEOUT_MS } from '../engine/useLiveTracks';
import { ChapterTrackStateProvider, ProjectTrackProviders, useChapterTrackState, type ChapterTrackState } from './ChapterTrackState';

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

  it('a press of Retry always answers: another toast when the read fails again, and the state is ready once it works', async () => {
    const api = createMockApi({}, { voiceFolders: true });
    const real = api.chapterTrackMapList.bind(api);
    let failing = true;
    api.chapterTrackMapList = async () => {
      if (failing) throw new Error('locked');
      return real();
    };
    const { notify, seen } = mount(api);
    await waitFor(() => expect(notify).toHaveBeenCalledTimes(1));
    await act(async () => notify.mock.calls[0][2].onAction());
    await waitFor(() => expect(notify).toHaveBeenCalledTimes(2));
    failing = false;
    await act(async () => notify.mock.calls[1][2].onAction());
    await waitFor(() => expect(seen.current?.readAt).not.toBeNull());
    expect(notify).toHaveBeenCalledTimes(2);
    expect(seen.current?.stale).toBe(false);
  });

  it('a links read that never answers is a failure after the limit, with a Retry', async () => {
    vi.useFakeTimers();
    try {
      const api = createMockApi({}, { voiceFolders: true });
      api.chapterTrackMapList = () => new Promise(() => {});
      const { notify } = mount(api);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(LIVE_TRACKS_TIMEOUT_MS + 100);
      });
      expect(notify).toHaveBeenCalledTimes(1);
      expect(notify.mock.calls[0][2]).toBeDefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it('reads nothing of an earlier project once reading is off or the project changes', async () => {
    const api = createMockApi({}, { voiceFolders: true });
    const seen: { current?: ChapterTrackState } = {};
    function Watcher() {
      seen.current = useChapterTrackState();
      return null;
    }
    const tree = (projectFolder: string, enabled: boolean) => (
      <ApiProvider api={api}>
        <ProjectTrackProviders projectFolder={projectFolder} enabled={enabled} notify={vi.fn()}>
          <Watcher />
        </ProjectTrackProviders>
      </ApiProvider>
    );
    const view = render(tree('C:/Projects/A', true));
    await waitFor(() => expect(seen.current?.readAt).not.toBeNull());
    view.rerender(tree('C:/Projects/A', false));
    expect(seen.current?.project).toBeUndefined();
    expect(seen.current?.mappings).toEqual([]);
    expect(seen.current?.readAt).toBeNull();
    view.rerender(tree('C:/Projects/A', true));
    await waitFor(() => expect(seen.current?.readAt).not.toBeNull());
    api.tracksLive = () => new Promise(() => {});
    view.rerender(tree('C:/Projects/B', true));
    expect(seen.current?.project).toBeUndefined();
    expect(seen.current?.readAt).toBeNull();
  });

  it('a screen that watches after the others left meets a failure with a toast again', async () => {
    const api = createMockApi({}, { voiceFolders: true });
    api.chapterTrackMapList = async () => {
      throw new Error('locked');
    };
    const notify = vi.fn();
    const tree = (watch: boolean) => (
      <ApiProvider api={api}>
        <ChapterTrackStateProvider projectFolder="C:/Projects/Alice" enabled notify={notify}>
          {watch && <Probe />}
        </ChapterTrackStateProvider>
      </ApiProvider>
    );
    function Probe() {
      useChapterTrackState();
      return null;
    }
    const view = render(tree(true));
    await waitFor(() => expect(notify).toHaveBeenCalledTimes(1));
    view.rerender(tree(false));
    await act(async () => new Promise((r) => setTimeout(r, 20)));
    view.rerender(tree(true));
    await waitFor(() => expect(notify).toHaveBeenCalledTimes(2));
  });

  it('reads while any screen wants it, and a screen that does not want it sees nothing', async () => {
    const api = createMockApi({}, { voiceFolders: true });
    const live = vi.spyOn(api, 'tracksLive');
    const wanting: { current?: ChapterTrackState } = {};
    const idle: { current?: ChapterTrackState } = {};
    function Wanting() {
      wanting.current = useChapterTrackState({ enabled: true });
      return null;
    }
    function Idle() {
      idle.current = useChapterTrackState({ enabled: false });
      return null;
    }
    const tree = (wants: boolean) => (
      <ApiProvider api={api}>
        <ChapterTrackStateProvider projectFolder="C:/Projects/Alice" enabled notify={vi.fn()}>
          <Idle />
          {wants && <Wanting />}
        </ChapterTrackStateProvider>
      </ApiProvider>
    );
    const view = render(tree(false));
    await act(async () => new Promise((r) => setTimeout(r, 30)));
    expect(live).not.toHaveBeenCalled();
    view.rerender(tree(true));
    await waitFor(() => expect(wanting.current?.readAt).not.toBeNull());
    expect(live).toHaveBeenCalled();
    // The whole live read is there for the Engine panel's status line and Refresh.
    expect(wanting.current?.live.project?.tracks.length).toBeGreaterThan(0);
    expect(idle.current?.project).toBeUndefined();
    expect(idle.current?.readAt).toBeNull();
  });
});
