// @vitest-environment jsdom
// One sound at a time (#4080): the script, a take, a comparison and a read elsewhere share one rule, so starting any of them stops the others and each
// control shows the truth. Mounted together the way the Editing page mounts them.
//
//   take playing, script Play      'the script's Play stops a take playing in the app'
//   script playing, take Play      'a take's Play stops the script'
//   take in the DAW, script Play   'the script's Play stops a take the DAW previews'
//   any start                      'no two sources are playing after any start, in any order'
//   comparison, take by hand       'a take started by hand ends the comparison'
import { act, cleanup, render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DawResult } from '../../api/contracts/daw';
import { ApiProvider } from '../../api/ApiContext';
import { createMockApi } from '../../api/mockApi';
import { DAW_SETUPS } from '../../fixtures/daw';
import { createMockDawClient } from '../../ports/daw';
import type { DawClient } from '../../ports/index';
import { PortOverrides } from '../../ports/usePort';
import type { PlaylistSegment } from '../proof/playlist';
import { stopOtherAudio } from '../voicesamples/samplePlayerStore';
import { useScriptPlayback, type ScriptPlayback } from './bar/useScriptPlayback';
import { EditingPageProvider } from './script/EditingPageState';
import { marksDoc } from './script/scriptFixtures';
import type { LinePassage, LineTake } from './takes/types';
import { useTakeAudition, type TakeAudition } from './takes/useTakeAudition';

class FakeAudio extends EventTarget {
  src = '';
  currentTime = 0;
  volume = 1;
  muted = false;
  playbackRate = 1;
  defaultPlaybackRate = 1;
  preservesPitch = false;
  paused = true;
  play = vi.fn(async () => void (this.paused = false));
  pause = vi.fn(() => void (this.paused = true));
}
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
const take = (id: string): LineTake => ({ id, label: id, active: false, usable: true, sourceFile: `/book/${id}.wav`, sourceStart: 2, sourceLength: 4 });
const LINE: LinePassage = { id: 'p1', chapterId: 'chapter-1', firstToken: 0, lastToken: 4, script: 'Garden', takes: [take('take-1'), take('take-2')] };

let script: ScriptPlayback;
let audition: TakeAudition;
const notices: string[] = [];

function Page() {
  script = useScriptPlayback({ playlist: [SEGMENT], mediaUrl: (f) => `media/${f}`, notify: (t) => void notices.push(t) });
  audition = useTakeAudition({ caps: null, mediaUrl: (f) => f, passageOf: () => LINE, stopChapter: script.stop, notify: (t) => void notices.push(t) });
  return null;
}
function mount(client: Partial<DawClient> = {}) {
  const daw: DawClient = { ...createMockDawClient(DAW_SETUPS.reaper), ...client };
  const Wrap = ({ children }: { children: ReactNode }) => (
    <ApiProvider api={createMockApi()}>
      <PortOverrides clients={{ daw }}>
        <EditingPageProvider doc={marksDoc()}>{children}</EditingPageProvider>
      </PortOverrides>
    </ApiProvider>
  );
  return render(<Page />, { wrapper: Wrap });
}
const flush = () => act(async () => void (await vi.advanceTimersByTimeAsync(0)));
/** How many of the page's sources say they are playing now. */
const playingNow = (): number => (script.playing ? 1 : 0) + (audition.playingId !== null ? 1 : 0);
const refusePreview = async (): Promise<DawResult> => ({ ok: false, changed: false, message: 'No.', undoSteps: 0, refused: 'No.' });

beforeEach(() => {
  vi.useFakeTimers();
  instances.length = 0;
  notices.length = 0;
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
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('one-sound-at-a-time', () => {
  it("the script's Play stops a take playing in the app", async () => {
    mount({ previewTake: refusePreview });
    act(() => audition.play(LINE.takes[0]));
    await flush();
    expect(audition.playingId).toBe('take-1');
    act(() => script.playFrom(0));
    await flush();
    expect(audition.playingId).toBeNull();
    expect(script.playing).toBe(true);
    // The take's own element was paused, not left running beside the script.
    expect(instances.filter((a) => !a.paused)).toHaveLength(1);
  });

  it("a take's Play stops the script", async () => {
    mount({ previewTake: refusePreview });
    act(() => script.playFrom(0));
    await flush();
    expect(script.playing).toBe(true);
    act(() => audition.play(LINE.takes[0]));
    await flush();
    expect(script.playing).toBe(false);
    expect(audition.playingId).toBe('take-1');
  });

  it("the script's Play stops a take the DAW previews", async () => {
    const stopPreview = vi.fn(async (): Promise<DawResult> => ({ ok: true, changed: false, message: '', undoSteps: 0 }));
    mount({ previewTake: async () => ({ ok: true, changed: false, message: '', undoSteps: 0 }), stopPreview });
    act(() => audition.play(LINE.takes[0]));
    await flush();
    expect(audition.playingId).toBe('take-1');
    act(() => script.playFrom(0));
    await flush();
    expect(stopPreview).toHaveBeenCalled();
    expect(audition.playingId).toBeNull();
  });

  it('no two sources are playing after any start, in any order', async () => {
    mount({ previewTake: refusePreview });
    const starts: [string, () => void][] = [
      ['script', () => script.playFrom(0)],
      ['take 1', () => audition.play(LINE.takes[0])],
      ['take 2', () => audition.play(LINE.takes[1])],
    ];
    for (const [a, startA] of starts)
      for (const [b, startB] of starts) {
        act(startA);
        await flush();
        act(startB);
        await flush();
        expect(playingNow(), `${a} then ${b}`).toBeLessThanOrEqual(1);
      }
  });

  it('another sound starting (a sample, a read) stops the take', async () => {
    mount({ previewTake: refusePreview });
    act(() => audition.play(LINE.takes[0]));
    await flush();
    act(() => stopOtherAudio());
    expect(audition.playingId).toBeNull();
  });
});
