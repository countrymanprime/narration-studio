// @vitest-environment jsdom
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../api/ApiContext';
import { createMockApi } from '../../api/mockApi';
import { TRACKS_READ_TOPIC, LIVE_TRACKS_TIMEOUT_MS } from '../engine/useLiveTracks';
import { useVoiceSetup } from '../engine/voiceLayout';
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

  // #3269: the host learns which tracks carry which assignment from a read of the tracks, so the setup the pickers show is read again after it.
  it('reads the voice setup again after each read of the tracks, without resetting it', async () => {
    const api = createMockApi({}, { voiceFolders: true });
    const get = vi.spyOn(api, 'voiceTracksGet');
    const notify = vi.fn();
    const shown: string[] = [];
    function Watcher() {
      useChapterTrackState();
      shown.push(useVoiceSetup().setup.layout);
      return null;
    }
    render(
      <ApiProvider api={api}>
        <ProjectTrackProviders projectFolder="C:/Projects/Alice" enabled notify={notify}>
          <Watcher />
        </ProjectTrackProviders>
      </ApiProvider>,
    );
    await waitFor(() => expect(get.mock.calls.length).toBeGreaterThanOrEqual(2));
    // Once it has said folders it never falls back to flat while it reads again.
    const first = shown.indexOf('folders');
    expect(first).toBeGreaterThanOrEqual(0);
    expect(shown.slice(first).every((layout) => layout === 'folders')).toBe(true);
  });

  // #3275: the check on a link the chapter already has is a press on this one reader, not a read of its own: it reads the tracks and the links
  // again here and answers the project, or says the read failed.
  it('a recheck reads the tracks and the links again through this reader and answers the project', async () => {
    const api = createMockApi({}, { voiceFolders: true });
    const { seen } = mount(api);
    await waitFor(() => expect(seen.current?.readAt).not.toBeNull());
    const live = vi.spyOn(api, 'tracksLive');
    const links = vi.spyOn(api, 'chapterTrackMapList');
    let answer: Awaited<ReturnType<ChapterTrackState['live']['recheck']>> | undefined;
    await act(async () => {
      answer = await seen.current?.live.recheck();
    });
    expect(live).toHaveBeenCalledTimes(1);
    expect(links).toHaveBeenCalled();
    expect(answer?.failed).toBe(false);
    expect(answer?.project?.tracks.length).toBeGreaterThan(0);
  });

  it('a recheck whose tracks read fails answers failed, and the failure is the one toast', async () => {
    const api = createMockApi({}, { voiceFolders: true });
    const { notify, seen } = mount(api);
    await waitFor(() => expect(seen.current?.readAt).not.toBeNull());
    api.tracksLive = async () => {
      throw new Error('REAPER is busy');
    };
    let answer: Awaited<ReturnType<ChapterTrackState['live']['recheck']>> | undefined;
    await act(async () => {
      answer = await seen.current?.live.recheck();
    });
    expect(answer?.failed).toBe(true);
    expect(notify).toHaveBeenCalledWith(expect.stringContaining('REAPER is busy'), 'error', expect.anything(), undefined, undefined, TRACKS_READ_TOPIC);
  });

  it('a recheck whose links read fails answers failed, with that read as the one toast', async () => {
    const api = createMockApi({}, { voiceFolders: true });
    const { notify, seen } = mount(api);
    await waitFor(() => expect(seen.current?.readAt).not.toBeNull());
    api.chapterTrackMapList = async () => {
      throw new Error('locked');
    };
    let answer: Awaited<ReturnType<ChapterTrackState['live']['recheck']>> | undefined;
    await act(async () => {
      answer = await seen.current?.live.recheck();
    });
    expect(answer?.failed).toBe(true);
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith(expect.stringContaining('locked'), 'error', expect.anything());
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

  it('a links read that hangs while the tracks keep answering still fails after the limit', async () => {
    vi.useFakeTimers();
    try {
      const api = createMockApi({}, { voiceFolders: true });
      api.chapterTrackMapList = () => new Promise(() => {});
      const { notify } = mount(api);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(LIVE_TRACKS_TIMEOUT_MS + 1500);
      });
      expect(notify).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('two screens that want it share one read of the tracks and one toast for a failure', async () => {
    const api = createMockApi({}, { voiceFolders: true });
    const live = vi.spyOn(api, 'tracksLive');
    const notify = vi.fn();
    function A() {
      useChapterTrackState();
      return null;
    }
    function B() {
      useChapterTrackState({ enabled: true });
      return null;
    }
    render(
      <ApiProvider api={api}>
        <ChapterTrackStateProvider projectFolder="C:/Projects/Alice" enabled notify={notify}>
          <A />
          <B />
        </ChapterTrackStateProvider>
      </ApiProvider>,
    );
    await act(async () => new Promise((r) => setTimeout(r, 60)));
    expect(live).toHaveBeenCalledTimes(1);
    cleanup();
    const failing = createMockApi({}, { voiceFolders: true });
    failing.tracksLive = async () => {
      throw new Error('down');
    };
    const failNotify = vi.fn();
    render(
      <ApiProvider api={failing}>
        <ChapterTrackStateProvider projectFolder="C:/Projects/Alice" enabled notify={failNotify}>
          <A />
          <B />
        </ChapterTrackStateProvider>
      </ApiProvider>,
    );
    await waitFor(() => expect(failNotify).toHaveBeenCalled());
    await act(async () => new Promise((r) => setTimeout(r, 60)));
    expect(failNotify.mock.calls.filter((call) => call[1] === 'error').length).toBe(1);
  });

  it('a quiet re-read (a changed read key) does not spin or add a toast, and a press does', async () => {
    const api = createMockApi({}, { voiceFolders: true });
    api.tracksLive = async () => {
      throw new Error('down');
    };
    const { notify, seen } = mount(api);
    await waitFor(() => expect(notify).toHaveBeenCalledTimes(1));
    await act(async () => seen.current?.reread());
    await act(async () => new Promise((r) => setTimeout(r, 30)));
    expect(notify).toHaveBeenCalledTimes(1);
    expect(seen.current?.live.refreshing).toBe(false);
    await act(async () => seen.current?.refresh());
    await waitFor(() => expect(notify.mock.calls.length).toBeGreaterThan(1));
  });

  it("a toast's Retry still reads after the last screen left", async () => {
    const api = createMockApi({}, { voiceFolders: true });
    const live = vi.spyOn(api, 'tracksLive');
    let failing = true;
    const real = api.tracksLive.bind(api);
    api.tracksLive = async () => {
      live();
      if (failing) throw new Error('down');
      return real();
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
    const before = live.mock.calls.length;
    failing = false;
    await act(async () => notify.mock.calls[0][2].onAction());
    await waitFor(() => expect(live.mock.calls.length).toBeGreaterThan(before));
  });

  it('a screen that wants only the links reads them and no tracks, and a change shows at once', async () => {
    const api = createMockApi({}, { voiceFolders: true });
    const live = vi.spyOn(api, 'tracksLive');
    const seen: { current?: ChapterTrackState } = {};
    function LinksOnly() {
      seen.current = useChapterTrackState({ enabled: true, tracks: false });
      return null;
    }
    render(
      <ApiProvider api={api}>
        <ChapterTrackStateProvider projectFolder="C:/Projects/Alice" enabled={false} notify={vi.fn()}>
          <LinksOnly />
        </ChapterTrackStateProvider>
      </ApiProvider>,
    );
    await waitFor(() => expect(seen.current?.mappings.length).toBeGreaterThan(0));
    expect(live).not.toHaveBeenCalled();
    await act(async () => seen.current?.applyMappings([]));
    expect(seen.current?.mappings).toEqual([]);
    const fresh = await act(async () => seen.current?.refreshLinks());
    expect(fresh?.length).toBeGreaterThan(0);
    await waitFor(() => expect(seen.current?.mappings.length).toBeGreaterThan(0));
  });

  it('refreshLinks rejects when the read fails, and toasts nothing: the caller shows it', async () => {
    const api = createMockApi({}, { voiceFolders: true });
    const real = api.chapterTrackMapList.bind(api);
    let failing = false;
    api.chapterTrackMapList = async () => {
      if (failing) throw new Error('locked');
      return real();
    };
    const notify = vi.fn();
    const seen: { current?: ChapterTrackState } = {};
    function LinksOnly() {
      seen.current = useChapterTrackState({ enabled: true, tracks: false });
      return null;
    }
    render(
      <ApiProvider api={api}>
        <ChapterTrackStateProvider projectFolder="C:/Projects/Alice" enabled={false} notify={notify}>
          <LinksOnly />
        </ChapterTrackStateProvider>
      </ApiProvider>,
    );
    await waitFor(() => expect(seen.current?.mappings.length).toBeGreaterThan(0));
    failing = true;
    await expect(seen.current!.refreshLinks()).rejects.toThrow('locked');
    expect(notify).not.toHaveBeenCalled();
  });

  it('a read a newer one superseded never rejects its caller, even when it hangs', async () => {
    vi.useFakeTimers();
    try {
      const api = createMockApi({}, { voiceFolders: true });
      const real = api.chapterTrackMapList.bind(api);
      let calls = 0;
      api.chapterTrackMapList = () => (++calls === 1 ? new Promise(() => {}) : real());
      const seen: { current?: ChapterTrackState } = {};
      function LinksOnly() {
        seen.current = useChapterTrackState({ enabled: true, tracks: false });
        return null;
      }
      render(
        <ApiProvider api={api}>
          <ChapterTrackStateProvider projectFolder="C:/Projects/Alice" enabled={false} notify={vi.fn()}>
            <LinksOnly />
          </ChapterTrackStateProvider>
        </ApiProvider>,
      );
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10);
      });
      const first = seen.current!.refreshLinks();
      const second = seen.current!.refreshLinks();
      const settled = vi.fn();
      void first.then(settled, settled);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(LIVE_TRACKS_TIMEOUT_MS + 100);
      });
      await expect(second).resolves.toBeDefined();
      expect(settled).toHaveBeenCalledWith(expect.any(Array));
    } finally {
      vi.useRealTimers();
    }
  });
});

// #3355: the Production board's per-chapter link state (status, candidates, warnings) is the state's too, so a link made in the Engine panel
// shows there at once.
describe('the chapter link detail on the shared state', () => {
  function mountDetail(api: ReturnType<typeof createMockApi>) {
    const seen: { current?: ChapterTrackState } = {};
    function Board() {
      seen.current = useChapterTrackState({ enabled: true, tracks: false, detail: true });
      return null;
    }
    render(
      <ApiProvider api={api}>
        <ChapterTrackStateProvider projectFolder="C:/Projects/Alice" enabled notify={() => {}}>
          <Board />
        </ChapterTrackStateProvider>
      </ApiProvider>,
    );
    return seen;
  }

  it("reads each chapter's link state with the links once a screen asks for it", async () => {
    const api = createMockApi();
    const read = vi.spyOn(api, 'chapterTrackLinks');
    const seen = mountDetail(api);
    await waitFor(() => expect(seen.current?.details?.chapters.length).toBeGreaterThan(0));
    expect(read).toHaveBeenCalled();
  });

  it('does not read it for a screen that wants only the links', async () => {
    const api = createMockApi();
    const read = vi.spyOn(api, 'chapterTrackLinks');
    const { seen } = mount(api);
    await waitFor(() => expect(seen.current?.readAt).not.toBeNull());
    expect(read).not.toHaveBeenCalled();
    expect(seen.current?.details).toBeUndefined();
  });

  it('shows a link made elsewhere at once, as soon as the change is applied', async () => {
    const api = createMockApi();
    const seen = mountDetail(api);
    await waitFor(() => expect(seen.current?.details?.chapters.length).toBeGreaterThan(0));
    const chapterId = seen.current!.details!.chapters.find((chapter) => chapter.status === 'none')!.chapterId;
    const track = seen.current!.details!.tracks.at(-1)!;
    const result = await api.chapterTrackSet(chapterId, track.guid);
    act(() => seen.current!.applyMappings(result.mappings));
    await waitFor(() => expect(seen.current?.details?.chapters.find((chapter) => chapter.chapterId === chapterId)?.track?.trackGuid).toBe(track.guid));
  });
});
