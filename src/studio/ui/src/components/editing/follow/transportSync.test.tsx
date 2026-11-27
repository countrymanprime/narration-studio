// @vitest-environment jsdom
import { overlay } from '../../../overlay/overlayService';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DawCapabilities } from '../../../api/contracts/daw';
import { ApiProvider } from '../../../api/ApiContext';
import { createMockApi } from '../../../api/mockApi';
import type { DawMockControl } from '../../../api/dawMock';
import { DAW_SETUPS } from '../../../fixtures/daw';
import type { PlaylistSegment } from '../../proof/playlist';
import { useScriptPlayback, type ScriptPlayback } from '../bar/useScriptPlayback';
import { EditingPageProvider, useEditingPage } from '../script/EditingPageState';
import { ScriptDoc } from '../script/ScriptDoc';
import { marksDoc } from '../script/scriptFixtures';
import { useDawPlayPosition } from './useDawPlayPosition';
import { buildWordClock, type WordClock } from './wordClock';
import { linear, wordTimesFor } from './wordTimesFixtures';
import { ECHO_WINDOW_MS } from './echoGuard';
import { dawPlayOwner } from '../../../playback/dawPlayOwner';
import { LEASE_RENEW_MS, SILENT_MS } from './useDawTransportSync';
import { READ_FAILED, type DawRead } from '../../../playback/providers';
import { PLAY_DEADLINE_MS } from '../../engine/ShowInDaw';

const FELL_BACK = 'Played in the app instead.';

const doc = marksDoc();

// One item at 100 s in the project playing the page at twice the speed: document time 2x is project 100 + x. It holds the first 8 document seconds; the
// words after them are not in the project (the same fixture as follow.test.tsx).
const PLAYLIST: PlaylistSegment[] = [
  { itemGuid: 'g', sourceFile: 'a.wav', sourceStart: 10, sourceEnd: 18, elapsedStart: 0, elapsedEnd: 8, overlapsPrevious: false },
];
const placed = wordTimesFor(doc, (w) => (w.t1 <= 8 ? linear(100, 0, 2)(w) : null));
const CLOCK = buildWordClock(placed.table, doc, placed.tokenOf);
const atZero = wordTimesFor(doc, (w) => (w.t1 <= 8 ? linear(0, 0, 2)(w) : null));
const ZERO_CLOCK = buildWordClock(atZero.table, doc, atZero.tokenOf);
const NOTHING_PLACED = wordTimesFor(doc, () => null);
const NO_CLOCK = buildWordClock(NOTHING_PLACED.table, doc, NOTHING_PLACED.tokenOf);
/** The project time at which the page's clock reads `docT`. */
const at = (docT: number): number => 100 + docT / 2;
const t0 = (key: string): number => doc.items[doc.index.get(key) ?? -1].t0 as number;

class FakeAudio extends EventTarget {
  src = '';
  currentTime = 0;
  play = vi.fn().mockResolvedValue(undefined);
  pause = vi.fn();
}
let audio: FakeAudio;
let daw: DawMockControl;
let playback: ScriptPlayback;
let page: ReturnType<typeof useEditingPage>;
const notices: string[] = [];
const retries: Array<() => void> = [];

function Harness({
  caps,
  clock = CLOCK,
  pending = false,
  read,
}: {
  caps: DawCapabilities | null;
  clock?: WordClock | null;
  pending?: boolean;
  read?: DawRead;
}) {
  page = useEditingPage();
  playback = useScriptPlayback({
    playlist: PLAYLIST,
    mediaUrl: (f) => f,
    notify: (text, retry) => {
      notices.push(text);
      if (retry) retries.push(retry);
    },
    sync: { clock, clockPending: pending, caps, chapterId: 'chapter-1', ...(read ? { read } : {}) },
  });
  useDawPlayPosition({ clock, caps: playback.syncActive ? null : caps, playback });
  return (
    <div>
      <output data-testid="state">
        {JSON.stringify({ playT: page.state.playT, cursor: page.state.cursor, follow: playback.follow, playing: playback.playing })}
      </output>
      <ScriptDoc />
    </div>
  );
}

const mount = (
  caps: DawCapabilities | null = DAW_SETUPS.reaper,
  seed: Parameters<typeof createMockApi>[1] = { daw: {} },
  clock?: WordClock | null,
  pending = false,
) => {
  const api = createMockApi({}, seed);
  daw = window.__NARRATION_MOCK_DAW__ as DawMockControl;
  return render(
    <ApiProvider api={api}>
      <EditingPageProvider doc={doc}>
        <Harness caps={caps} clock={clock} pending={pending} />
      </EditingPageProvider>
    </ApiProvider>,
  );
};
const state = () =>
  JSON.parse(screen.getByTestId('state').textContent ?? '{}') as { playT: number | null; cursor: string | null; follow: boolean; playing: boolean };
const lit = (): string | null => document.querySelector('[data-now]')?.getAttribute('data-k') ?? null;
const wait = async (ms: number) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
};
const calls = (action: string) => daw.syncCalls().filter((call) => call.action === action);
/** Mounted, with the watch lease taken and the DAW's opening position heard. */
const ready = async (caps?: DawCapabilities | null, seed?: Parameters<typeof createMockApi>[1]) => {
  mount(caps, seed);
  await wait(10);
};

beforeEach(() => {
  vi.useFakeTimers();
  audio = new FakeAudio();
  vi.stubGlobal('Audio', function () {
    return audio;
  });
  notices.length = 0;
  retries.length = 0;
  dawPlayOwner.forget();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('the-page-takes-a-watch-lease-and-keeps-it', () => {
  it('asks to watch when it opens, renews well inside the lease, and stops when it closes', async () => {
    const view = mount();
    await wait(10);
    expect(calls('watch')).toHaveLength(1);
    await wait(LEASE_RENEW_MS * 3);
    expect(calls('watch').length).toBeGreaterThanOrEqual(4);
    expect(LEASE_RENEW_MS).toBeLessThanOrEqual(5000);
    view.unmount();
    const after = calls('watch').length;
    await wait(LEASE_RENEW_MS * 3);
    expect(calls('watch')).toHaveLength(after);
  });
  it('stops renewing while the window is hidden', async () => {
    mount();
    await wait(10);
    const hidden = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    const before = calls('watch').length;
    await wait(LEASE_RENEW_MS * 3);
    expect(calls('watch')).toHaveLength(before);
    hidden.mockReturnValue('visible');
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await wait(10);
    expect(calls('watch').length).toBeGreaterThan(before);
  });
});

describe('daw-to-app', () => {
  it('puts the cursor on the word at the DAW cursor', async () => {
    await ready();
    act(() => daw.moveInDaw({ cursor: at(1.3) }));
    expect(state().cursor).toBe('p-1:3');
    act(() => daw.moveInDaw({ cursor: at(4.2) }));
    expect(state().cursor).toBe('p-2:1');
  });
  it('lights the word the DAW is playing, and follows the text', async () => {
    await ready();
    act(() => daw.moveInDaw({ playing: true, head: at(4.2) }));
    expect(lit()).toBe('p-2:1');
    expect(state().follow).toBe(true);
    act(() => daw.moveInDaw({ head: at(1.3) }));
    expect(lit()).toBe('p-1:3');
  });
  it('does nothing visible for a position outside the chapter, or in a gap between words', async () => {
    await ready();
    act(() => daw.moveInDaw({ cursor: at(1.3) }));
    act(() => daw.moveInDaw({ cursor: 5 }));
    expect(state().cursor).toBe('p-1:3');
    act(() => daw.moveInDaw({ playing: true, head: at(4.2) }));
    act(() => daw.moveInDaw({ head: 9999 }));
    expect(lit()).toBe('p-2:1');
    act(() => daw.moveInDaw({ head: at(3.6) }));
    expect(lit()).toBe('p-2:1');
  });
  it('picks up a DAW that is already playing when the page opens', async () => {
    mount();
    act(() => daw.moveInDaw({ playing: true, head: at(1.3) }));
    await wait(10);
    expect(lit()).toBe('p-1:3');
  });
  it('lets the DAW stay lit after the narrator stops it there', async () => {
    await ready();
    act(() => daw.moveInDaw({ playing: true, head: at(4.2) }));
    expect(state().playing).toBe(true);
    act(() => daw.moveInDaw({ playing: false }));
    expect(lit()).toBe('p-2:1');
    // The word stays, but nothing plays: the bar reads Play. The DAW playing again reads Pause.
    expect(state().playing).toBe(false);
    act(() => daw.moveInDaw({ playing: true, head: at(4.2) }));
    expect(state().playing).toBe(true);
  });
  it('does not light the word of a DAW that plays another project, whatever its heartbeat says: the transport event carries no project', async () => {
    // The lease is refused (another project is open), and the heartbeat transport still says the DAW plays at one word: it is the other project's play.
    mount(DAW_SETUPS.reaper, { daw: { transport: { playing: true, recording: false, position: at(1.3) } } });
    daw.openProject('other');
    await wait(LEASE_RENEW_MS + 10);
    expect(lit()).toBeNull();
  });
  it('ignores a DAW that has another project open', async () => {
    mount(DAW_SETUPS.reaper, { daw: {}, dawScript: 'different' });
    await wait(LEASE_RENEW_MS + 10);
    act(() => daw.moveInDaw({ cursor: at(1.3) }));
    expect(state().cursor).toBeNull();
    expect(calls('watch')).toHaveLength(0);
  });
  it('a play that turns into a recording ends the play: the bar reads Play and no new word lights', async () => {
    await ready();
    act(() => daw.moveInDaw({ playing: true, head: at(1.3) }));
    expect(state().playing).toBe(true);
    act(() => daw.moveInDaw({ playing: true, head: at(4.2), recording: true }));
    expect(state().playing).toBe(false);
    expect(lit()).toBe('p-1:3');
  });
  it('does not follow a DAW that is recording', async () => {
    await ready();
    act(() => daw.moveInDaw({ playing: true, head: at(1.3), recording: true }));
    expect(lit()).toBeNull();
  });
});

describe('app-to-daw', () => {
  it('puts the DAW cursor on a word the cursor lands on, once, and the echo does not come back as a move', async () => {
    await ready();
    act(() => page.dispatch({ type: 'place', key: 'p-2:1' }));
    await wait(200);
    expect(calls('cursor')).toEqual([{ action: 'cursor', seconds: at(t0('p-2:1')) }]);
    await wait(100);
    expect(state().cursor).toBe('p-2:1');
    await wait(ECHO_WINDOW_MS + 100);
    expect(calls('cursor')).toHaveLength(1);
  });
  it('puts the DAW cursor on the first word clicked after the DAW stopped, while its last word was still lit', async () => {
    await ready();
    act(() => daw.moveInDaw({ playing: true, head: at(4.2) }));
    act(() => daw.moveInDaw({ playing: false }));
    expect(state().playing).toBe(false);
    act(() => page.dispatch({ type: 'place', key: 'p-1:0' }));
    await wait(300);
    expect(lit()).toBeNull();
    expect(calls('cursor')).toEqual([{ action: 'cursor', seconds: at(t0('p-1:0')) }]);
  });
  it('does not write the DAW cursor while the DAW plays again at a second no word covers, though the old word is still held', async () => {
    await ready();
    act(() => daw.moveInDaw({ playing: true, head: at(4.2) }));
    act(() => daw.moveInDaw({ playing: false }));
    // Played again in the gap between two words: no word lights, so the hold stays.
    act(() => daw.moveInDaw({ playing: true, head: at(3.6) }));
    act(() => page.dispatch({ type: 'place', key: 'p-1:0' }));
    await wait(300);
    expect(calls('cursor')).toHaveLength(0);
  });
  it('selecting words while the DAW stopped with its last word lit does not start a play', async () => {
    await ready();
    act(() => daw.moveInDaw({ playing: true, head: at(4.2) }));
    act(() => daw.moveInDaw({ playing: false }));
    const before = daw.syncCalls().length;
    act(() => page.dispatch({ type: 'select', anchor: 'p-1:3', head: 'p-2:1' }));
    await wait(300);
    expect(daw.syncCalls().filter((c) => c.action !== 'cursor')).toHaveLength(before);
    expect(state().playing).toBe(false);
  });
  it('does not write back a cursor the DAW put there', async () => {
    await ready();
    act(() => daw.moveInDaw({ cursor: at(1.3) }));
    await wait(500);
    expect(calls('cursor')).toHaveLength(0);
  });
  it('sends only the last of a run of quick cursor moves', async () => {
    await ready();
    act(() => page.dispatch({ type: 'place', key: 'p-1:0' }));
    act(() => page.dispatch({ type: 'place', key: 'p-1:2' }));
    act(() => page.dispatch({ type: 'place', key: 'p-2:1' }));
    await wait(300);
    expect(calls('cursor')).toEqual([{ action: 'cursor', seconds: at(t0('p-2:1')) }]);
  });
  it('keeps a move the narrator makes in the DAW while its own write is on its way', async () => {
    await ready();
    act(() => page.dispatch({ type: 'place', key: 'p-2:1' }));
    act(() => daw.moveInDaw({ cursor: at(1.3) }));
    await wait(300);
    expect(state().cursor).toBe('p-1:3');
  });
  it('does not write a word that has no project time', async () => {
    mount();
    await wait(10);
    const quiet = doc.items.find((i) => i.t0 != null && i.t0 > 7.5);
    if (quiet) act(() => page.dispatch({ type: 'place', key: quiet.key }));
    await wait(300);
    expect(calls('cursor')).toHaveLength(0);
  });
});

describe('play-from-the-app-plays-through-the-daw', () => {
  it('starts the DAW at the word, keeps the app silent, and follows the DAW head', async () => {
    await ready();
    act(() => playback.playFrom(t0('p-2:1')));
    await wait(10);
    expect(calls('play')).toEqual([{ action: 'play', seconds: at(t0('p-2:1')), chapterId: 'chapter-1' }]);
    expect(audio.play).not.toHaveBeenCalled();
    expect(state().playing).toBe(true);
    act(() => daw.moveInDaw({ head: at(t0('p-2:3')) }));
    expect(lit()).toBe('p-2:3');
    expect(audio.play).not.toHaveBeenCalled();
  });
  it('stops both when the app stops', async () => {
    await ready();
    act(() => playback.playFrom(t0('p-2:1')));
    await wait(10);
    act(() => playback.stop());
    await wait(10);
    expect(calls('stop')).toHaveLength(1);
    expect(state().playing).toBe(false);
    expect(audio.pause).toHaveBeenCalled();
  });
  it('stops the DAW when the narrator stops a play the DAW started', async () => {
    await ready();
    act(() => daw.moveInDaw({ playing: true, head: at(1.3) }));
    act(() => playback.toggle());
    await wait(10);
    expect(calls('stop')).toHaveLength(1);
  });
  it('stops the app when the narrator stops the DAW', async () => {
    await ready();
    act(() => playback.playFrom(t0('p-2:1')));
    await wait(10);
    act(() => daw.moveInDaw({ playing: false }));
    expect(state().playing).toBe(false);
    expect(calls('stop')).toHaveLength(0);
  });
  // Changed from "stops the DAW at the end of a selection" (#2251 item 22): the DAW is told the whole stretch and stops itself at its end, so the page
  // sends no stop of its own and the end does not wait on a position stream and a round trip.
  it('plays a selection as one stretch the DAW stops itself at, and sends no stop of its own', async () => {
    await ready();
    act(() => playback.playFrom(t0('p-1:3'), t0('p-2:1')));
    await wait(10);
    expect(calls('play')).toHaveLength(0);
    expect(calls('playRange').every((c) => c.chapterId === 'chapter-1')).toBe(true); // the DAW plays that chapter's linked track, not the selected one
    expect(calls('playRange').map(({ seconds, until }) => [seconds, until])).toEqual([[at(t0('p-1:3')), expect.closeTo(at(t0('p-2:1')), 2)]]);
    act(() => daw.moveInDaw({ head: at(t0('p-2:1')) + 0.05 }));
    await wait(10);
    expect(calls('stop')).toHaveLength(0);
    expect(state().playing).toBe(false);
  });
  it('ends a stretch the DAW stopped itself at as the end of the play: the selection stays, the cursor does not jump', async () => {
    await ready();
    act(() => page.dispatch({ type: 'place', key: 'p-1:3' }));
    const before = state().cursor;
    act(() => playback.playFrom(t0('p-1:3'), t0('p-2:1')));
    await wait(10);
    act(() => daw.moveInDaw({ head: at(t0('p-2:1')) + 0.05 }));
    await wait(10);
    expect(state().playing).toBe(false);
    expect(state().cursor).toBe(before);
  });
  it('carries a stretch that ends past the last word of a paragraph, on its tail, to the DAW', async () => {
    await ready();
    // Half a second past the last word the project plays: the tail of its sound, carried on at the word's own rate.
    const lastEnd = Math.max(...doc.items.filter((i) => i.kind === 'w' && i.t1 != null && i.t1 <= 8).map((i) => i.t1 as number));
    act(() => playback.playFrom(t0('p-1:3'), lastEnd + 0.5));
    await wait(10);
    expect(calls('playRange')[0].until).toBeCloseTo(at(lastEnd + 0.5), 2);
  });
  it('stops the page when the narrator stops the DAW in the middle of a stretch, without asking the DAW to stop', async () => {
    await ready();
    act(() => playback.playFrom(t0('p-1:3'), t0('p-2:1')));
    await wait(10);
    act(() => daw.moveInDaw({ playing: false }));
    expect(state().playing).toBe(false);
    expect(calls('stop')).toHaveLength(0);
  });
  it('stops the DAW when the app stops in the middle of a stretch', async () => {
    await ready();
    act(() => playback.playFrom(t0('p-1:3'), t0('p-2:1')));
    await wait(10);
    act(() => playback.stop());
    await wait(10);
    expect(calls('stop')).toHaveLength(1);
  });
  it('stops the DAW at the end of the chapter', async () => {
    await ready();
    act(() => playback.playFrom(t0('p-2:1')));
    await wait(10);
    act(() => daw.moveInDaw({ head: at(8) + 0.01 }));
    await wait(10);
    expect(calls('stop')).toHaveLength(1);
    expect(state().playing).toBe(false);
  });
  // Changed by the owner's decision on #2251 item 32 ("we should play something"): a refusal falls back to the app with a notice.
  it('plays the app from the same word, and says why, when the DAW refuses the play', async () => {
    await ready();
    daw.refuseNextSync('REAPER could not start.');
    act(() => playback.playFrom(t0('p-2:1')));
    await wait(10);
    expect(audio.play).toHaveBeenCalled();
    expect(audio.currentTime).toBeCloseTo(10 + t0('p-2:1'));
    expect(state().playing).toBe(true);
    expect(notices.join(' ')).toContain('REAPER could not play it: REAPER could not start.');
    expect(notices.join(' ')).toContain(FELL_BACK);
  });
  it('asks the DAW for nothing and plays the app when the word has no project time', async () => {
    mount(DAW_SETUPS.reaper, undefined, NO_CLOCK);
    await wait(10);
    act(() => playback.playFrom(t0('p-2:1')));
    await wait(10);
    expect(calls('play')).toHaveLength(0);
    expect(audio.play).toHaveBeenCalled();
    expect(notices.join(' ')).toMatch(/not in REAPER's project now.*Played in the app instead\./);
  });
  // The owner's report: a chapter whose audio starts at 0:00 of the project played in the app, saying the part was not in REAPER's project.
  it('plays a section of an item that sits at project second 0 in the DAW, not the app', async () => {
    mount(DAW_SETUPS.reaper, undefined, ZERO_CLOCK);
    await wait(10);
    act(() => playback.playFrom(t0('p-2:1'), t0('p-2:3')));
    await wait(10);
    expect(calls('playRange')).toHaveLength(1);
    expect(calls('playRange')[0].seconds).toBeCloseTo(t0('p-2:1') / 2, 2);
    expect(audio.play).not.toHaveBeenCalled();
    expect(notices.join(' ')).not.toMatch(/not in/);
  });
  it('keeps the room quiet while the DAW records: nothing plays, in the DAW or the app', async () => {
    await ready(DAW_SETUPS.reaper, { daw: { transport: { playing: true, recording: true, position: 100 } } });
    daw.refuseNextSync('REAPER is recording. Stop recording first.');
    act(() => playback.playFrom(t0('p-2:1')));
    await wait(10);
    expect(audio.play).not.toHaveBeenCalled();
    expect(state().playing).toBe(false);
    expect(notices.join(' ')).toMatch(/REAPER is recording, so nothing plays/);
  });
  it('a stop while the DAW is asked plays nothing in the app when the DAW then refuses', async () => {
    await ready();
    daw.refuseNextSync('REAPER could not start.');
    act(() => {
      playback.playFrom(t0('p-2:1'));
      playback.stop();
    });
    await wait(10);
    expect(audio.play).not.toHaveBeenCalled();
    expect(state().playing).toBe(false);
    expect(notices).toEqual([]);
  });
  it('stops playing and says so when the DAW goes quiet mid-play', async () => {
    await ready();
    act(() => playback.playFrom(t0('p-2:1')));
    await wait(10);
    act(() => daw.dropEvents(true));
    await wait(SILENT_MS + 1500);
    expect(state().playing).toBe(false);
    expect(notices.join(' ')).toMatch(/stopped answering/i);
  });
  it('stops a play that was started and cancelled before the DAW answered', async () => {
    await ready();
    act(() => {
      playback.playFrom(t0('p-2:1'));
      playback.stop();
    });
    await wait(10);
    expect(calls('stop').length).toBeGreaterThanOrEqual(1);
    expect(state().playing).toBe(false);
  });
});

/** A DAW whose bridge answers in order and can be held: the held calls run, one after the other, when `release` is called (#4127). */
function heldBridge() {
  const api = createMockApi({}, { daw: {} });
  const real = api.dawTransportSync.bind(api) as (...a: unknown[]) => Promise<never>;
  const queue: Array<() => void> = [];
  let tail: Promise<unknown> = Promise.resolve();
  let holding = true;
  const held = new Set(['play', 'playRange', 'stop']);
  api.dawTransportSync = ((action: string, ...rest: unknown[]) => {
    if (!holding || !held.has(action)) return real(action, ...rest);
    return new Promise((resolve, reject) => {
      queue.push(() => {
        tail = tail.then(() => real(action, ...rest)).then(resolve, reject);
      });
    });
  }) as typeof api.dawTransportSync;
  daw = window.__NARRATION_MOCK_DAW__ as DawMockControl;
  render(
    <ApiProvider api={api}>
      <EditingPageProvider doc={doc}>
        <Harness caps={DAW_SETUPS.reaper} />
      </EditingPageProvider>
    </ApiProvider>,
  );
  return {
    /** Answers every held call, in the order asked, and the ones asked after. */
    release: async () => {
      holding = false;
      for (const run of queue.splice(0)) run();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10);
      });
    },
  };
}

describe('script-transport-races (#4127)', () => {
  it('a newer play the DAW refuses stops the DAWs older play before the app plays', async () => {
    await ready();
    act(() => playback.playFrom(t0('p-2:1')));
    await wait(10);
    expect(state().playing).toBe(true);
    let stopsWhenAppPlayed = -1;
    audio.play.mockImplementation(() => {
      stopsWhenAppPlayed = calls('stop').length;
      return Promise.resolve();
    });
    act(() => daw.refuseNextSync('REAPER would not play it'));
    act(() => playback.playFrom(t0('p-2:3'), t0('p-2:5')));
    await wait(10);
    expect(audio.play).toHaveBeenCalled();
    expect(calls('stop')).toHaveLength(1);
    expect(stopsWhenAppPlayed).toBe(1);
  });
  it('a newer play that goes to the app because its word has no place in the DAW stops the DAWs older play first', async () => {
    const api = createMockApi({}, { daw: {} });
    daw = window.__NARRATION_MOCK_DAW__ as DawMockControl;
    const tree = (clock: WordClock) => (
      <ApiProvider api={api}>
        <EditingPageProvider doc={doc}>
          <Harness caps={DAW_SETUPS.reaper} clock={clock} />
        </EditingPageProvider>
      </ApiProvider>
    );
    const view = render(tree(CLOCK));
    await wait(10);
    act(() => playback.playFrom(t0('p-2:1')));
    await wait(10);
    expect(state().playing).toBe(true);
    let stopsWhenAppPlayed = -1;
    audio.play.mockImplementation(() => {
      stopsWhenAppPlayed = calls('stop').length;
      return Promise.resolve();
    });
    // The word is no longer placed in the DAW's project: the DAW is never asked, and the app plays.
    view.rerender(tree(NO_CLOCK));
    act(() => playback.playFrom(t0('p-2:3')));
    await wait(10);
    expect(calls('play')).toHaveLength(1);
    expect(audio.play).toHaveBeenCalled();
    expect(stopsWhenAppPlayed).toBe(1);
  });
  it('a newer play that neither the DAW nor the app can play stops the DAWs older play', async () => {
    const api = createMockApi({}, { daw: {} });
    daw = window.__NARRATION_MOCK_DAW__ as DawMockControl;
    const tree = (clock: WordClock) => (
      <ApiProvider api={api}>
        <EditingPageProvider doc={doc}>
          <Harness caps={DAW_SETUPS.reaper} clock={clock} />
        </EditingPageProvider>
      </ApiProvider>
    );
    const view = render(tree(CLOCK));
    await wait(10);
    act(() => playback.playFrom(t0('p-2:1')));
    await wait(10);
    view.rerender(tree(NO_CLOCK));
    // A second past the recorded files: no DAW place, no recording.
    act(() => playback.playFrom(60));
    await wait(10);
    expect(audio.play).not.toHaveBeenCalled();
    expect(calls('stop')).toHaveLength(1);
    expect(state().playing).toBe(false);
  });
  it('a narrator Stop in the DAW heard while a play is being answered ends that play once the answer comes (the DAW applied it at once)', async () => {
    const api = createMockApi({}, { daw: {} });
    const real = api.dawTransportSync.bind(api) as (...a: unknown[]) => Promise<never>;
    let release: () => void = () => {};
    const answered = new Promise<void>((resolve) => (release = resolve));
    api.dawTransportSync = ((action: string, ...rest: unknown[]) => {
      // The DAW plays at once; only its answer is held.
      if (action === 'play' || action === 'playRange') return real(action, ...rest).then(async (result) => (await answered, result));
      return real(action, ...rest);
    }) as typeof api.dawTransportSync;
    daw = window.__NARRATION_MOCK_DAW__ as DawMockControl;
    render(
      <ApiProvider api={api}>
        <EditingPageProvider doc={doc}>
          <Harness caps={DAW_SETUPS.reaper} />
        </EditingPageProvider>
      </ApiProvider>,
    );
    await wait(10);
    act(() => playback.playFrom(t0('p-2:1')));
    await wait(300);
    act(() => daw.moveInDaw({ playing: false }));
    await wait(300);
    release();
    await wait(SILENT_MS + 2000);
    expect(state().playing).toBe(false);
  });
  it('a play started in the DAW is ignored for 2 s after the page stopped a late answer, then followed', async () => {
    const bridge = heldBridge();
    await wait(10);
    act(() => playback.playFrom(t0('p-2:1')));
    act(() => playback.stop());
    await bridge.release();
    await wait(10);
    act(() => daw.moveInDaw({ playing: true, head: at(t0('p-2:3')) }));
    await wait(300);
    expect(state().playT).toBeNull();
    await wait(2000);
    act(() => daw.moveInDaw({ playing: true, head: at(t0('p-2:3')) + 0.1 }));
    await wait(300);
    expect(state().playT).not.toBeNull();
  });
  it('a play the DAW ended by itself leaves nothing for a later refused play to stop', async () => {
    await ready();
    act(() => playback.playFrom(t0('p-2:1'), t0('p-2:3')));
    await wait(10);
    // The DAW stops itself at the end of the stretch.
    act(() => daw.moveInDaw({ head: at(t0('p-2:3')) + 1 }));
    await wait(600);
    expect(state().playing).toBe(false);
    const stops = calls('stop').length;
    act(() => daw.refuseNextSync('REAPER would not play it'));
    act(() => playback.playFrom(t0('p-2:1')));
    await wait(10);
    expect(audio.play).toHaveBeenCalled();
    expect(calls('stop')).toHaveLength(stops);
  });
  it('a stop reading from the pages own earlier stop does not end a newer play still being asked', async () => {
    await wait(0);
    const bridge = heldBridge();
    await wait(10);
    act(() => playback.playFrom(t0('p-2:1')));
    act(() => playback.stop());
    act(() => playback.playFrom(t0('p-2:3')));
    await bridge.release();
    await wait(10);
    expect(state().playing).toBe(true);
    expect(notices).toEqual([]);
    expect(calls('stop')).toHaveLength(1);
  });
  it('a play stopped because it was answered after the page stopped leaves the bar on Play', async () => {
    const bridge = heldBridge();
    await wait(10);
    act(() => playback.playFrom(t0('p-2:1')));
    act(() => playback.stop());
    await bridge.release();
    await wait(10);
    expect(state().playT).toBeNull();
    expect(state().playing).toBe(false);
  });
  it('a play stopped because it was answered after the page gave it up leaves the bar on Play', async () => {
    const bridge = heldBridge();
    await wait(10);
    act(() => playback.playFrom(t0('p-2:1')));
    act(() => daw.dropEvents(true));
    await wait(15_000);
    expect(notices.join(' ')).toMatch(/stopped answering/);
    act(() => daw.dropEvents(false));
    await bridge.release();
    await wait(10);
    expect(state().playT).toBeNull();
    expect(state().playing).toBe(false);
  });
});

describe('a-linked-daw-that-cannot-play-hands-the-play-to-the-app', () => {
  // Changed by the owner's decision on #2251 item 32: a DAW that cannot play now no longer means silence; the app plays with a notice.
  it.each([
    ['a DAW that is not running', DAW_SETUPS['reaper-off'], /REAPER is not answering/],
    [
      'a DAW whose transport could not be read',
      {
        ...DAW_SETUPS.reaper,
        capabilities: {
          ...DAW_SETUPS.reaper.capabilities,
          transport_sync: { level: 'experimental', available: false, reason: 'failed', message: 'REAPER could not report its transport.' },
        },
      } satisfies DawCapabilities,
      /REAPER could not report its transport/,
    ],
  ])('with %s, asks it for nothing, plays the app and says why', async (_, caps, why) => {
    await ready(caps);
    act(() => playback.playFrom(t0('p-2:1')));
    await wait(10);
    expect(audio.play).toHaveBeenCalled();
    expect(calls('play')).toHaveLength(0);
    expect(state().playing).toBe(true);
    expect(notices.join(' ')).toMatch(why);
    expect(notices.join(' ')).toContain(FELL_BACK);
  });
  // #4111: the "is the DAW recording" read in front of the app's play is bounded: one that never answers must not leave the click without sound or a word.
  it('plays the app after 3 s when the DAW cannot play and its project-state read never answers', async () => {
    const api = createMockApi({}, { daw: {} });
    api.dawProjectState = (() => new Promise(() => {})) as typeof api.dawProjectState;
    daw = window.__NARRATION_MOCK_DAW__ as DawMockControl;
    render(
      <ApiProvider api={api}>
        <EditingPageProvider doc={doc}>
          <Harness caps={DAW_SETUPS['reaper-off']} />
        </EditingPageProvider>
      </ApiProvider>,
    );
    await wait(10);
    act(() => playback.playFrom(t0('p-2:1')));
    await wait(1000);
    expect(audio.play).not.toHaveBeenCalled();
    await wait(PLAY_DEADLINE_MS);
    expect(audio.play).toHaveBeenCalled();
    expect(notices.join(' ')).toContain(FELL_BACK);
  });
  it('plays the app when the DAW has another project open, and says so', async () => {
    mount();
    daw.openProject('other');
    await wait(10);
    act(() => playback.playFrom(t0('p-2:1')));
    await wait(10);
    expect(calls('play')).toHaveLength(0);
    expect(audio.play).toHaveBeenCalled();
    expect(notices.join(' ')).toMatch(/does not have this book's project open/);
    expect(notices.join(' ')).toContain(FELL_BACK);
  });
  it('plays the app at once before the DAW has answered what it can do, and says the DAW has not answered: no capability read, no check (#4043)', async () => {
    const api = createMockApi({}, { daw: {} });
    daw = window.__NARRATION_MOCK_DAW__ as DawMockControl;
    const reads = vi.spyOn(api, 'dawCapabilities');
    // As in the app: with no capabilities there is no word table to place the words with.
    render(
      <ApiProvider api={api}>
        <EditingPageProvider doc={doc}>
          <Harness caps={null} clock={null} />
        </EditingPageProvider>
      </ApiProvider>,
    );
    await wait(10);
    const before = reads.mock.calls.length;
    act(() => playback.playFrom(t0('p-2:1')));
    await wait(10);
    expect(reads.mock.calls.length).toBe(before);
    expect(audio.play).toHaveBeenCalled();
    expect(notices.join(' ')).toMatch(/has not answered yet/);
    expect(notices.join(' ')).not.toMatch(/checking/i);
  });
  it('plays at once with the link and the word time held, whatever the watch lease says: no check stands between the click and the play (#4043)', async () => {
    // The lease is never answered, as a REAPER busy with another command leaves it.
    const api = createMockApi({}, { daw: {} });
    const real = api.dawTransportSync.bind(api);
    api.dawTransportSync = ((action: string, ...rest: unknown[]) =>
      action === 'watch' ? new Promise(() => {}) : (real as (...a: unknown[]) => unknown)(action, ...rest)) as typeof api.dawTransportSync;
    daw = window.__NARRATION_MOCK_DAW__ as DawMockControl;
    render(
      <ApiProvider api={api}>
        <EditingPageProvider doc={doc}>
          <Harness caps={DAW_SETUPS.reaper} />
        </EditingPageProvider>
      </ApiProvider>,
    );
    act(() => playback.playFrom(t0('p-2:1')));
    await wait(10);
    expect(calls('play')).toHaveLength(1);
    expect(calls('play')[0]).toMatchObject({ seconds: at(t0('p-2:1')) });
    expect(audio.play).not.toHaveBeenCalled();
    expect(notices).toEqual([]);
  });
  it('a play that did nothing says why and offers Retry, which plays once the DAW can (#4043)', async () => {
    await ready();
    act(() => daw.startInDaw());
    await wait(10);
    daw.refuseNextSync('REAPER is recording. Stop recording first.');
    act(() => playback.playFrom(t0('p-2:1')));
    await wait(10);
    // The DAW was asked and refused (it is recording), and the app stays quiet too: nothing plays.
    expect(audio.play).not.toHaveBeenCalled();
    expect(notices.join(' ')).toMatch(/recording/i);
    expect(retries).toHaveLength(1);
    const asked = calls('play').length;
    act(() => daw.endTakeInDaw());
    await wait(10);
    act(() => retries[0]!());
    await wait(10);
    expect(calls('play').length).toBe(asked + 1);
    expect(calls('play').at(-1)).toMatchObject({ seconds: at(t0('p-2:1')) });
  });
  it('a Retry offered for an older play does nothing once a newer one was asked', async () => {
    await ready();
    act(() => daw.startInDaw());
    await wait(10);
    daw.refuseNextSync('REAPER is recording. Stop recording first.');
    act(() => playback.playFrom(t0('p-2:1')));
    await wait(10);
    expect(retries).toHaveLength(1);
    act(() => daw.endTakeInDaw());
    await wait(10);
    act(() => playback.playFrom(t0('p-1:3')));
    await wait(10);
    const asked = calls('play').length;
    act(() => retries[0]!());
    await wait(10);
    expect(calls('play').length).toBe(asked);
  });
  it('a Retry pressed after the page was left plays nothing', async () => {
    await ready();
    act(() => daw.startInDaw());
    await wait(10);
    daw.refuseNextSync('REAPER is recording. Stop recording first.');
    act(() => playback.playFrom(t0('p-2:1')));
    await wait(10);
    expect(retries).toHaveLength(1);
    cleanup();
    const asked = calls('play').length;
    retries[0]!();
    await wait(10);
    expect(calls('play').length).toBe(asked);
  });
  it('a play asked before the watch lease was answered, never followed by a position, is stopped with the DAW and says so', async () => {
    const api = createMockApi({}, { daw: {} });
    const real = api.dawTransportSync.bind(api);
    api.dawTransportSync = ((action: string, ...rest: unknown[]) =>
      action === 'watch' ? new Promise(() => {}) : (real as (...a: unknown[]) => unknown)(action, ...rest)) as typeof api.dawTransportSync;
    daw = window.__NARRATION_MOCK_DAW__ as DawMockControl;
    render(
      <ApiProvider api={api}>
        <EditingPageProvider doc={doc}>
          <Harness caps={DAW_SETUPS.reaper} />
        </EditingPageProvider>
      </ApiProvider>,
    );
    act(() => playback.playFrom(t0('p-2:1')));
    await wait(10);
    expect(state().playing).toBe(true);
    await wait(12_000);
    expect(state().playing).toBe(false);
    expect(notices.join(' ')).toMatch(/could not follow the DAW/);
    expect(calls('stop').length).toBeGreaterThan(0);
  });
  it('a play the page already reported lost never falls back to the app when its late refusal arrives, and the notice offers Retry', async () => {
    const api = createMockApi({}, { daw: {} });
    const real = api.dawTransportSync.bind(api);
    let answerPlay: (r: { ok: boolean; message: string }) => void = () => {};
    api.dawTransportSync = ((action: string, ...rest: unknown[]) => {
      // The watch is never answered and the play is held: the DAW link has stalled.
      if (action === 'watch') return new Promise(() => {});
      if (action === 'play') return new Promise((resolve) => (answerPlay = resolve as typeof answerPlay));
      return (real as (...a: unknown[]) => unknown)(action, ...rest);
    }) as typeof api.dawTransportSync;
    daw = window.__NARRATION_MOCK_DAW__ as DawMockControl;
    render(
      <ApiProvider api={api}>
        <EditingPageProvider doc={doc}>
          <Harness caps={DAW_SETUPS.reaper} />
        </EditingPageProvider>
      </ApiProvider>,
    );
    await wait(10);
    act(() => playback.playFrom(t0('p-2:1')));
    await wait(15_000);
    expect(notices.join(' ')).toMatch(/could not follow the DAW/);
    expect(retries.length).toBeGreaterThan(0);
    // The DAW's refusal comes after the page gave the play up: the app does not take it over.
    await act(async () => answerPlay({ ok: false, message: 'late refusal' }));
    await wait(10);
    expect(audio.play).not.toHaveBeenCalled();
    expect(state().playing).toBe(false);
  });
  // #4111: the script keeps its own unwatched limits as its deadline (a play answered up to 9 s late still counts, a stalled DAW is said at 10 s with Retry); what a
  // play answered after the page gave it up does is the shared rule: the DAW is stopped, and a stop that fails says where to stop it.
  it.each([
    ['is stopped', undefined, undefined],
    ['is stopped, and a refused stop says where to stop it', { ok: false, message: 'REAPER would not stop' }, 'REAPER would not stop. Stop it in REAPER.'],
  ] as const)('a play the page already reported lost whose answer then comes (ok) %s', async (_name, stopAnswer, sentence) => {
    const api = createMockApi({}, { daw: {} });
    const real = api.dawTransportSync.bind(api);
    let answerPlay: (r: { ok: boolean; message: string }) => void = () => {};
    const actions: string[] = [];
    api.dawTransportSync = ((action: string, ...rest: unknown[]) => {
      actions.push(action);
      if (action === 'watch') return new Promise(() => {});
      if (action === 'play') return new Promise((resolve) => (answerPlay = resolve as typeof answerPlay));
      if (action === 'stop' && stopAnswer) return Promise.resolve(stopAnswer);
      return (real as (...a: unknown[]) => unknown)(action, ...rest);
    }) as typeof api.dawTransportSync;
    daw = window.__NARRATION_MOCK_DAW__ as DawMockControl;
    render(
      <ApiProvider api={api}>
        <EditingPageProvider doc={doc}>
          <Harness caps={DAW_SETUPS.reaper} />
        </EditingPageProvider>
      </ApiProvider>,
    );
    await wait(10);
    act(() => playback.playFrom(t0('p-2:1')));
    await wait(15_000);
    expect(notices.join(' ')).toMatch(/could not follow the DAW/);
    const stopsBefore = actions.filter((x) => x === 'stop').length;
    await act(async () => answerPlay({ ok: true, message: '' }));
    await wait(10);
    expect(actions.filter((x) => x === 'stop').length).toBeGreaterThan(stopsBefore);
    if (sentence) expect(notices.at(-1)).toBe(sentence);
  });
  it('a play answered while a newer play of the page is asked is stopped when that newer play is refused (the older one is not left beside the app)', async () => {
    const api = createMockApi({}, { daw: {} });
    const real = api.dawTransportSync.bind(api);
    const answers: ((r: { ok: boolean; message: string }) => void)[] = [];
    const actions: string[] = [];
    api.dawTransportSync = ((action: string, ...rest: unknown[]) => {
      actions.push(action);
      if (action === 'watch') return new Promise(() => {});
      if (action === 'play') return new Promise((resolve) => answers.push(resolve as (r: { ok: boolean; message: string }) => void));
      return (real as (...a: unknown[]) => unknown)(action, ...rest);
    }) as typeof api.dawTransportSync;
    daw = window.__NARRATION_MOCK_DAW__ as DawMockControl;
    render(
      <ApiProvider api={api}>
        <EditingPageProvider doc={doc}>
          <Harness caps={DAW_SETUPS.reaper} />
        </EditingPageProvider>
      </ApiProvider>,
    );
    await wait(10);
    act(() => playback.playFrom(t0('p-2:1')));
    await wait(10);
    act(() => playback.playFrom(t0('p-2:1')));
    await wait(10);
    expect(answers).toHaveLength(2);
    await act(async () => answers[0]!({ ok: true, message: '' }));
    await wait(10);
    const stopsBefore = actions.filter((x) => x === 'stop').length;
    await act(async () => answers[1]!({ ok: false, message: 'refused' }));
    await wait(10);
    expect(actions.filter((x) => x === 'stop').length).toBeGreaterThan(stopsBefore);
  });
  it('a stretch played before the watch lease was answered ends where the stretch does: the page does not say the DAW stopped answering', async () => {
    const api = createMockApi({}, { daw: {} });
    const real = api.dawTransportSync.bind(api);
    api.dawTransportSync = ((action: string, ...rest: unknown[]) =>
      action === 'watch' ? new Promise(() => {}) : (real as (...a: unknown[]) => unknown)(action, ...rest)) as typeof api.dawTransportSync;
    daw = window.__NARRATION_MOCK_DAW__ as DawMockControl;
    render(
      <ApiProvider api={api}>
        <EditingPageProvider doc={doc}>
          <Harness caps={DAW_SETUPS.reaper} />
        </EditingPageProvider>
      </ApiProvider>,
    );
    act(() => playback.playFrom(t0('p-2:1'), t0('p-2:1') + 0.4));
    await wait(10);
    expect(calls('playRange')).toHaveLength(1);
    expect(state().playing).toBe(true);
    // The stretch is 0.4 s of the chapter: the page's play ends with it (length plus a second and a half), not at the ten-second limit, and the DAW is not stopped.
    await wait(3_000);
    expect(state().playing).toBe(false);
    await wait(10_000);
    expect(notices).toEqual([]);
    expect(calls('stop')).toHaveLength(0);
  });
  it('a stretch whose play the DAW answers late is not ended before it was accepted', async () => {
    const api = createMockApi({}, { daw: {} });
    const real = api.dawTransportSync.bind(api);
    api.dawTransportSync = ((action: string, ...rest: unknown[]) => {
      if (action === 'watch') return new Promise(() => {});
      if (action === 'playRange')
        return new Promise((resolve) => setTimeout(() => resolve((real as (...a: unknown[]) => unknown)(action, ...rest) as never), 3000));
      return (real as (...a: unknown[]) => unknown)(action, ...rest);
    }) as typeof api.dawTransportSync;
    daw = window.__NARRATION_MOCK_DAW__ as DawMockControl;
    render(
      <ApiProvider api={api}>
        <EditingPageProvider doc={doc}>
          <Harness caps={DAW_SETUPS.reaper} />
        </EditingPageProvider>
      </ApiProvider>,
    );
    act(() => playback.playFrom(t0('p-2:1'), t0('p-2:1') + 0.4));
    await wait(2_500);
    // Not yet accepted: the page still shows the play, and nothing was stopped.
    expect(state().playing).toBe(true);
    expect(calls('stop')).toHaveLength(0);
    await wait(500 + 3_000);
    expect(state().playing).toBe(false);
    expect(calls('stop')).toHaveLength(0);
  });
  it('an open play whose answer comes late is given the whole unwatched limit from the answer, not from the ask', async () => {
    const api = createMockApi({}, { daw: {} });
    const real = api.dawTransportSync.bind(api);
    api.dawTransportSync = ((action: string, ...rest: unknown[]) => {
      if (action === 'watch') return new Promise(() => {});
      if (action === 'play') return new Promise((resolve) => setTimeout(() => resolve((real as (...a: unknown[]) => unknown)(action, ...rest) as never), 9000));
      return (real as (...a: unknown[]) => unknown)(action, ...rest);
    }) as typeof api.dawTransportSync;
    daw = window.__NARRATION_MOCK_DAW__ as DawMockControl;
    render(
      <ApiProvider api={api}>
        <EditingPageProvider doc={doc}>
          <Harness caps={DAW_SETUPS.reaper} />
        </EditingPageProvider>
      </ApiProvider>,
    );
    act(() => playback.playFrom(t0('p-2:1')));
    await wait(12_000);
    // Accepted at 9 s: the page has waited three seconds for a position, not twelve.
    expect(state().playing).toBe(true);
    expect(notices).toEqual([]);
  });
  it('a slow answer to an older stretch does not start the clock of a newer one that is still being asked', async () => {
    const api = createMockApi({}, { daw: {} });
    const real = api.dawTransportSync.bind(api);
    let asked = 0;
    api.dawTransportSync = ((action: string, ...rest: unknown[]) => {
      if (action === 'watch') return new Promise(() => {});
      if (action === 'playRange') {
        const delay = ++asked === 1 ? 3000 : 5000;
        return new Promise((resolve) => setTimeout(() => resolve((real as (...a: unknown[]) => unknown)(action, ...rest) as never), delay));
      }
      return (real as (...a: unknown[]) => unknown)(action, ...rest);
    }) as typeof api.dawTransportSync;
    daw = window.__NARRATION_MOCK_DAW__ as DawMockControl;
    render(
      <ApiProvider api={api}>
        <EditingPageProvider doc={doc}>
          <Harness caps={DAW_SETUPS.reaper} />
        </EditingPageProvider>
      </ApiProvider>,
    );
    act(() => playback.playFrom(t0('p-2:1'), t0('p-2:1') + 0.4));
    await wait(1_000);
    act(() => playback.playFrom(t0('p-2:1'), t0('p-2:1') + 0.4));
    // The second stretch is asked at 1 s and answered at 6 s; the first is answered at 3 s, in between.
    await wait(4_400);
    expect(state().playing).toBe(true);
    // The first stretch's late answer is not a stop of the newer one: no stop reaches the DAW behind the second play.
    expect(calls('stop')).toHaveLength(0);
  });
  it('an error from the file of an earlier app play does not end the DAW play that took over from it', async () => {
    const api = createMockApi({}, { daw: {} });
    daw = window.__NARRATION_MOCK_DAW__ as DawMockControl;
    const tree = (clock: WordClock | null) => (
      <ApiProvider api={api}>
        <EditingPageProvider doc={doc}>
          <Harness caps={DAW_SETUPS.reaper} clock={clock} />
        </EditingPageProvider>
      </ApiProvider>
    );
    const view = render(tree(null));
    await wait(10);
    act(() => playback.playFrom(t0('p-1:3')));
    await wait(10);
    expect(audio.play).toHaveBeenCalled();
    // The word table arrives and the narrator skips: the DAW plays it, and the old file's late error comes after.
    view.rerender(tree(CLOCK));
    await wait(10);
    act(() => playback.skip(1));
    await wait(10);
    expect(calls('play')).toHaveLength(1);
    act(() => {
      audio.dispatchEvent(new Event('error'));
    });
    await wait(10);
    expect(notices.join(' ')).not.toMatch(/couldn't be played/);
    expect(state().playing).toBe(true);
  });
  it('an error from the audio element does not end a play the DAW plays', async () => {
    await ready();
    act(() => playback.playFrom(t0('p-2:1')));
    await wait(10);
    expect(calls('play')).toHaveLength(1);
    act(() => {
      audio.dispatchEvent(new Event('error'));
    });
    await wait(10);
    expect(notices).toEqual([]);
    expect(state().playing).toBe(true);
  });
  it('a play still being asked of the DAW when the page is left is not handed to the app by its late refusal', async () => {
    const api = createMockApi({}, { daw: {} });
    const real = api.dawTransportSync.bind(api);
    let answerPlay: (r: { ok: boolean; message: string }) => void = () => {};
    api.dawTransportSync = ((action: string, ...rest: unknown[]) =>
      action === 'play'
        ? new Promise((resolve) => (answerPlay = resolve as typeof answerPlay))
        : (real as (...a: unknown[]) => unknown)(action, ...rest)) as typeof api.dawTransportSync;
    daw = window.__NARRATION_MOCK_DAW__ as DawMockControl;
    const view = render(
      <ApiProvider api={api}>
        <EditingPageProvider doc={doc}>
          <Harness caps={DAW_SETUPS.reaper} />
        </EditingPageProvider>
      </ApiProvider>,
    );
    await wait(10);
    act(() => playback.playFrom(t0('p-2:1')));
    await wait(10);
    view.unmount();
    await act(async () => answerPlay({ ok: false, message: 'late refusal' }));
    await wait(10);
    expect(audio.play).not.toHaveBeenCalled();
  });
  it('a Retry of a stretch plays the same stretch and turns following back on', async () => {
    await ready();
    act(() => daw.startInDaw());
    await wait(10);
    daw.refuseNextSync('REAPER is recording. Stop recording first.');
    act(() => playback.playFrom(t0('p-2:1'), t0('p-2:1') + 0.4));
    await wait(10);
    expect(retries).toHaveLength(1);
    const asked = calls('playRange').length;
    act(() => playback.setFollow(false));
    act(() => daw.endTakeInDaw());
    await wait(10);
    act(() => retries[0]!());
    await wait(10);
    expect(calls('playRange')).toHaveLength(asked + 1);
    // The same stretch: from the word's second to the end of its 0.4 s.
    expect(calls('playRange').at(-1)).toMatchObject({ seconds: at(t0('p-2:1')) });
    expect(calls('playRange').at(-1)).toMatchObject({ until: expect.closeTo(at(t0('p-2:1') + 0.4), 3) });
    expect(state().follow).toBe(true);
  });
  it('the default notice offers Retry on the chapter-wide topic, and Retry plays the same second', async () => {
    const toast = vi.spyOn(overlay, 'toast');
    const api = createMockApi({}, { daw: {} });
    daw = window.__NARRATION_MOCK_DAW__ as DawMockControl;
    function Plain() {
      page = useEditingPage();
      playback = useScriptPlayback({
        playlist: PLAYLIST,
        mediaUrl: (f) => f,
        sync: { clock: CLOCK, clockPending: false, caps: DAW_SETUPS.reaper, chapterId: 'chapter-1' },
      });
      return <ScriptDoc />;
    }
    render(
      <ApiProvider api={api}>
        <EditingPageProvider doc={doc}>
          <Plain />
        </EditingPageProvider>
      </ApiProvider>,
    );
    await wait(10);
    act(() => daw.startInDaw());
    await wait(10);
    daw.refuseNextSync('REAPER is recording. Stop recording first.');
    act(() => playback.playFrom(t0('p-2:1')));
    await wait(10);
    const call = toast.mock.calls.find(([, options]) => options?.action?.label === 'Retry');
    expect(call?.[1]).toMatchObject({ tone: 'error', topic: 'editing-play-retry' });
    act(() => daw.endTakeInDaw());
    await wait(10);
    const asked = calls('play').length;
    act(() => call![1]!.action!.onAction());
    await wait(10);
    expect(calls('play').length).toBe(asked + 1);
  });
  it('a newer play withdraws the Retry offered for an older one', async () => {
    await ready();
    const dismissed = vi.spyOn(overlay, 'dismissTopic');
    act(() => playback.playFrom(t0('p-2:1')));
    await wait(10);
    expect(dismissed).toHaveBeenCalledWith('editing-play-retry');
  });
  it('a word table still being read does not stop the click: the app plays at once and says the DAW has not yet said where the words sit (#4043)', async () => {
    mount(DAW_SETUPS.reaper, undefined, null, true);
    await wait(10);
    act(() => playback.playFrom(t0('p-2:1')));
    await wait(10);
    expect(calls('play')).toHaveLength(0);
    expect(audio.play).toHaveBeenCalled();
    expect(notices.join(' ')).toMatch(/has not yet said where the words sit/);
    expect(notices.join(' ')).not.toMatch(/checking/i);
  });
  it('says a failed read of the DAW, asks again, and plays the app rather than checking for ever', async () => {
    const retry = vi.fn().mockResolvedValue(undefined);
    const api = createMockApi({}, { daw: {} });
    render(
      <ApiProvider api={api}>
        <EditingPageProvider doc={doc}>
          <Harness caps={null} read={{ failed: true, retry }} />
        </EditingPageProvider>
      </ApiProvider>,
    );
    await wait(10);
    act(() => playback.playFrom(t0('p-2:1')));
    await wait(10);
    expect(audio.play).toHaveBeenCalled();
    expect(retry).toHaveBeenCalledTimes(1);
    expect(notices).toEqual([`${READ_FAILED} ${FELL_BACK}`]);
  });
  it('Space plays the app with a DAW that is not running', async () => {
    await ready(DAW_SETUPS['reaper-off']);
    act(() => page.dispatch({ type: 'place', key: 'p-2:1' }));
    act(() => playback.toggle());
    await wait(10);
    expect(audio.play).toHaveBeenCalled();
    expect(state().playing).toBe(true);
  });
});

describe('without-a-daw-that-can-play-the-app-plays', () => {
  it.each([
    ['the built-in recorder', DAW_SETUPS.builtin],
    ['no recording tool', { ...DAW_SETUPS.builtin, daw: 'none' } satisfies DawCapabilities],
    ['a DAW whose engine has no transport the app can drive yet', DAW_SETUPS.audacity],
  ])('asks %s for nothing and plays in the app', async (_, caps) => {
    await ready(caps);
    expect(daw.syncCalls()).toHaveLength(0);
    act(() => playback.playFrom(t0('p-2:1')));
    await wait(10);
    expect(audio.play).toHaveBeenCalled();
    expect(daw.syncCalls()).toHaveLength(0);
    // An engine that never declared a transport plays in the app as its normal path: no notice.
    expect(notices).toEqual([]);
  });
});

describe('a-selection-and-the-play-of-it', () => {
  const select = (anchor: string, head: string) => act(() => page.dispatch({ type: 'select', anchor, head }));
  const sel = () => page.state.sel;

  it('keeps the selection when Space pauses a play of it', async () => {
    await ready();
    select('p-1:3', 'p-2:1');
    act(() => playback.toggle());
    await wait(10);
    expect(calls('playRange')).toHaveLength(1);
    expect(state().playing).toBe(true);
    act(() => playback.toggle());
    await wait(10);
    expect(state().playing).toBe(false);
    expect(sel()).toEqual({ anchor: 'p-1:3', head: 'p-2:1' });
  });

  it('plays the new range when the selection changes mid-play, and does not play the old one on', async () => {
    await ready();
    select('p-1:3', 'p-2:1');
    act(() => playback.toggle());
    await wait(10);
    const first = calls('playRange')[0];
    select('p-2:2', 'p-2:3');
    await wait(10);
    const sent = calls('playRange');
    expect(sent).toHaveLength(2);
    expect(sent[1].seconds).toBeGreaterThan(first.seconds);
    expect(state().playing).toBe(true);
    expect(sel()).toEqual({ anchor: 'p-2:2', head: 'p-2:3' });
  });

  it('does not play again when the selection that started the play is the one still selected', async () => {
    await ready();
    select('p-1:3', 'p-2:1');
    act(() => playback.toggle());
    await wait(500);
    expect(calls('playRange')).toHaveLength(1);
  });

  it('ends a play of a selection whose DAW position jumps straight to the end: the selection stays', async () => {
    await ready();
    select('p-1:3', 'p-2:1');
    act(() => playback.toggle());
    await wait(10);
    const until = calls('playRange')[0].until as number;
    act(() => daw.moveInDaw({ playing: false, head: until }));
    await wait(10);
    expect(state().playing).toBe(false);
    expect(sel()).toEqual({ anchor: 'p-1:3', head: 'p-2:1' });
  });

  it('counts a stop at the end of the stretch as the end of the play even when no reading near the end was heard playing', async () => {
    await ready();
    act(() => page.dispatch({ type: 'place', key: 'p-1:3' }));
    act(() => playback.playFrom(t0('p-1:3'), t0('p-2:1')));
    await wait(10);
    const until = calls('playRange')[0].until as number;
    act(() => daw.moveInDaw({ playing: false, head: until }));
    await wait(10);
    expect(state().playing).toBe(false);
    expect(state().cursor).toBe('p-1:3');
  });

  describe('when the DAW stops answering', () => {
    const mountAndLose = async () => {
      const api = createMockApi({}, { daw: {} });
      daw = window.__NARRATION_MOCK_DAW__ as DawMockControl;
      const tree = (caps: DawCapabilities) => (
        <ApiProvider api={api}>
          <EditingPageProvider doc={doc}>
            <Harness caps={caps} />
          </EditingPageProvider>
        </ApiProvider>
      );
      const view = render(tree(DAW_SETUPS.reaper));
      await wait(10);
      return { lose: () => view.rerender(tree({ ...DAW_SETUPS.reaper, reachable: false })), back: () => view.rerender(tree(DAW_SETUPS.reaper)) };
    };
    it('puts the play bar back on Play, and keeps it there when the DAW returns', async () => {
      const { lose, back } = await mountAndLose();
      select('p-1:3', 'p-2:1');
      act(() => playback.toggle());
      await wait(10);
      expect(state().playing).toBe(true);
      lose();
      await wait(10);
      expect(state().playing).toBe(false);
      // The DAW came back stopped (a DAW that comes back playing is followed, as any play of its own is).
      act(() => daw.moveInDaw({ playing: false }));
      back();
      await wait(LEASE_RENEW_MS + 10);
      expect(state().playing).toBe(false);
    });
    it('does the same for a play the DAW started itself', async () => {
      const { lose } = await mountAndLose();
      act(() => daw.moveInDaw({ playing: true, head: at(1.3) }));
      expect(lit()).toBe('p-1:3');
      lose();
      await wait(10);
      expect(state().playing).toBe(false);
    });
  });
});
