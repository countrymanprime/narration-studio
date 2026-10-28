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
import { PortOverrides } from '../../../ports/usePort';
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
let transport: ReturnType<typeof vi.fn<(action: string, seconds: number, until?: number) => Promise<DawResult>>>;
const refused: string[] = [];
const notices: string[] = [];

function mount(caps: DawCapabilities, client: Partial<DawClient> = {}) {
  const api = createMockApi({
    chapterTrackMapList: async () => ({ documentId: 'd', mappings: [{ trackGuid: 'tr', chapterId: 'chapter-1', chapterTitle: 'One', confirmedAt: '' }] }),
    tracksList: async () => ({
      path: 'book.rpp',
      tracks: [{ guid: 'tr', index: 0, name: 'One', color: '', muted: false, soloed: false, depth: 0, isFolder: false, items: [ITEM] }],
    }),
    dawTransportSync: (action, seconds, ...until) => transport(action, seconds, ...until),
  });
  const daw: DawClient = { ...createMockDawClient(caps), capabilities: async () => caps, ...client };
  const wrapper = ({ children }: { children: ReactNode }) => (
    <ApiProvider api={api}>
      <PortOverrides clients={{ daw }}>{children}</PortOverrides>
    </ApiProvider>
  );
  return renderHook(
    () =>
      usePlayOriginal(
        (text) => refused.push(text),
        (text) => notices.push(text),
      ),
    { wrapper },
  );
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
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('a-daw-that-can-play-plays-the-original', () => {
  // Changed from "stops it after the stretch" (#2251 item 22): the DAW is told the stretch and stops itself at its end, so the list sends no stop.
  it('plays the stretch 3 s either side of the pickup in the DAW, which stops itself at the end; the app stays silent', async () => {
    const { result } = mount(DAW_SETUPS.reaper);
    await act(() => result.current.play(pickup(15)));
    expect(transport).toHaveBeenCalledWith('playRange', 12, 18);
    expect(audio.play).not.toHaveBeenCalled();
    expect(result.current.playingId).toBe('p1');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(6500);
    });
    expect(transport).toHaveBeenCalledTimes(1);
    expect(result.current.playingId).toBeNull();
  });
  it('a second press stops the DAW', async () => {
    const { result } = mount(DAW_SETUPS.reaper);
    await act(() => result.current.play(pickup(15)));
    await act(() => result.current.play(pickup(15)));
    expect(transport).toHaveBeenLastCalledWith('stop', 0);
    expect(result.current.playingId).toBeNull();
  });
});

describe('the-app-plays-when-the-daw-cannot', () => {
  it('falls back to the app with a notice when the DAW refuses', async () => {
    transport = vi.fn(async () => ({ ...ok, ok: false, message: 'REAPER does not have this book open.', refused: 'REAPER does not have this book open.' }));
    const { result } = mount(DAW_SETUPS.reaper);
    await act(() => result.current.play(pickup(15)));
    await flush();
    expect(audio.play).toHaveBeenCalled();
    expect(notices).toEqual(['REAPER does not have this book open. Played in the app instead.']);
    expect(refused).toEqual([]);
  });
  it('falls back with the capability sentence when the DAW is not running, asking it nothing', async () => {
    const { result } = mount(DAW_SETUPS['reaper-off']);
    await act(() => result.current.play(pickup(15)));
    await flush();
    expect(transport).not.toHaveBeenCalled();
    expect(audio.play).toHaveBeenCalled();
    expect(notices.join(' ')).toContain('Played in the app instead.');
  });
  it('a pickup with no project second plays in the app and says why', async () => {
    const { result } = mount(DAW_SETUPS.reaper);
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
    const { result } = mount(caps);
    await act(() => result.current.play(pickup(15)));
    await flush();
    expect(transport).not.toHaveBeenCalled();
    expect(audio.play).toHaveBeenCalled();
    expect(notices).toEqual([]);
  });
  it('a capabilities read that fails plays in the app and says so', async () => {
    const { result } = mount(DAW_SETUPS.reaper, { capabilities: () => Promise.reject(new Error('gone')) });
    await act(() => result.current.play(pickup(15)));
    await flush();
    expect(audio.play).toHaveBeenCalled();
    expect(notices.join(' ')).toMatch(/could not ask the DAW.*Played in the app instead\./);
  });
});

describe('a-recording-daw-keeps-the-room-quiet', () => {
  it('plays nothing, in the DAW or the app, and says why', async () => {
    transport = vi.fn(async () => ({ ...ok, ok: false, message: 'REAPER is recording. Stop recording first.', refused: 'REAPER is recording.' }));
    const { result } = mount(DAW_SETUPS.reaper, {
      projectState: async () => ({ savedAt: null, unsavedChanges: false, playState: 'recording', playPosition: 3 }),
    });
    await act(() => result.current.play(pickup(15)));
    await flush();
    expect(audio.play).not.toHaveBeenCalled();
    expect(refused).toEqual(['REAPER is recording, so nothing plays. Stop recording first.']);
    expect(result.current.playingId).toBeNull();
  });
});
