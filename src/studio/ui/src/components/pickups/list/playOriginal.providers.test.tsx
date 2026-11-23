// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DawCapabilities, DawResult } from '../../../api/contracts/daw';
import type { PickupItem } from '../../../api/contracts/pickups';
import type { TrackItem } from '../../../api/contracts/tracks';
import { ApiProvider } from '../../../api/ApiContext';
import { createMockApi } from '../../../api/mockApi';
import { DAW_SETUPS } from '../../../fixtures/daw';
import { createMockDawClient } from '../../../ports/daw';
import type { DawClient } from '../../../ports/index';
import { overlay } from '../../../overlay/overlayService';
import { PLAY_DEADLINE_MS } from '../../engine/ShowInDaw';
import { PortOverrides } from '../../../ports/usePort';
import { ProjectTrackProviders } from '../../chapterTracks/ChapterTrackState';
import { usePlayOriginal } from './usePlayOriginal';

// The Pickups list's Play original goes through the playback providers (playback/providers.ts): the DAW's transport first, the app's
// range player when the DAW cannot play now or refuses, nothing while the DAW records.

const ITEM: TrackItem = {
  guid: 'g',
  position: 0,
  length: 100,
  name: 'n',
  sourceKind: 'WAVE',
  sourceFile: 'a.wav',
  sourceAvailable: true,
  supported: true,
  takeGuid: 't',
  sourceStart: 0,
  playRate: 1,
};
const pickup = (at: number | null, time: number | null = 20): PickupItem => ({
  id: 'p1',
  chapterId: 'chapter-1',
  paragraphId: null,
  paragraph: null,
  time,
  at,
  type: 'misread',
  script: 'Garden',
  context: 'Garden',
  source: 'you',
  confidence: null,
  confReason: '',
  included: true,
  done: false,
  waiting: false,
});
const ok: DawResult = { ok: true, changed: false, message: '', undoSteps: 0 };

class FakeAudio extends EventTarget {
  src = '';
  currentTime = 0;
  paused = true;
  play = vi.fn(async () => {
    this.paused = false;
  });
  pause = vi.fn(() => {
    this.paused = true;
  });
}
let audio: FakeAudio;
let transport: ReturnType<typeof vi.fn<(action: string, seconds: number, until?: number, chapterId?: string) => Promise<DawResult>>>;
const refused: string[] = [];
const notices: string[] = [];
const retries: (() => void)[] = [];

function mount(caps: DawCapabilities, client: Partial<DawClient> = {}, hungTracks = false, linked: 'tr' | '{GONE}' | null = 'tr') {
  const api = createMockApi({
    chapterTrackMapList: async () => ({
      documentId: 'd',
      mappings: linked ? [{ trackGuid: linked, chapterId: 'chapter-1', chapterTitle: 'One', confirmedAt: '' }] : [],
    }),
    tracksLive: async () =>
      hungTracks
        ? new Promise<never>(() => {})
        : {
            source: 'saved' as const,
            reason: '' as const,
            message: '',
            readAt: '2026-11-11T00:00:00Z',
            revision: '',
            project: {
              path: 'book.rpp',
              tracks: [{ guid: 'tr', index: 0, name: 'One', color: '', muted: false, soloed: false, depth: 0, isFolder: false, items: [ITEM] }],
            },
          },
    dawTransportSync: (action, seconds, ...until) => transport(action, seconds, ...until),
  });
  const daw: DawClient = { ...createMockDawClient(caps), capabilities: async () => caps, ...client };
  const wrapper = ({ children }: { children: ReactNode }) => (
    <ApiProvider api={api}>
      <PortOverrides clients={{ daw }}>
        <ProjectTrackProviders projectFolder="project" enabled notify={() => {}}>
          {children}
        </ProjectTrackProviders>
      </PortOverrides>
    </ApiProvider>
  );
  const view = renderHook(
    () =>
      usePlayOriginal(
        (text, retry) => {
          refused.push(text);
          if (retry) retries.push(retry);
        },
        (text) => {
          notices.push(text);
        },
      ),
    { wrapper },
  );
  return view;
}
// The tracks come from the shared state, which reads them after the page mounts: a press waits for that read, as a narrator's press does.
async function mountRead(caps: DawCapabilities, client: Partial<DawClient> = {}, hungTracks = false, linked: 'tr' | '{GONE}' | null = 'tr') {
  const view = mount(caps, client, hungTracks, linked);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
  return view;
}
const flush = () =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });

beforeEach(() => {
  vi.useFakeTimers();
  audio = new FakeAudio();
  vi.stubGlobal('Audio', function () {
    return audio;
  });
  transport = vi.fn(async () => ok);
  refused.length = 0;
  notices.length = 0;
  retries.length = 0;
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('a-daw-that-can-play-plays-the-original', () => {
  // Changed from "stops it after the stretch" (#2251 item 22): the DAW is told the stretch and stops itself at its end, so the list sends no stop.
  it('plays the stretch 3 s either side of the pickup in the DAW, which stops itself at the end; the app stays silent', async () => {
    const { result } = await mountRead(DAW_SETUPS.reaper);
    await act(() => result.current.play(pickup(15)));
    expect(transport).toHaveBeenCalledWith('playRange', 12, 18, 'chapter-1');
    expect(audio.play).not.toHaveBeenCalled();
    expect(result.current.playingId).toBe('p1');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(6500);
    });
    expect(transport).toHaveBeenCalledTimes(1);
    expect(result.current.playingId).toBeNull();
  });
  // #3366 (qa B1): the DAW's play needs only the pickup's place, so a tracks read that has not answered holds nothing up.
  it('starts the DAW play without waiting for the tracks read', async () => {
    const { result } = await mountRead(DAW_SETUPS.reaper, {}, true);
    await act(() => result.current.play(pickup(15)));
    expect(transport).toHaveBeenCalledWith('playRange', 12, 18, 'chapter-1');
  });
  // #4076, owner rule on #4043: no read of the DAW's capabilities stands between the click and the play call.
  it('plays in the DAW at once while its capabilities have not answered, and never at all', async () => {
    const { result } = await mountRead(DAW_SETUPS.reaper, { capabilities: () => new Promise<never>(() => {}) });
    await act(() => result.current.play(pickup(15)));
    expect(transport).toHaveBeenCalledWith('playRange', 12, 18, 'chapter-1');
    expect(audio.play).not.toHaveBeenCalled();
    expect(notices).toEqual([]);
    expect(refused).toEqual([]);
  });
  it('plays the original in the app, saying why, with no Retry (it plays), when the DAW, not yet heard, refuses', async () => {
    transport = vi.fn(async () => ({ ...ok, ok: false, message: 'REAPER does not have this book open.', refused: 'REAPER does not have this book open.' }));
    const { result } = await mountRead(DAW_SETUPS.reaper, { capabilities: () => new Promise<never>(() => {}) });
    await act(() => result.current.play(pickup(15)));
    await flush();
    expect(audio.play).toHaveBeenCalled();
    expect(notices).toEqual(['REAPER does not have this book open. Played in the app instead.']);
    expect(retries).toEqual([]);
  });
  it('opens its sentences with a capital while the DAW has no name yet', async () => {
    transport = vi.fn(async () => {
      throw new Error('bridge down');
    });
    const { result } = await mountRead(DAW_SETUPS.reaper, { capabilities: () => new Promise<never>(() => {}) });
    await act(() => result.current.play(pickup(15)));
    await flush();
    expect(notices[0]).toMatch(/^The DAW was not asked: bridge down/);
  });
  it('offers Retry, which asks the DAW again, when nothing played', async () => {
    transport = vi.fn(async () => ({ ...ok, ok: false, message: 'REAPER does not have this book open.', refused: 'REAPER does not have this book open.' }));
    // The tracks never read: the app has no recording to play, so the refusal is the end.
    const { result } = await mountRead(DAW_SETUPS.reaper, { capabilities: () => new Promise<never>(() => {}) }, true);
    await act(() => result.current.play(pickup(15)));
    await flush();
    expect(audio.play).not.toHaveBeenCalled();
    expect(refused.join(' ')).toContain('REAPER does not have this book open.');
    expect(retries).toHaveLength(1);
    transport = vi.fn(async () => ok);
    await act(async () => retries.at(-1)!());
    expect(transport).toHaveBeenCalledWith('playRange', 12, 18, 'chapter-1');
  });
  it('a Retry offered for an older press plays nothing once a newer one was made, and none plays after the list was left', async () => {
    transport = vi.fn(async () => ({ ...ok, ok: false, message: 'refused', refused: 'refused' }));
    const { result, unmount } = await mountRead(DAW_SETUPS.reaper, {}, true);
    await act(() => result.current.play(pickup(15)));
    await flush();
    const first = retries.at(-1)!;
    await act(() => result.current.play({ ...pickup(20), id: 'p2' }));
    await flush();
    transport.mockClear();
    await act(async () => first());
    expect(transport).not.toHaveBeenCalled();
    const last = retries.at(-1)!;
    unmount();
    transport.mockClear();
    await act(async () => last());
    expect(transport).not.toHaveBeenCalled();
  });
  it('a playRange that never answers hands the line to the app after the deadline, saying the DAW did not answer', async () => {
    transport = vi.fn(() => new Promise<DawResult>(() => {}));
    const { result } = await mountRead(DAW_SETUPS.reaper);
    act(() => void result.current.play(pickup(15)));
    // While the DAW is asked the line's button is busy, never nothing.
    expect(result.current.pendingId).toBe('p1');
    expect(audio.play).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(PLAY_DEADLINE_MS);
    });
    expect(audio.play).toHaveBeenCalled();
    expect(result.current.pendingId).toBeNull();
    expect(notices).toEqual(['REAPER did not answer in time. Played in the app instead.']);
  });
  it('a playRange answered after the deadline is stopped, not left playing beside the app', async () => {
    let answer: (value: DawResult) => void = () => {};
    transport = vi.fn((action: string) => (action === 'playRange' ? new Promise<DawResult>((resolve) => (answer = resolve)) : Promise.resolve(ok)));
    const { result } = await mountRead(DAW_SETUPS.reaper);
    act(() => void result.current.play(pickup(15)));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(PLAY_DEADLINE_MS);
    });
    expect(transport).not.toHaveBeenCalledWith('stop', 0);
    await act(async () => {
      answer(ok);
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(transport).toHaveBeenCalledWith('stop', 0);
  });
  // #3366 (qa B2), now that a press does not wait for the capabilities: a list gone while the DAW's play is in flight starts no timer and stops the DAW it started.
  it('stops the DAW play it started when the list unmounts while the DAW is answering', async () => {
    let answer: (value: DawResult) => void = () => {};
    transport = vi.fn((action: string) => (action === 'playRange' ? new Promise<DawResult>((resolve) => (answer = resolve)) : Promise.resolve(ok)));
    const { result, unmount } = await mountRead(DAW_SETUPS.reaper);
    let pressed: Promise<void> = Promise.resolve();
    act(() => {
      pressed = result.current.play(pickup(15));
    });
    unmount();
    answer(ok);
    await act(async () => {
      await pressed;
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(transport).toHaveBeenCalledWith('stop', 0);
  });
  it('a press on another line, or Stop, withdraws the Retry offered before it', async () => {
    const dismiss = vi.spyOn(overlay, 'dismissTopic');
    transport = vi.fn(async () => ({ ...ok, ok: false, message: 'refused', refused: 'refused' }));
    const { result } = await mountRead(DAW_SETUPS['reaper-off'], {}, false, null);
    await act(() => result.current.play(pickup(15)));
    await flush();
    dismiss.mockClear();
    await act(() => result.current.play({ ...pickup(20), id: 'p2' }));
    expect(dismiss).toHaveBeenCalledWith('pickups-original-retry');
  });
  it('a second press stops the DAW', async () => {
    const { result } = await mountRead(DAW_SETUPS.reaper);
    await act(() => result.current.play(pickup(15)));
    await act(() => result.current.play(pickup(15)));
    expect(transport).toHaveBeenLastCalledWith('stop', 0);
    expect(result.current.playingId).toBeNull();
  });
});

describe('why-the-original-cannot-be-played', () => {
  // #3394: one sentence for every case hid whether the link or the recording was the problem.
  it('says the chapter is not linked when it has no link and the DAW cannot play', async () => {
    const { result } = await mountRead(DAW_SETUPS['reaper-off'], {}, false, null);
    await act(() => result.current.play(pickup(15)));
    await flush();
    expect(audio.play).not.toHaveBeenCalled();
    expect(refused.join(' ')).toContain('This chapter is not linked to a track');
  });
  it('says the linked track is no longer in the project when the link points at a track the project lacks', async () => {
    const { result } = await mountRead(DAW_SETUPS['reaper-off'], {}, false, '{GONE}');
    await act(() => result.current.play(pickup(15)));
    await flush();
    expect(refused.join(' ')).toContain('linked track is no longer in the project');
  });
  // The owner (#3394, 2026-11-16): Hear the original is off when the chapter has no link, with the reason, not a button that plays beside "Not linked".
  it('is off, with the reason, for a chapter that has no link once the links were read', async () => {
    const { result } = await mountRead(DAW_SETUPS['reaper-off'], {}, false, null);
    expect(result.current.unavailable(pickup(15))).toContain('This chapter is not linked to a track');
  });
  // qa-breaker (#3568, B2): the button of the line that is playing is Stop; unlinking its chapter meanwhile must not make it a disabled Stop.
  it('keeps Stop on for the line that is playing', async () => {
    const { result } = await mountRead(DAW_SETUPS.reaper, {}, false, null);
    expect(result.current.unavailable(pickup(15))).toContain('not linked to a track');
    await act(() => result.current.play(pickup(15)));
    expect(result.current.playingId).toBe('p1');
    expect(result.current.unavailable(pickup(15))).toBeUndefined();
  });
  it('stays on for a linked chapter, and before the links were first read', async () => {
    const { result } = await mountRead(DAW_SETUPS['reaper-off'], {}, false, 'tr');
    expect(result.current.unavailable(pickup(15))).toBeUndefined();
    const unread = mount(DAW_SETUPS['reaper-off'], {}, true, null);
    expect(unread.result.current.unavailable(pickup(15))).toBeUndefined();
  });
});

describe('a-second-press-while-the-first-is-in-flight', () => {
  // #3394 (qa B4): the first play was still being started in the DAW when the second press came; its late answer sent a stop that undid the second.
  it('leaves the DAW playing: no stop follows the second playRange', async () => {
    const releases: Array<() => void> = [];
    transport = vi.fn(
      (action: string) =>
        new Promise<DawResult>((resolve) => {
          releases.push(() => resolve(ok));
          void action;
        }),
    );
    const { result } = await mountRead(DAW_SETUPS.reaper);
    let first: Promise<void> = Promise.resolve();
    let second: Promise<void> = Promise.resolve();
    act(() => {
      first = result.current.play(pickup(15));
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    act(() => {
      second = result.current.play(pickup(15));
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    releases.forEach((release) => release());
    await act(async () => {
      await Promise.all([first, second]);
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(transport.mock.calls.map((call) => call[0])).toEqual(['playRange', 'playRange']);
  });
});

describe('a-refused-second-press-while-the-first-is-in-flight', () => {
  // #3402 (qa B1): the second press fell back to the app while the first was still being started in the DAW; the first's late success played on beside it.
  it('stops the first DAW play when the second is refused and the app plays instead', async () => {
    const answers: Array<(result: DawResult) => void> = [];
    transport = vi.fn((action: string) =>
      action === 'stop'
        ? Promise.resolve(ok)
        : new Promise<DawResult>((resolve) => {
            answers.push(resolve);
          }),
    );
    const { result } = await mountRead(DAW_SETUPS.reaper);
    let first: Promise<void> = Promise.resolve();
    let second: Promise<void> = Promise.resolve();
    act(() => {
      first = result.current.play(pickup(15));
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    act(() => {
      second = result.current.play(pickup(15));
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    answers[1]({ ...ok, ok: false, message: 'REAPER does not have this book open.', refused: 'REAPER does not have this book open.' });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    answers[0](ok);
    await act(async () => {
      await Promise.all([first, second]);
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(transport.mock.calls.map((call) => call[0])).toEqual(['playRange', 'playRange', 'stop']);
  });
});

describe('the-app-plays-when-the-daw-cannot', () => {
  it('falls back to the app with a notice when the DAW refuses', async () => {
    transport = vi.fn(async () => ({ ...ok, ok: false, message: 'REAPER does not have this book open.', refused: 'REAPER does not have this book open.' }));
    const { result } = await mountRead(DAW_SETUPS.reaper);
    await act(() => result.current.play(pickup(15)));
    await flush();
    expect(audio.play).toHaveBeenCalled();
    expect(notices).toEqual(['REAPER does not have this book open. Played in the app instead.']);
    expect(refused).toEqual([]);
  });
  it('falls back with the capability sentence when the DAW is not running, asking it nothing', async () => {
    const { result } = await mountRead(DAW_SETUPS['reaper-off']);
    await act(() => result.current.play(pickup(15)));
    await flush();
    expect(transport).not.toHaveBeenCalled();
    expect(audio.play).toHaveBeenCalled();
    expect(notices.join(' ')).toContain('Played in the app instead.');
  });
  it('a pickup with no project second plays in the app and says why', async () => {
    const { result } = await mountRead(DAW_SETUPS.reaper);
    await act(() => result.current.play(pickup(null, 20)));
    await flush();
    expect(transport).not.toHaveBeenCalled();
    expect(audio.play).toHaveBeenCalled();
    expect(notices).toEqual(["This line has no place in REAPER's project. Played in the app instead."]);
  });
  it.each([
    ['the built-in recorder', DAW_SETUPS.builtin],
    ['Audacity', DAW_SETUPS.audacity],
  ])('plays in the app with %s, with no notice', async (_, caps) => {
    const { result } = await mountRead(caps);
    await act(() => result.current.play(pickup(15)));
    await flush();
    expect(transport).not.toHaveBeenCalled();
    expect(audio.play).toHaveBeenCalled();
    expect(notices).toEqual([]);
  });
  it('a capabilities read that fails plays in the app and says so', async () => {
    const { result } = await mountRead(DAW_SETUPS.reaper, { capabilities: () => Promise.reject(new Error('gone')) });
    await act(() => result.current.play(pickup(15)));
    await flush();
    expect(audio.play).toHaveBeenCalled();
    expect(notices.join(' ')).toMatch(/could not ask the DAW.*Played in the app instead\./);
  });
});

describe('a-recording-daw-keeps-the-room-quiet', () => {
  it('plays nothing, in the DAW or the app, and says why', async () => {
    transport = vi.fn(async () => ({ ...ok, ok: false, message: 'REAPER is recording. Stop recording first.', refused: 'REAPER is recording.' }));
    const { result } = await mountRead(DAW_SETUPS.reaper, {
      projectState: async () => ({ savedAt: null, unsavedChanges: false, playState: 'recording', playPosition: 3 }),
    });
    await act(() => result.current.play(pickup(15)));
    await flush();
    expect(audio.play).not.toHaveBeenCalled();
    expect(refused).toEqual(['REAPER is recording, so nothing plays. Stop recording first.']);
    expect(result.current.playingId).toBeNull();
  });
});
