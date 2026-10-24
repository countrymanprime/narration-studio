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
import { CHECKING, READ_FAILED, type DawRead } from '../follow/playRoute';
import type { LinePassage, LineTake } from './types';
import { TAKE_DAW_ONLY, useTakeAudition } from './useTakeAudition';

// #2251 item 32: with a DAW linked, a take under a line plays through the DAW's preview and never through the app's audio.

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
const stopChapter = vi.fn();

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
        passageOf: (t) => (LINE.takes.some((x) => x.id === t.id) ? LINE : null),
        stopChapter,
        notify: (text) => notices.push(text),
      }),
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
  notices.length = 0;
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
  ])('plays nothing and says why when the DAW %s', async (_, previewTake, why) => {
    const { result } = mount(DAW_SETUPS.reaper, { previewTake });
    act(() => result.current.play(LINE.takes[0]));
    await flush();
    expect(audio.play).not.toHaveBeenCalled();
    expect(result.current.playingId).toBeNull();
    expect(notices.join(' ')).toMatch(why);
    expect(notices.join(' ')).toContain(TAKE_DAW_ONLY);
  });
  it('plays nothing through the app while the DAW is not running, with its sentence', async () => {
    const { result } = mount(DAW_SETUPS['reaper-off'], { previewTake: createMockDawClient(DAW_SETUPS['reaper-off']).previewTake });
    act(() => result.current.play(LINE.takes[0]));
    await flush();
    expect(audio.play).not.toHaveBeenCalled();
    expect(notices.join(' ')).toContain(DAW_SETUPS['reaper-off'].capabilities.file_preview.message!);
  });
  it('a take whose line is gone asks nothing', async () => {
    const previewTake = vi.fn();
    const { result } = mount(DAW_SETUPS.reaper, { previewTake });
    act(() => result.current.play(take('take-9')));
    await flush();
    expect(previewTake).not.toHaveBeenCalled();
    expect(notices.join(' ')).toContain(TAKE_DAW_ONLY);
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
  it('plays nothing and says it is checking', async () => {
    const { result } = mount(null);
    act(() => result.current.play(LINE.takes[0]));
    await flush();
    expect(audio.play).not.toHaveBeenCalled();
    expect(notices).toEqual([CHECKING]);
  });
  it('says a failed read and asks again', async () => {
    const retry = vi.fn().mockResolvedValue(undefined);
    const { result } = mount(null, {}, { failed: true, retry });
    act(() => result.current.play(LINE.takes[0]));
    await flush();
    expect(notices).toEqual([READ_FAILED]);
    expect(retry).toHaveBeenCalledTimes(1);
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
  });
});
