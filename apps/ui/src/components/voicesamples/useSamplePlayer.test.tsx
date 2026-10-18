// @vitest-environment jsdom
// The state matrix (definition of done, rule 3) for the shared sample player, written before the code. The control here is the
// player and its guard; the buttons that draw it are phases 3 to 5, so a cell that needs a page says so. Each cell names its test.
//
//   empty, one, many, huge      not tested: the player holds one sample and has no list; the lists are phases 4 and 5
//   loading                     'plays from the sample route and shows loading until the audio starts', 'a slow first byte stays loading and can be stopped'
//   playing, progress           'reports progress as currentTime over duration'
//   refused (recording)         'refuses while a take records', 'a take that starts stops a sample that is playing'
//   refused (cannot tell)       'refuses while the recorder cannot be read, with the page's sentence', 'plays on a page that has no recorder'
//   failed (load)               'a failed load returns to idle, says why and loads again next time'
//   failed (play refused)       'a play the platform refuses returns to idle and says why', 'an interrupted play is not a failure'
//   stale (older play settles)  'a play that settles after a newer one does not stop the newer one'
//   one at a time               'a new play stops the last', 'two pages share one player and one Audio'
//   rapid double-fire           'play twice restarts and never overlaps', 'three presses make one Audio and one sample'
//   Esc                         'Esc stops it and only while one plays'
//   finished                    'a finished sample says so and plays again'
//   other audio                 'audio registered with onSampleStart stops when a sample starts, not when one is refused'
//   long, RTL, emoji name       'a name in any script reaches the live region as given'
//   leave mid-action            'the page that started a sample takes it away when it unmounts'
//   reload mid-action           not tested: a reload discards the page, its Audio and this module with it
//   the host never answers      'a slow first byte stays loading and can be stopped' (the route is a Wails asset request; there is no stream to lose)
//   wrong id, changed clip      'a failed load ...' (the host answers 404 and the element fires error)
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../api/ApiContext';
import { createMockApi } from '../../api/mockApi';
import { NOT_WHILE_RECORDING, SAMPLE_FAILED, SAMPLE_FINISHED, onSampleStart, samplePlayerState, stopSample } from './samplePlayerStore';
import { useSamplePlayer, type SamplePlayerOptions } from './useSamplePlayer';

class FakeAudio extends EventTarget {
  srcAssignments: string[] = [];
  private current = '';
  currentTime = 0;
  duration = Number.NaN;
  play = vi.fn().mockResolvedValue(undefined);
  pause = vi.fn();
  get src(): string {
    return this.current;
  }
  set src(value: string) {
    this.current = value;
    this.srcAssignments.push(value);
    this.currentTime = 0;
  }
  fire(type: string): void {
    this.dispatchEvent(new Event(type));
  }
}

// The player makes its one Audio on the first play and keeps it for the life of the page, so the tests share it and reset it.
const instances: FakeAudio[] = [];
const audio = (): FakeAudio => instances[0]!;

beforeAll(() => {
  vi.stubGlobal(
    'Audio',
    class extends FakeAudio {
      constructor() {
        super();
        instances.push(this);
      }
    },
  );
});

const A = 'a'.repeat(32);
const B = 'b'.repeat(32);
// The mock host answers a silent clip's object URL where the platform has one; the route's own shape is pinned in wailsClient.test.ts.
const api = { ...createMockApi(), voiceSampleMediaUrl: (id: string) => `/media?sample=${id}` };
const wrapper = ({ children }: { children: ReactNode }) => <ApiProvider api={api}>{children}</ApiProvider>;
const mount = (options: SamplePlayerOptions = {}) => renderHook((props: SamplePlayerOptions) => useSamplePlayer(props), { wrapper, initialProps: options });

beforeEach(() => {
  const el = instances[0];
  if (!el) return;
  el.play.mockReset().mockResolvedValue(undefined);
  el.pause.mockReset();
  el.srcAssignments.length = 0;
  el.currentTime = 0;
  el.duration = Number.NaN;
});
afterEach(() => act(() => stopSample()));

describe('useSamplePlayer', () => {
  it('plays from the sample route and shows loading until the audio starts', () => {
    const notify = vi.fn();
    const { result } = mount({ notify });

    act(() => void result.current.play(A, { name: 'Hatter' }));

    expect(audio().src).toBe(`/media?sample=${A}`);
    expect(audio().play).toHaveBeenCalledTimes(1);
    expect(result.current).toMatchObject({ status: 'loading', id: A, announcement: '' });
    expect(result.current.isActive(A)).toBe(true);
    expect(result.current.isActive(B)).toBe(false);

    act(() => audio().fire('playing'));
    expect(result.current).toMatchObject({ status: 'playing', id: A, announcement: 'Playing voice sample for Hatter' });
    expect(notify).not.toHaveBeenCalled();
  });

  it('a slow first byte stays loading and can be stopped', () => {
    const { result } = mount();
    act(() => void result.current.play(A));
    expect(result.current.status).toBe('loading');

    act(() => result.current.stop());

    expect(result.current).toMatchObject({ status: 'idle', id: null });
    expect(audio().pause).toHaveBeenCalled();
  });

  it('a new play stops the last', () => {
    const { result } = mount();
    act(() => void result.current.play(A));
    act(() => audio().fire('playing'));

    act(() => void result.current.play(B));

    expect(audio().src).toBe(`/media?sample=${B}`);
    expect(result.current).toMatchObject({ status: 'loading', id: B });
    expect(result.current.isActive(A)).toBe(false);
    expect(audio().pause).toHaveBeenCalled();
  });

  it('play twice restarts and never overlaps', () => {
    const { result } = mount();
    act(() => void result.current.play(A));
    act(() => audio().fire('playing'));
    audio().srcAssignments.length = 0;
    audio().currentTime = 3;

    act(() => void result.current.play(A));

    expect(audio().currentTime).toBe(0);
    expect(audio().srcAssignments).toEqual([]);
    expect(audio().play).toHaveBeenCalledTimes(2);
    expect(result.current).toMatchObject({ id: A, progress: 0 });
  });

  it('three presses make one Audio and one sample', () => {
    const { result } = mount();
    act(() => {
      result.current.play(A);
      result.current.play(A);
      result.current.play(B);
    });
    expect(instances).toHaveLength(1);
    expect(audio().play).toHaveBeenCalledTimes(3);
    expect(result.current).toMatchObject({ status: 'loading', id: B });
  });

  it('two pages share one player and one Audio', () => {
    const first = mount();
    const second = mount();

    act(() => void first.result.current.play(A));

    expect(second.result.current).toMatchObject({ status: 'loading', id: A });
    act(() => void second.result.current.play(B));
    expect(first.result.current).toMatchObject({ id: B });
    expect(instances).toHaveLength(1);
  });

  it('Esc stops it and only while one plays', () => {
    const { result } = mount();
    act(() => void result.current.play(A));
    act(() => audio().fire('playing'));

    act(() => void window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' })));
    expect(result.current.status).toBe('playing');

    const handled = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true });
    handled.preventDefault();
    act(() => void window.dispatchEvent(handled));
    expect(result.current.status).toBe('playing');

    act(() => void window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));
    expect(result.current).toMatchObject({ status: 'idle', id: null });

    const pauses = audio().pause.mock.calls.length;
    act(() => void window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));
    expect(audio().pause.mock.calls.length).toBe(pauses);
  });

  it('refuses while a take records', () => {
    const notify = vi.fn();
    const { result } = mount({ guard: { recording: true }, notify });
    const plays = instances[0]?.play.mock.calls.length ?? 0;

    let played = true;
    act(() => void (played = result.current.play(A)));

    expect(played).toBe(false);
    expect(NOT_WHILE_RECORDING).toBe('Not while recording. Stop the take first.');
    expect(notify).toHaveBeenCalledExactlyOnceWith(NOT_WHILE_RECORDING);
    expect(instances[0]?.play.mock.calls.length ?? 0).toBe(plays);
    expect(result.current.status).toBe('idle');
  });

  it('a take that starts stops a sample that is playing', () => {
    const { result, rerender } = mount({ guard: { recording: false } });
    act(() => void result.current.play(A));
    act(() => audio().fire('playing'));

    rerender({ guard: { recording: true } });

    expect(result.current.status).toBe('idle');
    expect(audio().pause).toHaveBeenCalled();
  });

  it("refuses while the recorder cannot be read, with the page's sentence", () => {
    const notify = vi.fn();
    const sentence = "Can't tell whether a take is recording (last heard 12 s ago).";
    const { result } = mount({ guard: { recording: false, cantTell: sentence }, notify });

    let played = true;
    act(() => void (played = result.current.play(A)));

    expect(played).toBe(false);
    expect(notify).toHaveBeenCalledExactlyOnceWith(sentence);
    expect(result.current.status).toBe('idle');
  });

  it('plays on a page that has no recorder', () => {
    const { result } = mount();
    let played = false;
    act(() => void (played = result.current.play(A)));
    expect(played).toBe(true);
    expect(result.current.status).toBe('loading');
  });

  it('a failed load returns to idle, says why and loads again next time', () => {
    const notify = vi.fn();
    const { result } = mount({ notify });
    act(() => void result.current.play(A));

    act(() => audio().fire('error'));

    expect(result.current).toMatchObject({ status: 'idle', id: null });
    expect(notify).toHaveBeenCalledExactlyOnceWith(SAMPLE_FAILED, 'error');

    audio().srcAssignments.length = 0;
    act(() => void result.current.play(A));
    expect(audio().srcAssignments).toEqual([`/media?sample=${A}`]);
    expect(result.current.status).toBe('loading');
  });

  it('a play the platform refuses returns to idle and says why', async () => {
    const notify = vi.fn();
    const { result } = mount({ notify });
    act(() => void result.current.play(A));
    audio().play.mockRejectedValueOnce(new DOMException('blocked', 'NotAllowedError'));

    await act(async () => void result.current.play(B));

    expect(result.current.status).toBe('idle');
    expect(notify).toHaveBeenCalledExactlyOnceWith(SAMPLE_FAILED, 'error');
  });

  it('an interrupted play is not a failure', async () => {
    const notify = vi.fn();
    const { result } = mount({ notify });
    act(() => void result.current.play(A));
    audio().play.mockRejectedValueOnce(new DOMException('interrupted', 'AbortError'));

    await act(async () => void result.current.play(B));

    expect(result.current).toMatchObject({ status: 'loading', id: B });
    expect(notify).not.toHaveBeenCalled();
  });

  it('a play that settles after a newer one does not stop the newer one', async () => {
    const notify = vi.fn();
    const { result } = mount({ notify });
    act(() => void result.current.play(A));
    let rejectOlder: (reason: unknown) => void = () => {};
    audio().play.mockReturnValueOnce(
      new Promise((_, reject) => {
        rejectOlder = reject;
      }),
    );
    act(() => void result.current.play(B));
    act(() => void result.current.play(A));

    await act(async () => rejectOlder(new DOMException('blocked', 'NotAllowedError')));

    expect(result.current).toMatchObject({ status: 'loading', id: A });
    expect(notify).not.toHaveBeenCalled();
  });

  it('reports progress as currentTime over duration', () => {
    const { result } = mount();
    act(() => void result.current.play(A));
    act(() => audio().fire('playing'));

    act(() => {
      audio().currentTime = 2;
      audio().fire('timeupdate');
    });
    expect(result.current.progress).toBe(0); // the duration is not known yet

    audio().duration = 8;
    act(() => {
      audio().currentTime = 2;
      audio().fire('timeupdate');
    });
    expect(result.current.progress).toBe(0.25);

    act(() => {
      audio().currentTime = 9;
      audio().fire('timeupdate');
    });
    expect(result.current.progress).toBe(1);
  });

  it('a finished sample says so and plays again', () => {
    const { result } = mount();
    act(() => void result.current.play(A));
    act(() => audio().fire('playing'));

    act(() => audio().fire('ended'));
    expect(result.current).toMatchObject({ status: 'idle', id: null, announcement: SAMPLE_FINISHED });

    audio().currentTime = 7;
    act(() => void result.current.play(A));
    expect(audio().currentTime).toBe(0);
    expect(result.current).toMatchObject({ status: 'loading', id: A, announcement: '' });
  });

  it('audio registered with onSampleStart stops when a sample starts, not when one is refused', () => {
    const stop = vi.fn();
    const broken = vi.fn(() => {
      throw new Error('another page failed to stop');
    });
    const off = [onSampleStart(broken), onSampleStart(stop)];
    const refused = mount({ guard: { recording: true }, notify: vi.fn() });
    act(() => void refused.result.current.play(A));
    expect(stop).not.toHaveBeenCalled();

    const { result } = mount();
    act(() => void result.current.play(A));
    expect(stop).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe('loading');

    off.forEach((unregister) => unregister());
    act(() => void result.current.play(B));
    expect(stop).toHaveBeenCalledTimes(1);
  });

  it('a name in any script reaches the live region as given', () => {
    const { result } = mount();
    for (const name of ['שלום 🦎 اليوم', 'Hatter'.repeat(40)]) {
      act(() => void result.current.play(A, { name }));
      act(() => audio().fire('playing'));
      expect(result.current.announcement).toBe(`Playing voice sample for ${name}`);
    }
  });

  it('the page that started a sample takes it away when it unmounts', () => {
    const starter = mount();
    const other = mount();
    act(() => void starter.result.current.play(A));

    other.unmount();
    expect(samplePlayerState().status).toBe('loading');

    starter.unmount();
    expect(samplePlayerState()).toMatchObject({ status: 'idle', id: null });
  });
});
