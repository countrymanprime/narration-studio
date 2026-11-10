// @vitest-environment jsdom
// The state matrix (definition of done, rule 3) for the engine panel's live track list (#2840): the tracks Chapter links, the Link chapters
// dialog and the Chapter links table draw from, re-read from REAPER so a track added there shows before the project is saved. The controls are the
// Refresh button and the source line beside it (ChapterLinksTable.test.tsx and LinkChaptersDialog.test.tsx draw them); here is the reader.
//
//   loading                                    'the first read is busy and shows nothing until REAPER answers'
//   one, many, empty                           'the answer is the project, with where it came from'
//   a track added in REAPER after the open     'a track added in REAPER after the panel opened appears on the next read: focus, timer, Refresh, a new read key'
//   timer only while the window is visible     'the timer reads only while the window is visible, and coming back reads at once'
//   refused (REAPER closed, other project)     'a saved answer keeps its reason and sentence'
//   failed, first read                         'a first read that fails is the error, with no tracks, and a toast whose Retry reads again'
//   failed after a good read (gone quiet)      'a read that fails after a good one keeps the tracks, marks them stale and toasts once'
//   a run of automatic failures                'a run of automatic failures toasts once, whatever starts them; a press toasts again'
//   stale, then answering again                'a good read after a failed one clears the stale mark'
//   rapid double-fire                          'two Refresh presses send two reads and only the newer answer is kept'
//   answers out of order                       'an older read answering after a newer one never replaces it'
//   repeats an event                           'the same answer twice changes nothing the panel draws' (one render's worth: the project is replaced, not merged)
//   never answers                              'a read still unanswered after LIVE_TRACKS_TIMEOUT_MS is treated as failed and the poll resumes'
//   answers late, after its limit              same test: its late answer never replaces the newer read's
//   two readers at once (the dialog opening)   'joining while a read is in flight sends nothing more, and reads when none is'
//   leave mid-action (unmount mid-read)        'an answer after the panel closed is dropped'
//   Audacity (disabled)                        'disabled, it never reads'
//   long, RTL and emoji names                  not tested here: the hook passes names through untouched (tracks_read_test.lua and tracks_read_test.go send them)
//   wrong project / wrong version / restart    the host's reasons (other_project, outdated, not_running): tracks_live_test.go; here they are one 'saved' answer
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../api/ApiContext';
import { createMockApi } from '../../api/mockApi';
import type { Track, TracksLive } from '../../api/contracts/tracks';
import { LIVE_TRACKS_POLL_MS, LIVE_TRACKS_TIMEOUT_MS, TRACKS_READ_TOPIC, useLiveTracks, type LiveTracks } from './useLiveTracks';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const track = (index: number, name: string, over: Partial<Track> = {}): Track => ({
  guid: `{0000000${index}-0000-4000-8000-00000000000${index}}`,
  index,
  name,
  color: '',
  muted: false,
  soloed: false,
  items: [],
  depth: 0,
  isFolder: false,
  ...over,
});

const answer = (tracks: Track[], over: Partial<TracksLive> = {}): TracksLive => ({
  source: 'live',
  reason: '',
  message: '',
  readAt: '2026-11-03T12:00:00Z',
  project: { path: 'C:/Projects/Alice/Alice.rpp', tracks },
  ...over,
});

/** A host whose live reads answer when the test says, in any order. */
function heldHost() {
  const api = createMockApi();
  const pending: Array<{ resolve: (value: TracksLive) => void; reject: (reason: unknown) => void }> = [];
  api.tracksLive = vi.fn(() => new Promise<TracksLive>((resolve, reject) => pending.push({ resolve, reject })));
  return { api, pending };
}

function mount(api: ReturnType<typeof createMockApi>, props: { enabled?: boolean; readKey?: unknown } = {}, notify = vi.fn()) {
  const hook: { current?: LiveTracks } = {};
  function Probe({ enabled, readKey }: { enabled: boolean; readKey: unknown }) {
    hook.current = useLiveTracks({ enabled, readKey, notify });
    return null;
  }
  const view = render(
    <ApiProvider api={api}>
      <Probe enabled={props.enabled ?? true} readKey={props.readKey ?? 'Alice.rpp'} />
    </ApiProvider>,
  );
  const rerender = (next: { enabled?: boolean; readKey?: unknown }) =>
    view.rerender(
      <ApiProvider api={api}>
        <Probe enabled={next.enabled ?? true} readKey={next.readKey ?? 'Alice.rpp'} />
      </ApiProvider>,
    );
  return { hook: hook as { current: LiveTracks }, notify, unmount: view.unmount, rerender };
}

const settle = () => act(async () => {});

function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
  document.dispatchEvent(new Event('visibilitychange'));
}

beforeEach(() => setVisibility('visible'));

describe('reading the live track list', () => {
  it('the first read is busy and shows nothing until REAPER answers', async () => {
    const { api, pending } = heldHost();
    const { hook } = mount(api);
    await settle();
    expect(hook.current.busy).toBe(true);
    expect(hook.current.project).toBeUndefined();
    expect(hook.current.readAt).toBeNull();
    await act(async () => pending[0].resolve(answer([track(0, 'Chapter 1')])));
    expect(hook.current.busy).toBe(false);
    expect(hook.current.project?.tracks.map((t) => t.name)).toEqual(['Chapter 1']);
  });

  it('the answer is the project, with where it came from', async () => {
    for (const tracks of [[], [track(0, 'Chapter 1')], [track(0, 'Chapter 1'), track(1, 'Chapter 2'), track(2, 'Chapter 3')]]) {
      const api = createMockApi();
      api.tracksLive = async () => answer(tracks);
      const { hook } = mount(api);
      await settle();
      expect(hook.current.project?.tracks).toHaveLength(tracks.length);
      expect(hook.current.source).toBe('live');
      expect(hook.current.stale).toBe(false);
      expect(hook.current.readAt).not.toBeNull();
      cleanup();
    }
  });

  it('a track added in REAPER after the panel opened appears on the next read: focus, timer, Refresh, a new read key', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const api = createMockApi();
    let tracks = [track(0, 'Chapter 1')];
    api.tracksLive = vi.fn(async () => answer(tracks));
    const { hook, rerender } = mount(api);
    await settle();
    expect(hook.current.project?.tracks.map((t) => t.name)).toEqual(['Chapter 1']);

    tracks = [...tracks, track(1, 'Chapter 2 (added in REAPER)')];
    await act(async () => window.dispatchEvent(new Event('focus')));
    expect(hook.current.project?.tracks.map((t) => t.name)).toEqual(['Chapter 1', 'Chapter 2 (added in REAPER)']);

    tracks = [...tracks, track(2, 'Chapter 3 folder', { isFolder: true })];
    await act(async () => vi.advanceTimersByTime(LIVE_TRACKS_POLL_MS));
    expect(hook.current.project?.tracks).toHaveLength(3);

    tracks = [...tracks, track(3, 'Voice', { depth: 1 })];
    await act(async () => hook.current.refresh());
    expect(hook.current.project?.tracks).toHaveLength(4);

    tracks = [...tracks, track(4, 'Chapter 4')];
    rerender({ readKey: 'checked again' });
    await settle();
    expect(hook.current.project?.tracks).toHaveLength(5);
  });

  it("a pressed read that a newer read takes over still resolves with the newest read's answer, so the press answers (#3339)", async () => {
    const api = createMockApi();
    const waiting: Array<(value: ReturnType<typeof answer>) => void> = [];
    api.tracksLive = vi.fn(() => new Promise<ReturnType<typeof answer>>((resolve) => waiting.push(resolve)));
    const { hook } = mount(api);
    await settle();
    let pressed: Promise<{ project?: unknown; failed: boolean }> | undefined;
    act(() => {
      pressed = hook.current.recheck();
    });
    act(() => hook.current.reread());
    await act(async () => {
      for (const resolve of waiting) resolve(answer([track(0, 'Chapter 1'), track(1, 'Chapter 2')]));
    });
    const result = await pressed;
    expect(result?.failed).toBe(false);
    expect(result?.project).toBeDefined();
  });

  it('the timer reads only while the window is visible, and coming back reads at once', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const api = createMockApi();
    api.tracksLive = vi.fn(async () => answer([track(0, 'Chapter 1')]));
    mount(api);
    await settle();
    expect(api.tracksLive).toHaveBeenCalledTimes(1);
    setVisibility('hidden');
    await act(async () => vi.advanceTimersByTime(LIVE_TRACKS_POLL_MS * 3));
    expect(api.tracksLive).toHaveBeenCalledTimes(1);
    await act(async () => setVisibility('visible'));
    expect(api.tracksLive).toHaveBeenCalledTimes(2);
  });

  it('a saved answer keeps its reason and sentence', async () => {
    const api = createMockApi();
    const message = 'REAPER has another project open, so these are the tracks in the saved project.';
    api.tracksLive = async () => answer([track(0, 'Chapter 1')], { source: 'saved', reason: 'other_project', message });
    const { hook } = mount(api);
    await settle();
    expect(hook.current.source).toBe('saved');
    expect(hook.current.reason).toBe('other_project');
    expect(hook.current.message).toBe(message);
    expect(hook.current.stale).toBe(false);
  });

  it('a first read that fails is the error, with no tracks, and a toast whose Retry reads again', async () => {
    const api = createMockApi();
    let fail = true;
    api.tracksLive = vi.fn(async () => {
      if (fail) throw new Error('REAPER did not answer in time.');
      return answer([track(0, 'Chapter 1')]);
    });
    const { hook, notify } = mount(api);
    await settle();
    expect(hook.current.project).toBeUndefined();
    expect(hook.current.stale).toBe(false);
    expect(hook.current.error).toContain('REAPER did not answer');
    expect(notify).toHaveBeenCalledTimes(1);
    const [, tone, action] = notify.mock.calls[0];
    expect(tone).toBe('error');
    expect(action?.label).toBe('Retry');
    fail = false;
    await act(async () => action.onAction());
    expect(api.tracksLive).toHaveBeenCalledTimes(2);
    expect(hook.current.project?.tracks).toHaveLength(1);
    expect(hook.current.error).toBe('');
  });

  it('a run of automatic failures toasts once, whatever starts them; a press toasts again', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const api = createMockApi();
    api.tracksLive = vi.fn(async () => {
      throw new Error('REAPER did not answer in time.');
    });
    const { notify, rerender, hook } = mount(api);
    await settle();
    await act(async () => vi.advanceTimersByTime(LIVE_TRACKS_POLL_MS * 3));
    await act(async () => window.dispatchEvent(new Event('focus')));
    rerender({ readKey: 'checked again' });
    await settle();
    expect(vi.mocked(api.tracksLive).mock.calls.length).toBeGreaterThanOrEqual(4);
    expect(notify).toHaveBeenCalledTimes(1);
    await act(async () => hook.current.refresh());
    expect(notify).toHaveBeenCalledTimes(2);
  });

  it('a read that fails after a good one keeps the tracks, marks them stale and toasts once', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const api = createMockApi();
    let fail = false;
    api.tracksLive = vi.fn(async () => {
      if (fail) throw new Error('REAPER did not answer in time.');
      return answer([track(0, 'Chapter 1')]);
    });
    const { hook, notify } = mount(api);
    await settle();
    const readAt = hook.current.readAt;
    fail = true;
    await act(async () => vi.advanceTimersByTime(LIVE_TRACKS_POLL_MS));
    await act(async () => vi.advanceTimersByTime(LIVE_TRACKS_POLL_MS));
    expect(hook.current.project?.tracks).toHaveLength(1);
    expect(hook.current.stale).toBe(true);
    expect(hook.current.readAt).toBe(readAt);
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith(
      expect.stringContaining('REAPER did not answer'),
      'error',
      expect.objectContaining({ label: 'Retry' }),
      undefined,
      undefined,
      TRACKS_READ_TOPIC,
    );
    // A Refresh press that fails says so again: the narrator asked.
    await act(async () => hook.current.refresh());
    expect(notify).toHaveBeenCalledTimes(2);
  });

  it('a good read after a failed one clears the stale mark', async () => {
    const api = createMockApi();
    let fail = false;
    api.tracksLive = vi.fn(async () => {
      if (fail) throw new Error('REAPER did not answer in time.');
      return answer([track(0, 'Chapter 1')]);
    });
    const { hook } = mount(api);
    await settle();
    fail = true;
    await act(async () => hook.current.refresh());
    expect(hook.current.stale).toBe(true);
    fail = false;
    await act(async () => hook.current.refresh());
    expect(hook.current.stale).toBe(false);
    expect(hook.current.error).toBe('');
  });

  it('two Refresh presses send two reads and only the newer answer is kept', async () => {
    const { api, pending } = heldHost();
    const { hook } = mount(api);
    await settle();
    await act(async () => pending[0].resolve(answer([track(0, 'Chapter 1')])));
    await act(async () => {
      hook.current.refresh();
      hook.current.refresh();
    });
    expect(pending).toHaveLength(3);
    expect(hook.current.refreshing).toBe(true);
    await act(async () => pending[2].resolve(answer([track(0, 'Chapter 1'), track(1, 'Chapter 2')])));
    expect(hook.current.busy).toBe(true);
    expect(hook.current.refreshing).toBe(false);
    await act(async () => pending[1].resolve(answer([])));
    expect(hook.current.project?.tracks).toHaveLength(2);
    expect(hook.current.busy).toBe(false);
  });

  it('an older read answering after a newer one never replaces it', async () => {
    const { api, pending } = heldHost();
    const { hook } = mount(api);
    await settle();
    await act(async () => hook.current.refresh());
    await act(async () => pending[1].resolve(answer([track(0, 'Chapter 1'), track(1, 'Added')])));
    await act(async () => pending[0].resolve(answer([track(0, 'Chapter 1')])));
    expect(hook.current.project?.tracks.map((t) => t.name)).toEqual(['Chapter 1', 'Added']);
    await act(async () => pending[0].reject(new Error('late failure')));
    expect(hook.current.stale).toBe(false);
  });

  it('the same answer twice changes nothing the panel draws', async () => {
    const api = createMockApi();
    api.tracksLive = async () => answer([track(0, 'Chapter 1')]);
    const { hook } = mount(api);
    await settle();
    const first = hook.current.project;
    await act(async () => hook.current.refresh());
    expect(hook.current.project).toEqual(first);
  });

  // Ported from 'a read that never answers stays busy': such a read used to hold every automatic read back for good (breaker B2); it now
  // counts as failed after its limit, and the poll goes on.
  it('a read still unanswered after LIVE_TRACKS_TIMEOUT_MS is treated as failed and the poll resumes', async () => {
    vi.useFakeTimers();
    const { api, pending } = heldHost();
    const { hook, notify } = mount(api);
    await settle();
    await act(async () => pending[0].resolve(answer([track(0, 'Chapter 1')])));
    // The next poll's read never answers.
    await act(async () => vi.advanceTimersByTime(LIVE_TRACKS_POLL_MS));
    expect(pending).toHaveLength(2);
    // Within its limit the timer and focus wait for it, and the Refresh button does not spin for it.
    await act(async () => vi.advanceTimersByTime(LIVE_TRACKS_POLL_MS));
    await act(async () => window.dispatchEvent(new Event('focus')));
    expect(pending).toHaveLength(2);
    expect(hook.current.busy).toBe(true);
    expect(hook.current.refreshing).toBe(false);
    expect(hook.current.stale).toBe(false);
    // Past its limit it is a failure: stale, busy no more, one toast.
    await act(async () => vi.advanceTimersByTime(LIVE_TRACKS_TIMEOUT_MS - LIVE_TRACKS_POLL_MS));
    expect(hook.current.stale).toBe(true);
    expect(hook.current.busy).toBe(false);
    expect(notify).toHaveBeenCalledTimes(1);
    // The poll resumes.
    await act(async () => vi.advanceTimersByTime(LIVE_TRACKS_POLL_MS));
    expect(pending).toHaveLength(3);
    await act(async () => pending[2].resolve(answer([track(0, 'Chapter 1'), track(1, 'Added')])));
    expect(hook.current.stale).toBe(false);
    // The read that went quiet answering at last changes nothing.
    await act(async () => pending[1].resolve(answer([])));
    expect(hook.current.project?.tracks.map((t) => t.name)).toEqual(['Chapter 1', 'Added']);
  });

  it('joining while a read is in flight sends nothing more, and reads when none is', async () => {
    const { api, pending } = heldHost();
    const { hook } = mount(api);
    await settle();
    await act(async () => {
      hook.current.join();
      hook.current.join();
    });
    expect(pending).toHaveLength(1);
    await act(async () => pending[0].resolve(answer([track(0, 'Chapter 1')])));
    await act(async () => hook.current.join());
    expect(pending).toHaveLength(2);
  });

  it('an answer after the panel closed is dropped', async () => {
    const { api, pending } = heldHost();
    const { hook, unmount, notify } = mount(api);
    await settle();
    const before = hook.current;
    unmount();
    await act(async () => pending[0].reject(new Error('REAPER did not answer in time.')));
    expect(hook.current).toBe(before);
    expect(notify).not.toHaveBeenCalled();
  });

  it('disabled, it never reads', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const api = createMockApi();
    api.tracksLive = vi.fn(async () => answer([]));
    const { hook } = mount(api, { enabled: false });
    await settle();
    await act(async () => vi.advanceTimersByTime(LIVE_TRACKS_POLL_MS * 2));
    await act(async () => window.dispatchEvent(new Event('focus')));
    await act(async () => hook.current.refresh());
    expect(api.tracksLive).not.toHaveBeenCalled();
    expect(hook.current.project).toBeUndefined();
  });
});
