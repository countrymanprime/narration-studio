// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DawCapabilities, DawResult } from '../../../api/contracts/daw';
import { ApiProvider } from '../../../api/ApiContext';
import { createMockApi } from '../../../api/mockApi';
import { DAW_SETUPS } from '../../../fixtures/daw';
import { createMockDawClient } from '../../../ports/daw';
import type { DawClient } from '../../../ports/index';
import { PortOverrides } from '../../../ports/usePort';
import { previewPlayOwner } from '../../../playback/dawPlayOwner';
import { READ_FAILED, type DawRead } from '../../../playback/providers';
import { PLAY_DEADLINE_MS } from '../../engine/ShowInDaw';
import type { LinePassage, LineTake } from './types';
import { useTakeAudition } from './useTakeAudition';

const FELL_BACK = 'Played in the app instead.';

// #2251 item 32, as the owner revised it: a take plays through the DAW's preview when it is ready, and through the app's player with a notice
// when it is not or refuses; a DAW that is recording keeps the room quiet.

const take = (id: string, sourceLength = 4): LineTake => ({
  id,
  label: id,
  active: false,
  usable: true,
  sourceFile: `/book/${id}.wav`,
  sourceStart: 2,
  sourceLength,
});
const LINE: LinePassage = { id: 'p1', chapterId: 'chapter-1', firstToken: 0, lastToken: 4, script: 'Garden', takes: [take('take-1'), take('take-2', 90)] };

class FakeAudio extends EventTarget {
  src = '';
  currentTime = 0;
  play = vi.fn().mockResolvedValue(undefined);
  pause = vi.fn();
}
let audio: FakeAudio;
const notices: string[] = [];
const retries: ((() => void) | undefined)[] = [];
const stopChapter = vi.fn();
/** The id of a take the passage no longer offers. */
let hidden: string | null = null;

function mount(caps: DawCapabilities | null, client: Partial<DawClient> = {}, read?: DawRead) {
  const daw: DawClient = { ...createMockDawClient(DAW_SETUPS.reaper), ...client };
  const wrapper = ({ children }: { children: ReactNode }) => (
    <ApiProvider api={createMockApi()}>
      <PortOverrides clients={{ daw }}>{children}</PortOverrides>
    </ApiProvider>
  );
  return renderHook(
    () =>
      useTakeAudition({
        caps,
        ...(read ? { read } : {}),
        mediaUrl: (f) => f,
        passageOf: (t) => (LINE.takes.some((x) => x.id === t.id && x.id !== hidden) ? { ...LINE, takes: LINE.takes.filter((x) => x.id !== hidden) } : null),
        stopChapter,
        notify: (text, retry) => {
          notices.push(text);
          retries.push(retry);
        },
      }),
    { wrapper },
  );
}

const flush = () =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });

beforeEach(() => {
  previewPlayOwner.forget();
  hidden = null;
  vi.useFakeTimers();
  audio = new FakeAudio();
  vi.stubGlobal('Audio', function () {
    return audio;
  });
  notices.length = 0;
  retries.length = 0;
  stopChapter.mockClear();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('a-linked-daw-plays-the-take', () => {
  it("asks the DAW to preview the take by its line's tokens, keeps the app silent, and shows it playing for its length", async () => {
    const previewTake = vi.fn(async (): Promise<DawResult> => ({ ok: true, changed: false, message: 'Playing.', undoSteps: 0 }));
    const { result } = mount(DAW_SETUPS.reaper, { previewTake });
    act(() => result.current.play(LINE.takes[0]));
    await flush();
    expect(previewTake).toHaveBeenCalledWith('chapter-1', 0, 4, 'take-1');
    expect(audio.play).not.toHaveBeenCalled();
    expect(stopChapter).toHaveBeenCalled();
    expect(result.current.playingId).toBe('take-1');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4000);
    });
    expect(result.current.playingId).toBeNull();
  });
  it('shows a long take playing for the minute the preview plays', async () => {
    const { result } = mount(DAW_SETUPS.reaper, { previewTake: async () => ({ ok: true, changed: false, message: '', undoSteps: 0 }) });
    act(() => result.current.play(LINE.takes[1]));
    await flush();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(59_000);
    });
    expect(result.current.playingId).toBe('take-2');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });
    expect(result.current.playingId).toBeNull();
  });
  it('a second press stops the preview in the DAW', async () => {
    const stopPreview = vi.fn(async (): Promise<DawResult> => ({ ok: true, changed: false, message: '', undoSteps: 0 }));
    const { result } = mount(DAW_SETUPS.reaper, { previewTake: async () => ({ ok: true, changed: false, message: '', undoSteps: 0 }), stopPreview });
    act(() => result.current.play(LINE.takes[0]));
    await flush();
    act(() => result.current.play(LINE.takes[0]));
    await flush();
    expect(stopPreview).toHaveBeenCalledTimes(1);
    expect(result.current.playingId).toBeNull();
  });
  it.each([
    [
      'refuses',
      async (): Promise<DawResult> => ({ ok: false, changed: false, message: 'REAPER is recording.', undoSteps: 0, refused: 'REAPER is recording.' }),
      /REAPER is recording\./,
    ],
    ['throws', () => Promise.reject(new Error('timed out')), /REAPER was not asked: timed out/],
  ])('plays the take in the app and says why when the DAW %s', async (_, previewTake, why) => {
    const { result } = mount(DAW_SETUPS.reaper, { previewTake });
    act(() => result.current.play(LINE.takes[0]));
    await flush();
    expect(audio.play).toHaveBeenCalled();
    expect(result.current.playingId).toBe('take-1');
    expect(notices.join(' ')).toMatch(why);
    expect(notices.join(' ')).toContain(FELL_BACK);
  });
  it('plays the take in the app while the DAW is not running, with its sentence', async () => {
    const previewTake = vi.fn();
    const { result } = mount(DAW_SETUPS['reaper-off'], { previewTake });
    act(() => result.current.play(LINE.takes[0]));
    await flush();
    expect(previewTake).not.toHaveBeenCalled();
    expect(audio.play).toHaveBeenCalled();
    expect(notices.join(' ')).toContain(DAW_SETUPS['reaper-off'].capabilities.file_preview.message!);
    expect(notices.join(' ')).toContain(FELL_BACK);
  });
  it('a take whose line is gone asks the DAW nothing and plays in the app', async () => {
    const previewTake = vi.fn();
    const { result } = mount(DAW_SETUPS.reaper, { previewTake });
    act(() => result.current.play(take('take-9')));
    await flush();
    expect(previewTake).not.toHaveBeenCalled();
    expect(audio.play).toHaveBeenCalled();
    expect(notices.join(' ')).toMatch(/line is not on the page any more\. Played in the app instead\./);
  });
  it('plays nothing while the DAW records, in the DAW or the app', async () => {
    const { result } = mount(DAW_SETUPS.reaper, {
      previewTake: async () => ({ ok: false, changed: false, message: 'REAPER is recording.', undoSteps: 0, refused: 'REAPER is recording.' }),
      projectState: async () => ({ savedAt: null, unsavedChanges: false, playState: 'recording', playPosition: 3 }),
    });
    act(() => result.current.play(LINE.takes[0]));
    await flush();
    expect(audio.play).not.toHaveBeenCalled();
    expect(result.current.playingId).toBeNull();
    expect(notices.join(' ')).toMatch(/REAPER is recording, so nothing plays/);
  });
  it('an answer that comes after the narrator stopped is ignored', async () => {
    let answer: (r: DawResult) => void = () => {};
    const { result } = mount(DAW_SETUPS.reaper, { previewTake: () => new Promise<DawResult>((resolve) => (answer = resolve)) });
    act(() => result.current.play(LINE.takes[0]));
    act(() => result.current.stop());
    answer({ ok: false, changed: false, message: 'Late.', undoSteps: 0, refused: 'Late.' });
    await flush();
    expect(notices).toEqual([]);
    expect(result.current.playingId).toBeNull();
  });
});

describe('before-the-daw-answers', () => {
  it("a take plays before the DAW's capabilities answer: the DAW is asked at once and no notice says it is checking", async () => {
    const previewTake = vi.fn().mockResolvedValue({ ok: true, changed: false, message: '', undoSteps: 0 });
    const { result } = mount(null, { previewTake });
    act(() => result.current.play(LINE.takes[0]));
    await flush();
    expect(previewTake).toHaveBeenCalledTimes(1);
    expect(audio.play).not.toHaveBeenCalled();
    expect(notices).toEqual([]);
    expect(result.current.playingId).toBe('take-1');
  });
  it('plays the take in the app when the DAW, not yet heard, refuses, and says why without a Retry, which would stop the take that plays', async () => {
    const previewTake = vi.fn().mockResolvedValue({ ok: false, changed: false, message: 'Not linked.', undoSteps: 0, refused: 'Not linked.' });
    const { result } = mount(null, { previewTake });
    act(() => result.current.play(LINE.takes[0]));
    await flush();
    expect(audio.play).toHaveBeenCalled();
    expect(notices).toEqual([`Not linked. ${FELL_BACK}`]);
    expect(result.current.waitingId).toBeNull();
    expect(retries[0]).toBeUndefined();
    expect(result.current.playingId).toBe('take-1');
  });
  it('says why and offers Retry when nothing played at all, and Retry asks the DAW again', async () => {
    const previewTake = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, changed: false, message: 'Recording.', undoSteps: 0, refused: 'Recording.' })
      .mockResolvedValue({ ok: true, changed: false, message: '', undoSteps: 0 });
    const projectState = vi.fn().mockResolvedValue({ playState: 'recording' });
    const { result } = mount(null, { previewTake, projectState });
    act(() => result.current.play(LINE.takes[0]));
    await flush();
    expect(audio.play).not.toHaveBeenCalled();
    expect(previewTake).toHaveBeenCalledTimes(1);
    expect(notices).toHaveLength(1);
    expect(notices[0]).toMatch(/recording/i);
    expect(retries[0]).toBeTypeOf('function');
    // A comparison holds on the take that played nothing until Retry or another play.
    expect(result.current.waitingId).toBe(LINE.takes[0].id);
    projectState.mockResolvedValue({ playState: 'stopped' });
    act(() => retries[0]!());
    await flush();
    expect(previewTake).toHaveBeenCalledTimes(2);
  });
  it('a Retry offered for an older take plays nothing once a newer one was asked, and none plays after the page was left', async () => {
    const previewTake = vi.fn().mockResolvedValue({ ok: false, changed: false, message: 'Recording.', undoSteps: 0, refused: 'Recording.' });
    const projectState = vi.fn().mockResolvedValue({ playState: 'recording' });
    const { result, unmount } = mount(null, { previewTake, projectState });
    act(() => result.current.play(LINE.takes[0]));
    await flush();
    act(() => result.current.stop());
    act(() => result.current.play(LINE.takes[1]));
    await flush();
    projectState.mockResolvedValue({ playState: 'stopped' });
    const calls = previewTake.mock.calls.length;
    act(() => retries[0]!());
    await flush();
    expect(previewTake).toHaveBeenCalledTimes(calls);
    unmount();
    act(() => retries[1]!());
    await flush();
    expect(previewTake).toHaveBeenCalledTimes(calls);
  });
  it('a Retry for a take no longer under its line plays nothing and says so', async () => {
    const previewTake = vi.fn().mockResolvedValue({ ok: false, changed: false, message: 'Recording.', undoSteps: 0, refused: 'Recording.' });
    const projectState = vi.fn().mockResolvedValue({ playState: 'recording' });
    const { result } = mount(null, { previewTake, projectState });
    act(() => result.current.play(LINE.takes[0]));
    await flush();
    hidden = LINE.takes[0].id;
    const calls = previewTake.mock.calls.length;
    act(() => retries[0]!());
    await flush();
    expect(previewTake).toHaveBeenCalledTimes(calls);
    expect(notices.at(-1)).toMatch(/line is not on the page any more/);
  });
  it('says a failed read, asks again, and plays the take in the app', async () => {
    const retry = vi.fn().mockResolvedValue(undefined);
    const { result } = mount(null, {}, { failed: true, retry });
    act(() => result.current.play(LINE.takes[0]));
    await flush();
    expect(audio.play).toHaveBeenCalled();
    expect(notices).toEqual([`${READ_FAILED} ${FELL_BACK}`]);
    expect(retry).toHaveBeenCalledTimes(1);
  });
});

// #4124: the script's Play calls `stop`: a take that plays in the DAW, is being asked, or plays in the app is silenced.
describe('stop silences a take wherever it plays', () => {
  const ok = async (): Promise<DawResult> => ({ ok: true, changed: false, message: '', undoSteps: 0 });
  it('in the DAW: the preview is stopped', async () => {
    const stopPreview = vi.fn(ok);
    const { result } = mount(DAW_SETUPS.reaper, { previewTake: ok, stopPreview });
    act(() => result.current.play(LINE.takes[0]));
    await flush();
    act(() => result.current.stop());
    await flush();
    expect(stopPreview).toHaveBeenCalledTimes(1);
    expect(result.current.playingId).toBeNull();
    expect(result.current.stops).toBe(1);
  });
  it('while it is being asked: the preview that then lands is stopped, not left playing', async () => {
    const stopPreview = vi.fn(ok);
    let land: () => void = () => {};
    const previewTake = () => new Promise<DawResult>((resolve) => (land = () => resolve({ ok: true, changed: false, message: '', undoSteps: 0 })));
    const { result } = mount(DAW_SETUPS.reaper, { previewTake, stopPreview });
    act(() => result.current.play(LINE.takes[0]));
    await flush();
    act(() => result.current.stop());
    await act(async () => land());
    await flush();
    expect(stopPreview).toHaveBeenCalled();
    expect(result.current.playingId).toBeNull();
  });
  it('in the app: the audio is paused', async () => {
    const { result } = mount(DAW_SETUPS.builtin, {});
    act(() => result.current.play(LINE.takes[0]));
    await flush();
    expect(audio.play).toHaveBeenCalled();
    audio.pause.mockClear();
    act(() => result.current.stop());
    expect(audio.pause).toHaveBeenCalled();
    expect(result.current.playingId).toBeNull();
  });
});

describe('without-a-daw-that-plays-the-app-plays-the-take', () => {
  it.each([
    ['the built-in recorder', DAW_SETUPS.builtin],
    ['Audacity', DAW_SETUPS.audacity],
  ])('plays the take in the app with %s and asks the DAW nothing', async (_, caps) => {
    const previewTake = vi.fn();
    const { result } = mount(caps, { previewTake });
    act(() => result.current.play(LINE.takes[0]));
    await flush();
    expect(previewTake).not.toHaveBeenCalled();
    expect(audio.play).toHaveBeenCalled();
    expect(notices).toEqual([]);
  });
});

// #4111: a take is never silent for long when the DAW does not answer the preview, and a preview that lands late is stopped, not left beside the app.
describe('a-daw-that-does-not-answer-the-preview', () => {
  it('hands the take to the app after the deadline, saying the DAW did not answer, and offers no Retry (the take plays)', async () => {
    const previewTake = vi.fn(() => new Promise<DawResult>(() => {}));
    const { result } = mount(DAW_SETUPS.reaper, { previewTake });
    act(() => result.current.play(LINE.takes[0]));
    await flush();
    expect(audio.play).not.toHaveBeenCalled();
    expect(result.current.waitingId).toBe('take-1');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(PLAY_DEADLINE_MS + 1);
    });
    expect(audio.play).toHaveBeenCalledTimes(1);
    expect(notices.join(' ')).toContain('did not answer in time');
    expect(notices.join(' ')).toContain(FELL_BACK);
    expect(retries.at(-1)).toBeUndefined();
  });
  it('stops a preview the DAW answers after the deadline, once, so it does not play beside the app', async () => {
    let answer: (r: DawResult) => void = () => {};
    const stopPreview = vi.fn().mockResolvedValue({ ok: true, changed: false, message: '', undoSteps: 0 });
    const { result } = mount(DAW_SETUPS.reaper, { previewTake: () => new Promise<DawResult>((resolve) => (answer = resolve)), stopPreview });
    act(() => result.current.play(LINE.takes[0]));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(PLAY_DEADLINE_MS + 1);
    });
    expect(stopPreview).not.toHaveBeenCalled();
    answer({ ok: true, changed: false, message: '', undoSteps: 0 });
    await flush();
    expect(stopPreview).toHaveBeenCalledTimes(1);
  });
  it('says where to stop a late preview when the DAW refuses or cannot be asked to stop it', async () => {
    let answer: (r: DawResult) => void = () => {};
    const stopPreview = vi.fn().mockRejectedValue(new Error('bridge gone'));
    const { result } = mount(DAW_SETUPS.reaper, { previewTake: () => new Promise<DawResult>((resolve) => (answer = resolve)), stopPreview });
    act(() => result.current.play(LINE.takes[0]));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(PLAY_DEADLINE_MS + 1);
    });
    answer({ ok: true, changed: false, message: '', undoSteps: 0 });
    await flush();
    expect(notices.at(-1)).toBe('REAPER was not asked to stop: bridge gone. Stop it in REAPER.');
  });
  it('a preview answered after a newer take was pressed does not stop the newer take', async () => {
    const answers: ((r: DawResult) => void)[] = [];
    const stopPreview = vi.fn().mockResolvedValue({ ok: true, changed: false, message: '', undoSteps: 0 });
    const { result } = mount(DAW_SETUPS.reaper, { previewTake: () => new Promise<DawResult>((resolve) => answers.push(resolve)), stopPreview });
    act(() => result.current.play(LINE.takes[0]));
    act(() => result.current.play(LINE.takes[1]));
    await flush();
    await act(async () => {
      answers[1]!({ ok: true, changed: false, message: '', undoSteps: 0 });
      await vi.advanceTimersByTimeAsync(0);
    });
    const stopsBeforeOlderAnswer = stopPreview.mock.calls.length;
    await act(async () => {
      answers[0]!({ ok: true, changed: false, message: '', undoSteps: 0 });
      await vi.advanceTimersByTimeAsync(0);
    });
    // The newer take's preview is the DAW's one play: the older answer stops nothing, and the newer take is shown playing.
    expect(result.current.playingId).toBe('take-2');
    expect(stopPreview).toHaveBeenCalledTimes(stopsBeforeOlderAnswer);
  });
  it("an older take's preview that landed while a newer take was asked is stopped when the newer take is refused and the app plays it", async () => {
    const answers: ((r: DawResult) => void)[] = [];
    const stopPreview = vi.fn().mockResolvedValue({ ok: true, changed: false, message: '', undoSteps: 0 });
    const { result } = mount(DAW_SETUPS.reaper, { previewTake: () => new Promise<DawResult>((resolve) => answers.push(resolve)), stopPreview });
    act(() => result.current.play(LINE.takes[0]));
    act(() => result.current.play(LINE.takes[1]));
    await flush();
    await act(async () => {
      answers[0]!({ ok: true, changed: false, message: '', undoSteps: 0 });
      await vi.advanceTimersByTimeAsync(0);
    });
    const before = stopPreview.mock.calls.length;
    await act(async () => {
      answers[1]!({ ok: false, changed: false, message: 'Refused.', undoSteps: 0, refused: 'Refused.' });
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(stopPreview.mock.calls.length).toBeGreaterThan(before);
  });
  it('a preview answered after the page was left is stopped', async () => {
    let answer: (r: DawResult) => void = () => {};
    const stopPreview = vi.fn().mockResolvedValue({ ok: true, changed: false, message: '', undoSteps: 0 });
    const { result, unmount } = mount(DAW_SETUPS.reaper, { previewTake: () => new Promise<DawResult>((resolve) => (answer = resolve)), stopPreview });
    act(() => result.current.play(LINE.takes[0]));
    await flush();
    unmount();
    await act(async () => {
      answer({ ok: true, changed: false, message: '', undoSteps: 0 });
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(stopPreview).toHaveBeenCalledTimes(1);
  });
  it('a preview that ended by itself leaves no owner: an older take answering late is stopped, not left playing', async () => {
    const answers: ((r: DawResult) => void)[] = [];
    const stopPreview = vi.fn().mockResolvedValue({ ok: true, changed: false, message: '', undoSteps: 0 });
    const { result } = mount(DAW_SETUPS.reaper, { previewTake: () => new Promise<DawResult>((resolve) => answers.push(resolve)), stopPreview });
    act(() => result.current.play(LINE.takes[0]));
    act(() => result.current.play(LINE.takes[1]));
    await flush();
    await act(async () => {
      answers[1]!({ ok: true, changed: false, message: '', undoSteps: 0 });
      await vi.advanceTimersByTimeAsync(0);
    });
    // The newer take's preview plays its length (take-2 is 90 s, a minute is played) and ends by itself.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(61_000);
    });
    expect(result.current.playingId).toBeNull();
    const before = stopPreview.mock.calls.length;
    await act(async () => {
      answers[0]!({ ok: true, changed: false, message: '', undoSteps: 0 });
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(stopPreview.mock.calls.length).toBeGreaterThan(before);
  });
  it('after the deadline hands the take to the app, the take is shown playing in the app and ends with its audio (not stuck in the DAW)', async () => {
    const previewTake = vi.fn(() => new Promise<DawResult>(() => {}));
    const { result } = mount(DAW_SETUPS.reaper, { previewTake });
    act(() => result.current.play(LINE.takes[0]));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(PLAY_DEADLINE_MS + 1);
    });
    expect(result.current.playingId).toBe('take-1');
    await act(async () => {
      // The take's range ends (take-1: 2 s to 6 s of its file): the range player stops at its end.
      audio.currentTime = 99;
      audio.dispatchEvent(new Event('timeupdate'));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.playingId).toBeNull();
  });
  it('a DAW refusal that comes after the deadline does not clear the take the app is playing', async () => {
    let answer: (r: DawResult) => void = () => {};
    const { result } = mount(DAW_SETUPS.reaper, { previewTake: () => new Promise<DawResult>((resolve) => (answer = resolve)) });
    act(() => result.current.play(LINE.takes[0]));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(PLAY_DEADLINE_MS + 1);
    });
    await act(async () => {
      answer({ ok: false, changed: false, message: 'Late.', undoSteps: 0, refused: 'Late.' });
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.playingId).toBe('take-1');
  });
  it('the take Stop that the DAW refuses says where to stop it', async () => {
    const stopPreview = vi
      .fn()
      .mockResolvedValue({ ok: false, changed: false, message: 'REAPER would not stop', undoSteps: 0, refused: 'REAPER would not stop' });
    const { result } = mount(DAW_SETUPS.reaper, { stopPreview });
    act(() => result.current.play(LINE.takes[0]));
    await flush();
    act(() => result.current.stop());
    await flush();
    expect(notices.at(-1)).toBe('REAPER would not stop. Stop it in REAPER.');
  });
});
