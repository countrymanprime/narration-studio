// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../../api/ApiContext';
import type { ChapterTrackMatch } from '../../../api/contracts/chapterTrackMap';
import type { TrackItem, TracksProject } from '../../../api/contracts/tracks';
import type { NarrationApi } from '../../../types';
import { createMockApi } from '../../../api/mockApi';
import { OverlayProvider } from '../../../overlay/OverlayProvider';
import { createOverlayService } from '../../../overlay/overlayService';
import { pickup } from './pickupFixtures';
import { usePlayOriginal } from './usePlayOriginal';

const item = (over: Partial<TrackItem> = {}): TrackItem => ({
  guid: 'i1',
  position: 300,
  length: 120,
  name: 'Chapter 1',
  sourceKind: 'WAVE',
  sourceFile: '/rec/ch1.wav',
  sourceAvailable: true,
  supported: true,
  takeGuid: 't1',
  sourceStart: 2,
  playRate: 1,
  ...over,
});
const project = (items: TrackItem[]): TracksProject => ({
  path: '/p.rpp',
  tracks: [{ guid: 'tr1', index: 0, name: 'Ch 1', color: '', muted: false, soloed: false, items }],
});
const linked = (status: ChapterTrackMatch['status'] = 'confirmed'): ChapterTrackMatch =>
  ({
    chapterId: 'c1',
    chapterTitle: 'Chapter 1',
    projectFile: '/p.rpp',
    savedAt: '',
    status,
    track: status === 'none' ? null : { trackGuid: 'tr1', trackName: 'Ch 1', trackIndex: 0, score: 1, source: 'confirmed', region: null },
    candidates: [],
    warnings: [],
    tracks: [],
    recordedEnd: null,
  }) as ChapterTrackMatch;

let play: ReturnType<typeof vi.fn>;
beforeEach(() => {
  play = vi.fn(async () => undefined);
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(play as never);
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function setup(over: Partial<NarrationApi> = {}) {
  const service = createOverlayService();
  const api = createMockApi({
    mediaUrl: (file) => `media:${file}`,
    chapterTrackMatch: async () => linked(),
    tracksList: async () => project([item()]),
    ...over,
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <ApiProvider api={api}>
      <OverlayProvider service={service}>{children}</OverlayProvider>
    </ApiProvider>
  );
  const view = renderHook(() => usePlayOriginal(), { wrapper });
  const toasts = () => service.getSnapshot().toasts.map((t) => t.text);
  return { ...view, toasts };
}

describe('usePlayOriginal (PK-1)', () => {
  it('plays the chapter’s recording from three seconds before the line, in its source file', async () => {
    const { result } = setup();
    await act(() => result.current.toggle(pickup({ at: 312 })));
    expect(play).toHaveBeenCalledTimes(1);
    expect(result.current.playing).toBe('speech:c1:g1');
    const audio = vi.mocked(HTMLMediaElement.prototype.play).mock.contexts[0] as HTMLAudioElement;
    expect(audio.src).toBe('media:/rec/ch1.wav');
    // 312 s in the project is 12 s into the item, which starts 2 s into the file: 14 s, less the 3 s lead-in.
    expect(audio.currentTime).toBeCloseTo(11, 5);
  });

  it('stops when the same line is pressed again', async () => {
    const { result } = setup();
    await act(() => result.current.toggle(pickup({ at: 312 })));
    await act(() => result.current.toggle(pickup({ at: 312 })));
    expect(result.current.playing).toBeNull();
    expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled();
    expect(play).toHaveBeenCalledTimes(1);
  });

  it('moves to another line when that one is pressed', async () => {
    const { result } = setup();
    await act(() => result.current.toggle(pickup({ at: 312 })));
    await act(() => result.current.toggle(pickup({ id: 'speech:c1:g2', at: 400 })));
    expect(result.current.playing).toBe('speech:c1:g2');
    expect(play).toHaveBeenCalledTimes(2);
  });

  it('asks the host for nothing until a line is pressed', () => {
    const chapterTrackMatch = vi.fn(async () => linked());
    const tracksList = vi.fn(async () => project([item()]));
    setup({ chapterTrackMatch, tracksList });
    expect(chapterTrackMatch).not.toHaveBeenCalled();
    expect(tracksList).not.toHaveBeenCalled();
  });

  it('says so, and plays nothing, for a chapter with no track linked', async () => {
    const { result, toasts } = setup({ chapterTrackMatch: async () => linked('none') });
    await act(() => result.current.toggle(pickup()));
    expect(play).not.toHaveBeenCalled();
    expect(toasts()).toEqual([expect.stringMatching(/no track linked/)]);
  });

  it('does not play a track the app only guessed at', async () => {
    const { result, toasts } = setup({ chapterTrackMatch: async () => linked('uncertain') });
    await act(() => result.current.toggle(pickup()));
    expect(play).not.toHaveBeenCalled();
    expect(toasts()).toHaveLength(1);
  });

  it('says so for a track that has left the project, a time with no audio, and a line the host could not place', async () => {
    const gone = setup({ tracksList: async () => ({ path: '/p.rpp', tracks: [] }) });
    await act(() => gone.result.current.toggle(pickup()));
    expect(gone.toasts()).toEqual([expect.stringMatching(/not in the DAW project/)]);

    const gap = setup();
    await act(() => gap.result.current.toggle(pickup({ at: 9000 })));
    expect(gap.toasts()).toEqual([expect.stringMatching(/no audio/)]);

    const unplaced = setup();
    await act(() => unplaced.result.current.toggle(pickup({ at: null })));
    expect(unplaced.toasts()).toEqual([expect.stringMatching(/no place in the recording/)]);
    expect(play).not.toHaveBeenCalled();
  });

  it('says why when the host refuses', async () => {
    const { result, toasts } = setup({
      chapterTrackMatch: async () => {
        throw new Error('The DAW project could not be read.');
      },
    });
    await act(() => result.current.toggle(pickup()));
    await waitFor(() => expect(toasts()).toEqual([expect.stringContaining('could not be read')]));
  });

  it('drops the answer of an earlier press once a later one has been made', async () => {
    let release: (value: ChapterTrackMatch) => void = () => undefined;
    const slow = new Promise<ChapterTrackMatch>((resolve) => (release = resolve));
    let calls = 0;
    const { result } = setup({ chapterTrackMatch: () => (++calls === 1 ? slow : Promise.resolve(linked())) });
    let first: Promise<void> = Promise.resolve();
    act(() => {
      first = result.current.toggle(pickup({ id: 'a', at: 312 }));
    });
    await act(() => result.current.toggle(pickup({ id: 'b', at: 330 })));
    await act(async () => {
      release(linked());
      await first;
    });
    expect(result.current.playing).toBe('b');
    expect(play).toHaveBeenCalledTimes(1);
  });
});
