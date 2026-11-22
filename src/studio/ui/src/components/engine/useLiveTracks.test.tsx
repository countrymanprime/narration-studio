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
//   REAPER down for a long time               'while REAPER does not answer the timer reads less and less often, up to the cap; coming back, a press and a good answer end it'
//   stale, then answering again                'a good read after a failed one clears the stale mark'
//   rapid double-fire                          'two Refresh presses send two reads and only the newer answer is kept'
//   answers out of order                       'an older read answering after a newer one never replaces it'
//   repeats an event                           'the same answer twice changes nothing the panel draws' (one render's worth: the project is replaced, not merged)
//   never answers                              'a read still unanswered after LIVE_TRACKS_TIMEOUT_MS is treated as failed and the poll resumes'
//   answers late, after its limit              same test: its late answer never replaces the newer read's
//   two readers at once (the dialog opening)   'joining while a read is in flight sends nothing more, and reads when none is'
//   leave mid-action (unmount mid-read)        'an answer after the panel closed is dropped'
//   REAPER reports a revision                  'with a revision the timer reads nothing, and an event with a new revision reads at once'
//   repeats an event (other project, same list) 'an event carrying the revision already shown still reads: REAPER may have another project with the same list'
//   loses an event                             'focus and Refresh still read while a revision is held' (and the host's next change sends its own event)
//   revision no longer known (REAPER gone)     'an event with no revision reads at once and the timer takes over again'
//   event during a read (answers out of order) 'an event during a read reads once more when it ends, hidden or not, and never after the panel is switched off'
//   read fails while a revision is held        'a failed read forgets the revision, so the timer reads again'
//   event while hidden                         'an event while the window is hidden reads nothing; coming back reads'
//   leave (unmount)                            'the subscription ends with the panel'
//   Audacity (disabled)                        'disabled, it never reads'
//   long, RTL and emoji names                  not tested here: the hook passes names through untouched (tracks_read_test.lua and tracks_read_test.go send them)
//   wrong project / wrong version / restart    the host's reasons (other_project, outdated, not_running): tracks_live_test.go; here they are one 'saved' answer
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../api/ApiContext';
import { createMockApi } from '../../api/mockApi';
import type { Track, TracksLive } from '../../api/contracts/tracks';
import {
  LIVE_TRACKS_BACKOFF_MAX_MS,
  LIVE_TRACKS_POLL_MS,
  LIVE_TRACKS_SAVED_POLL_MS,
  LIVE_TRACKS_TIMEOUT_MS,
  TRACKS_READ_TOPIC,
  useLiveTracks,
  type LiveTracks,
} from './useLiveTracks';

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
  revision: '',
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

  // #3595 (qa-breaker, #3586): the host's words are cut in the toast as they are in the pages' sentence, so a huge message cannot fill the window.
  it('cuts a huge host message in the failure toast', async () => {
    const api = createMockApi();
    api.tracksLive = vi.fn(async () => {
      throw new Error('x'.repeat(10_000));
    });
    const { notify } = mount(api);
    await settle();
    const [text] = notify.mock.calls[0];
    expect(text.length).toBeLessThan(260);
    expect(text.endsWith('…')).toBe(true);
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

  it('while REAPER does not answer the timer reads less and less often, up to the cap; coming back, a press and a good answer end it', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const api = createMockApi();
    let answering = false;
    api.tracksLive = vi.fn(async () => {
      if (!answering) throw new Error('REAPER did not answer in time.');
      return answer([track(1, 'Narrator')]);
    });
    const reads = () => vi.mocked(api.tracksLive).mock.calls.length;
    const { hook } = mount(api);
    await settle();
    expect(reads()).toBe(1);
    // The read at mount is the narrator's; each automatic read that fails then doubles the wait: 5 s to the first, 5 s, 10 s, 20 s, 40 s, then the cap.
    const waits = [5_000, 5_000, 10_000, 20_000, 40_000, LIVE_TRACKS_BACKOFF_MAX_MS, LIVE_TRACKS_BACKOFF_MAX_MS];
    let expected = 1;
    for (const wait of waits) {
      await act(async () => vi.advanceTimersByTime(wait - LIVE_TRACKS_POLL_MS)); // the timer ticks inside the wait: no read
      expect(reads()).toBe(expected);
      await act(async () => vi.advanceTimersByTime(LIVE_TRACKS_POLL_MS));
      expected += 1;
      expect(reads()).toBe(expected);
    }
    // Coming back to the window reads at once, whatever the wait; a good answer then returns the timer to its pace.
    answering = true;
    await act(async () => window.dispatchEvent(new Event('focus')));
    expect(reads()).toBe(expected + 1);
    expect(hook.current.error).toBe('');
    await act(async () => vi.advanceTimersByTime(LIVE_TRACKS_POLL_MS));
    expect(reads()).toBe(expected + 2);
  });

  it("failed presses do not lengthen the timer's wait, and a clock set back does not freeze it", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const api = createMockApi();
    let answering = false;
    api.tracksLive = vi.fn(async () => {
      if (!answering) throw new Error('REAPER did not answer in time.');
      return answer([track(1, 'Narrator')]);
    });
    const reads = () => vi.mocked(api.tracksLive).mock.calls.length;
    const { hook } = mount(api);
    await settle();
    for (let press = 0; press < 5; press++) await act(async () => hook.current.refresh()); // the narrator presses Retry while REAPER is down
    const before = reads();
    answering = true; // REAPER is back, and the system clock was set back an hour
    vi.setSystemTime(Date.now() - 3_600_000);
    await act(async () => vi.advanceTimersByTime(LIVE_TRACKS_POLL_MS));
    expect(reads()).toBe(before + 1);
    expect(hook.current.error).toBe('');
  });

  it('a press and a new read key read at once during the backoff', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const api = createMockApi();
    api.tracksLive = vi.fn(async () => {
      throw new Error('REAPER did not answer in time.');
    });
    const { hook, rerender } = mount(api);
    await settle();
    await act(async () => vi.advanceTimersByTime(LIVE_TRACKS_POLL_MS)); // a second failure: the wait is now 10 s
    const before = vi.mocked(api.tracksLive).mock.calls.length;
    await act(async () => hook.current.refresh());
    rerender({ readKey: 'checked again' });
    await settle();
    expect(vi.mocked(api.tracksLive).mock.calls.length).toBe(before + 2);
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

  // #3880: REAPER's heartbeat says when its track list changed, so a list read with a revision is read again on the event, not every 5 s.
  describe('daw_tracks_changed', () => {
    const A = 'aaaaaaaaaaaaaaaa';
    const B = 'bbbbbbbbbbbbbbbb';
    /** A host that answers `revision.now` and whose event the test sends. */
    function eventHost(first: string) {
      const api = createMockApi();
      const revision = { now: first };
      const subs = new Set<(change: { revision: string }) => void>();
      api.tracksLive = vi.fn(async () => answer([track(0, 'Chapter 1')], { revision: revision.now }));
      api.subscribeTracksChanged = (on) => {
        subs.add(on);
        return () => subs.delete(on);
      };
      const send = (next: string) => act(async () => subs.forEach((on) => on({ revision: next })));
      const reads = () => vi.mocked(api.tracksLive).mock.calls.length;
      return { api, revision, subs, send, reads };
    }

    it('the mock: a track added in REAPER (emoji and right-to-left in its name) shows without a timer, focus or Refresh', async () => {
      const api = createMockApi();
      const { hook } = mount(api);
      await settle();
      const before = hook.current.project?.tracks.length ?? 0;
      await act(async () => window.__NARRATION_MOCK_DAW__?.addTrackInDaw('Chapter 9 – הים 🌊'));
      expect(hook.current.project?.tracks).toHaveLength(before + 1);
      expect(hook.current.project?.tracks.at(-1)?.name).toBe('Chapter 9 – הים 🌊');
    });

    it('with a revision the timer reads nothing for 25 s, and an event with a new revision reads at once', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      const { api, revision, send, reads } = eventHost(A);
      mount(api);
      await settle();
      expect(reads()).toBe(1);
      await act(async () => vi.advanceTimersByTime(LIVE_TRACKS_POLL_MS * 5));
      expect(reads()).toBe(1);
      revision.now = B;
      await send(B);
      expect(reads()).toBe(2);
      await act(async () => vi.advanceTimersByTime(LIVE_TRACKS_POLL_MS * 5));
      expect(reads()).toBe(2);
    });

    // A save in REAPER changes the items, colour, mute and solo the list shows (read from the .rpp) and sends no daw_tracks_changed.
    it('with a revision the timer still reads every 30 s, so a save in REAPER shows without focus or Refresh', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      const { api, reads } = eventHost(A);
      mount(api);
      await settle();
      expect(reads()).toBe(1);
      await act(async () => vi.advanceTimersByTime(LIVE_TRACKS_SAVED_POLL_MS));
      expect(reads()).toBe(2);
      await act(async () => vi.advanceTimersByTime(LIVE_TRACKS_SAVED_POLL_MS));
      expect(reads()).toBe(3);
    });

    it('an event carrying the revision already shown still reads: REAPER may have another project with the same list', async () => {
      const { api, send, reads } = eventHost(A);
      mount(api);
      await settle();
      await send(A);
      expect(reads()).toBe(2);
    });

    it('focus and Refresh still read while a revision is held', async () => {
      const { api, reads } = eventHost(A);
      const { hook } = mount(api);
      await settle();
      await act(async () => window.dispatchEvent(new Event('focus')));
      await act(async () => hook.current.refresh());
      expect(reads()).toBe(3);
    });

    it('an event with no revision reads at once and the timer takes over again', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      const { api, revision, send, reads } = eventHost(A);
      mount(api);
      await settle();
      revision.now = '';
      await send('');
      expect(reads()).toBe(2);
      await act(async () => vi.advanceTimersByTime(LIVE_TRACKS_POLL_MS));
      expect(reads()).toBe(3);
      // The revision is back: one read for the event, then the timer is quiet again.
      revision.now = B;
      await send(B);
      expect(reads()).toBe(4);
      await act(async () => vi.advanceTimersByTime(LIVE_TRACKS_POLL_MS * 3));
      expect(reads()).toBe(4);
    });

    it('an event during a read reads once more when it ends, hidden or not, and never after the panel is switched off', async () => {
      const { api, pending } = heldHost();
      const subs = new Set<(change: { revision: string }) => void>();
      api.subscribeTracksChanged = (on) => {
        subs.add(on);
        return () => subs.delete(on);
      };
      const send = (next: string) => act(async () => subs.forEach((on) => on({ revision: next })));
      const { rerender } = mount(api);
      await settle();
      // The first read left before the change and answers the old list: read again.
      await send(B);
      await send(B);
      expect(pending).toHaveLength(1);
      await act(async () => pending[0].resolve(answer([], { revision: A })));
      expect(pending).toHaveLength(2);
      // The window is hidden and shown again inside one read: the event that arrived meanwhile is not lost.
      await act(async () => setVisibility('hidden'));
      await send(A);
      await act(async () => setVisibility('visible'));
      await act(async () => pending[1].resolve(answer([], { revision: B })));
      expect(pending).toHaveLength(3);
      // Switched off (an Audacity project) during a read that an event arrived in: nothing reads after it.
      await send(B);
      rerender({ enabled: false });
      await act(async () => pending[2].resolve(answer([], { revision: B })));
      expect(pending).toHaveLength(3);
    });

    // #3880 slice 2: the Booth slows its own idle read while the list follows REAPER's revision.
    it('`following` is true while the last read carried a revision, and false for none and after a failed read', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      const held = eventHost(A);
      const withRevision = mount(held.api);
      await settle();
      expect(withRevision.hook.current.following).toBe(true);
      vi.mocked(held.api.tracksLive).mockRejectedValueOnce(new Error('REAPER did not answer in time.'));
      await held.send(B);
      expect(withRevision.hook.current.following).toBe(false);
      cleanup();
      const older = mount(eventHost('').api);
      await settle();
      expect(older.hook.current.following).toBe(false);
    });

    it('`following` is not claimed again when the live read is switched on again, before it has answered', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      const { api } = eventHost(A);
      const view = mount(api);
      await settle();
      expect(view.hook.current.following).toBe(true);
      await act(async () => view.rerender({ enabled: false }));
      expect(view.hook.current.following).toBe(false);
    });

    it('a failed read forgets the revision, so the timer reads again', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      const { api, send, reads } = eventHost(A);
      mount(api);
      await settle();
      vi.mocked(api.tracksLive).mockRejectedValueOnce(new Error('REAPER did not answer in time.'));
      await send(B);
      expect(reads()).toBe(2);
      await act(async () => vi.advanceTimersByTime(LIVE_TRACKS_POLL_MS));
      expect(reads()).toBe(3);
    });

    it('an event while the window is hidden reads nothing; coming back reads', async () => {
      const { api, send, reads } = eventHost(A);
      mount(api);
      await settle();
      await act(async () => setVisibility('hidden'));
      await send(B);
      expect(reads()).toBe(1);
      await act(async () => setVisibility('visible'));
      expect(reads()).toBe(2);
    });

    it('the subscription ends with the panel', async () => {
      const { api, subs } = eventHost(A);
      const { unmount } = mount(api);
      await settle();
      expect(subs.size).toBe(1);
      unmount();
      expect(subs.size).toBe(0);
    });
  });
});
