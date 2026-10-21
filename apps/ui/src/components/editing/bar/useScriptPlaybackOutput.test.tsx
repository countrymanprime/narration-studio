// @vitest-environment jsdom
// The narrator's volume, mute, speed and output on the chapter player (docs/design/editing-output-audio.md, the state matrix).
//
//   applied at once, and again after a new file loads    'puts volume, mute and speed on the one element and keeps the speed across a new src'
//   change while playing                                  'a change while playing does not restart or pause the sound'
//   system default                                        'the system default needs no listing and reports no problem'
//   named output, connected                               'sends the element to the named output and reports no problem'
//   named output gone / refused                           'says so, and the element is back on the default'
//   two choices in a row                                  'only the newest choice reports'
//   audio system refuses                                  'says so when the audio system refuses the output'
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlaylistSegment } from '../../proof/playlist';
import { DEFAULT_OUTPUT, deviceProblem, type OutputPrefs } from '../../engine/outputPrefs';
import { EditingPageProvider } from '../script/EditingPageState';
import { marksDoc } from '../script/scriptFixtures';
import { useScriptPlayback, type ScriptPlayback } from './useScriptPlayback';

class FakeAudio extends EventTarget {
  src = '';
  currentTime = 0;
  volume = 1;
  muted = false;
  playbackRate = 1;
  defaultPlaybackRate = 1;
  preservesPitch = false;
  play = vi.fn().mockResolvedValue(undefined);
  pause = vi.fn();
  setSinkId = vi.fn(async (id: string) => {
    if (refuse && id) throw new Error('NotAllowedError');
  });
}
let refuse = false;
const instances: FakeAudio[] = [];
const SEGMENT: PlaylistSegment = {
  itemGuid: 'g',
  sourceFile: 'a.wav',
  sourceStart: 0,
  sourceEnd: 60,
  elapsedStart: 0,
  elapsedEnd: 60,
  overlapsPrevious: false,
};
let playback: ScriptPlayback;
const onOutputDevice = vi.fn();

function Harness({ output }: { output: OutputPrefs }) {
  playback = useScriptPlayback({ playlist: [SEGMENT], mediaUrl: (f) => `media/${f}`, notify: vi.fn(), output, onOutputDevice });
  return null;
}
const mount = (output: OutputPrefs) =>
  render(
    <EditingPageProvider doc={marksDoc()}>
      <Harness output={output} />
    </EditingPageProvider>,
  );
const rerender = (view: ReturnType<typeof mount>, output: OutputPrefs) =>
  view.rerender(
    <EditingPageProvider doc={marksDoc()}>
      <Harness output={output} />
    </EditingPageProvider>,
  );
const flush = () => act(async () => void (await Promise.resolve()));

let outputs: { kind: string; deviceId: string; label: string }[];
beforeEach(() => {
  instances.length = 0;
  refuse = false;
  onOutputDevice.mockClear();
  outputs = [{ kind: 'audiooutput', deviceId: 'a1', label: 'Studio monitors' }];
  vi.stubGlobal(
    'Audio',
    class extends FakeAudio {
      constructor() {
        super();
        instances.push(this);
      }
    },
  );
  vi.stubGlobal('navigator', { ...navigator, mediaDevices: { enumerateDevices: vi.fn(async () => outputs) } });
  (HTMLMediaElement.prototype as unknown as { setSinkId?: unknown }).setSinkId = vi.fn();
});
afterEach(() => {
  cleanup();
  delete (HTMLMediaElement.prototype as unknown as { setSinkId?: unknown }).setSinkId;
  vi.unstubAllGlobals();
});

describe('volume, mute and speed', () => {
  it('puts them on the one element and keeps the speed across a new src', async () => {
    mount({ ...DEFAULT_OUTPUT, volume: 40, muted: true, rate: 1.5 });
    await flush();
    const el = instances[0];
    expect(instances).toHaveLength(1);
    expect(el.volume).toBeCloseTo(0.4);
    expect(el.muted).toBe(true);
    expect(el.playbackRate).toBe(1.5);
    expect(el.preservesPitch).toBe(true);
    // A webview resets `playbackRate` to the default when a new file loads; the default is the narrator's speed.
    expect(el.defaultPlaybackRate).toBe(1.5);
  });

  it('a change while playing does not restart or pause the sound', async () => {
    const view = mount(DEFAULT_OUTPUT);
    act(() => playback.playFrom(1));
    const el = instances[0];
    const plays = el.play.mock.calls.length;
    rerender(view, { ...DEFAULT_OUTPUT, volume: 10, rate: 2, muted: true });
    await flush();
    expect(el.play.mock.calls.length).toBe(plays);
    expect(el.pause).not.toHaveBeenCalled();
    expect(el.playbackRate).toBe(2);
    expect(el.currentTime).toBe(1);
  });
});

describe('the output device', () => {
  it('the system default needs no listing and reports no problem', async () => {
    mount(DEFAULT_OUTPUT);
    await flush();
    expect(instances[0].setSinkId).toHaveBeenCalledWith('');
    expect(onOutputDevice).toHaveBeenLastCalledWith(null);
  });

  it('sends the element to the named output and reports no problem', async () => {
    mount({ ...DEFAULT_OUTPUT, device: 'Studio monitors' });
    await flush();
    expect(instances[0].setSinkId).toHaveBeenCalledWith('a1');
    expect(onOutputDevice).toHaveBeenLastCalledWith(null);
  });

  it('says so, and the element is back on the default, when the output is gone', async () => {
    outputs = [];
    mount({ ...DEFAULT_OUTPUT, device: 'Studio monitors' });
    await flush();
    expect(instances[0].setSinkId).toHaveBeenLastCalledWith('');
    expect(onOutputDevice).toHaveBeenLastCalledWith(deviceProblem('Studio monitors'));
  });

  it('says so when the audio system refuses the output', async () => {
    refuse = true;
    mount({ ...DEFAULT_OUTPUT, device: 'Studio monitors' });
    await flush();
    await flush();
    expect(onOutputDevice).toHaveBeenLastCalledWith(deviceProblem('Studio monitors'));
    expect(instances[0].setSinkId).toHaveBeenLastCalledWith('');
  });

  it('only the newest choice reports', async () => {
    const view = mount({ ...DEFAULT_OUTPUT, device: 'Gone' });
    rerender(view, DEFAULT_OUTPUT);
    await flush();
    await flush();
    expect(onOutputDevice).not.toHaveBeenCalledWith(deviceProblem('Gone'));
    expect(onOutputDevice).toHaveBeenLastCalledWith(null);
  });
});
