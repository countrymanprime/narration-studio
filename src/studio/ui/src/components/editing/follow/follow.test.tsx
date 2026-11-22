// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DawCapabilities, DawProjectState, DawTransport } from '../../../api/contracts/daw';
import { ApiProvider } from '../../../api/ApiContext';
import { createMockApi } from '../../../api/mockApi';
import { DAW_SETUPS } from '../../../fixtures/daw';
import { overlay } from '../../../overlay/overlayService';
import { createMockDawClient, type DawClient } from '../../../ports/daw';
import { PortOverrides } from '../../../ports/usePort';
import type { PlaylistSegment } from '../../proof/playlist';
import { useScriptPlayback, type ScriptPlayback } from '../bar/useScriptPlayback';
import { EditingPageProvider, useEditingPage } from '../script/EditingPageState';
import { ScriptDoc } from '../script/ScriptDoc';
import { marksDoc } from '../script/scriptFixtures';
import { buildWordClock } from './wordClock';
import { linear, wordTimesFor } from './wordTimesFixtures';
import type { WordClock } from './wordClock';
import { BACKSTOP_MS, useDawPlayPosition } from './useDawPlayPosition';
import { useFollowScroll } from './useFollowScroll';

const doc = marksDoc();

// One item at 100 s in the project playing the page at twice the speed: document time 2x is project 100 + x. It holds the first 8 document seconds; the
// words after them are not in the project (the host's table marks them so).
const PLAYLIST: PlaylistSegment[] = [
  { itemGuid: 'g', sourceFile: 'a.wav', sourceStart: 10, sourceEnd: 18, elapsedStart: 0, elapsedEnd: 8, overlapsPrevious: false },
];
const placed = wordTimesFor(doc, (w) => (w.t1 <= 8 ? linear(100, 0, 2)(w) : null));
const CLOCK = buildWordClock(placed.table, doc, placed.tokenOf);
/** The project time at which the page's clock reads `docT`. */
const at = (docT: number): number => 100 + docT / 2;
const t0 = (key: string): number => doc.items[doc.index.get(key) ?? -1].t0 as number;

describe('position-maps-to-a-word', () => {
  it('maps a project time to the word it falls in', () => {
    expect(CLOCK.wordAt(at(1.3))?.key).toBe('p-1:3');
    expect(CLOCK.wordAt(at(4.2))?.key).toBe('p-2:1');
    expect(CLOCK.docAt(at(1.3))).toBeCloseTo(1.3, 6);
  });
  it('lights nothing in a gap, before the first word, after the last, outside the item or for a word the project does not play', () => {
    expect(CLOCK.wordAt(at(3.6))).toBeNull();
    expect(CLOCK.wordAt(at(0.3))).toBeNull();
    expect(CLOCK.wordAt(at(7))).toBeNull();
    expect(CLOCK.wordAt(50)).toBeNull();
    const none = wordTimesFor(doc, () => null);
    expect(buildWordClock(none.table, doc, none.tokenOf).wordAt(at(1.3))).toBeNull();
  });
});

class FakeAudio extends EventTarget {
  src = '';
  currentTime = 0;
  play = vi.fn().mockResolvedValue(undefined);
  pause = vi.fn();
}

let transport: DawProjectState;
let client: DawClient;
let playback: ScriptPlayback;
let page: ReturnType<typeof useEditingPage>;

function Harness({ caps, clock = CLOCK }: { caps: DawCapabilities | null; clock?: WordClock | null }) {
  const root = useRef<HTMLDivElement>(null);
  page = useEditingPage();
  playback = useScriptPlayback({ playlist: PLAYLIST, mediaUrl: (f) => f, notify: () => {} });
  useDawPlayPosition({ clock, caps, playback });
  useFollowScroll(root, playback);
  return (
    <div ref={root}>
      <output data-testid="state">{JSON.stringify({ playT: page.state.playT, follow: playback.follow })}</output>
      <ScriptDoc />
    </div>
  );
}

/** The host's transport event: it says a play started or stopped and carries the position (as of the last heartbeat) while the DAW plays. */
let announceTransport: (next: DawTransport) => void = () => {};
const makeApi = () =>
  createMockApi({
    subscribeDawTransport: (listener: (next: DawTransport) => void) => {
      announceTransport = listener;
      return () => {};
    },
  });
const tree = (api: ReturnType<typeof makeApi>, caps: DawCapabilities | null = DAW_SETUPS.reaper, clock: WordClock | null = CLOCK) => (
  <ApiProvider api={api}>
    <PortOverrides clients={{ daw: client }}>
      <EditingPageProvider doc={doc}>
        <Harness caps={caps} clock={clock} />
      </EditingPageProvider>
    </PortOverrides>
  </ApiProvider>
);
const mount = (caps: DawCapabilities | null = DAW_SETUPS.reaper) => render(tree(makeApi(), caps));
const state = () => JSON.parse(screen.getByTestId('state').textContent ?? '{}') as { playT: number | null; follow: boolean };
const lit = (): string | null => document.querySelector('[data-now]')?.getAttribute('data-k') ?? null;
/** Lets one poll's read answer. */
const poll = async (ms = 250) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
};
const dawAt = (docT: number, playState: DawProjectState['playState'] = 'playing') => {
  transport = { ...transport, playState, playPosition: at(docT) };
  // As the host's payload is shaped: the play bit is also set while recording, and the position comes only while the DAW plays or records.
  const playing = playState !== 'stopped';
  act(() => announceTransport({ playing, recording: playState === 'recording', ...(playing ? { position: at(docT) } : {}) }));
};

beforeEach(() => {
  vi.useFakeTimers();
  transport = { savedAt: null, unsavedChanges: false, playState: 'stopped', playPosition: 0 };
  client = createMockDawClient(DAW_SETUPS.reaper);
  vi.spyOn(client, 'projectState').mockImplementation(() => Promise.resolve(transport));
  vi.stubGlobal('Audio', FakeAudio);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('lit-word-follows-the-daw-while-it-plays', () => {
  it('advances the playing word with the position, and keeps the last word lit after a stop until the cursor moves', async () => {
    mount();
    await poll();
    expect(state().playT).toBeNull();
    dawAt(1.3);
    await poll();
    expect(lit()).toBe('p-1:3');
    dawAt(4.2);
    await poll();
    expect(lit()).toBe('p-2:1');
    dawAt(5.1, 'stopped');
    await poll();
    expect(lit()).toBe('p-2:1');
    act(() => page.dispatch({ type: 'place', key: 'p-1:0' }));
    expect(state().playT).toBeNull();
    expect(lit()).toBeNull();
  });
  it('lights nothing while the DAW plays a gap', async () => {
    mount();
    dawAt(1.3);
    await poll();
    expect(lit()).toBe('p-1:3');
    dawAt(3.6);
    await poll();
    expect(state().playT).toBeNull();
  });
});

describe('own-playback-wins', () => {
  it('ignores the DAW while the app plays its own audio, and follows it again when that stops', async () => {
    mount();
    act(() => playback.playFrom(t0('p-2:5')));
    const own = state().playT;
    dawAt(1.3);
    await poll();
    await poll();
    expect(state().playT).toBe(own);
    expect(lit()).toBe('p-2:5');
    act(() => playback.stop());
    // The next heartbeat's event (the DAW keeps playing) is followed again.
    dawAt(1.3);
    await poll();
    expect(lit()).toBe('p-1:3');
  });
});

describe('follow-scroll-obeys-the-toggle-and-a-hand-scroll', () => {
  /** Puts every word below the script's visible part, so following must scroll to it. */
  const below = () => {
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      const top = this.hasAttribute('data-k') ? 900 : 0;
      return { top, bottom: top + 30, left: 0, right: 100, height: this.hasAttribute('data-k') ? 30 : 400, width: 100, x: 0, y: top, toJSON: () => ({}) };
    });
  };
  const box = () => document.querySelector<HTMLElement>('[data-script]')!;

  it('scrolls to the lit word while follow is on, and a hand scroll turns it off until the next play', async () => {
    below();
    mount();
    dawAt(1.3);
    await poll();
    expect(box().scrollTop).toBeGreaterThan(0);
    fireEvent.wheel(box());
    expect(state().follow).toBe(false);
    box().scrollTop = 0;
    dawAt(4.2);
    await poll();
    expect(box().scrollTop).toBe(0);
    dawAt(4.2, 'stopped');
    await poll();
    dawAt(4.8);
    await poll();
    expect(state().follow).toBe(true);
    expect(box().scrollTop).toBeGreaterThan(0);
  });
  it('turns following off on Page Down and a touch, not on another key or with nothing playing', async () => {
    mount();
    fireEvent.wheel(box());
    expect(state().follow).toBe(true);
    dawAt(1.3);
    await poll();
    fireEvent.keyDown(box(), { key: 'ArrowDown' });
    expect(state().follow).toBe(true);
    fireEvent.keyDown(box(), { key: 'PageDown' });
    expect(state().follow).toBe(false);
    act(() => playback.setFollow(true));
    fireEvent.touchMove(box());
    expect(state().follow).toBe(false);
  });
});

describe('only-reads', () => {
  it('calls nothing on the DawClient but the state read', async () => {
    const spies = (Object.keys(client) as (keyof DawClient)[]).map((name) => [name, vi.spyOn(client, name)] as const);
    mount();
    dawAt(1.3);
    await poll();
    dawAt(1.3, 'stopped');
    await poll(BACKSTOP_MS + 100);
    const called = spies.filter(([, spy]) => spy.mock.calls.length).map(([name]) => name);
    expect(called).toEqual(['projectState']);
  });
});

describe('no-position-no-follow', () => {
  it.each([
    ['the built-in recorder', DAW_SETUPS.builtin],
    ['a DAW that is off', DAW_SETUPS['reaper-off']],
    ['a DAW not yet answered', null],
  ])('reads nothing from %s and leaves the page as it was', async (_, caps) => {
    const toast = vi.spyOn(overlay, 'toast');
    dawAt(1.3);
    mount(caps);
    await poll(BACKSTOP_MS * 2);
    expect(client.projectState).not.toHaveBeenCalled();
    expect(state().playT).toBeNull();
    expect(toast).not.toHaveBeenCalled();
  });
  it('stays silent when the read fails', async () => {
    const toast = vi.spyOn(overlay, 'toast');
    vi.mocked(client.projectState).mockRejectedValue(new Error('gone'));
    mount();
    await poll(BACKSTOP_MS * 2);
    expect(state().playT).toBeNull();
    expect(toast).not.toHaveBeenCalled();
  });
});

describe('poll-is-bounded', () => {
  it('reads nothing while the transport events flow, and once each backstop while visible; nothing when hidden or unmounted', async () => {
    const view = mount();
    // A DAW that plays for a minute is followed from its events alone.
    dawAt(1.3);
    await poll(10_000);
    dawAt(4.2);
    await poll(10_000);
    expect(vi.mocked(client.projectState).mock.calls.length).toBe(0);
    expect(lit()).toBe('p-2:1');
    await poll(BACKSTOP_MS);
    const backstop = vi.mocked(client.projectState).mock.calls.length;
    expect(backstop).toBeGreaterThan(0);
    expect(backstop).toBeLessThanOrEqual(2);
    const hidden = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await poll(BACKSTOP_MS * 2);
    expect(vi.mocked(client.projectState).mock.calls.length).toBe(backstop);
    hidden.mockReturnValue('visible');
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await poll(BACKSTOP_MS);
    const after = vi.mocked(client.projectState).mock.calls.length;
    expect(after).toBeGreaterThan(backstop);
    view.unmount();
    await poll(BACKSTOP_MS * 2);
    expect(vi.mocked(client.projectState).mock.calls.length).toBe(after);
  });
  it('lights a play the transport event announces at once, from the position the event carries', async () => {
    mount();
    await poll(500);
    dawAt(1.3);
    await poll(10);
    expect(lit()).toBe('p-1:3');
    expect(client.projectState).not.toHaveBeenCalled();
  });
  it('does not follow a take: a DAW that records is not a play, whatever its play bit says', async () => {
    mount();
    dawAt(1.3, 'recording');
    await poll(500);
    expect(lit()).toBeNull();
    expect(state().playT).toBeNull();
  });
  it('a stop is heard from the event: the last word stays lit and a later play starts afresh (follow turns on again)', async () => {
    mount();
    dawAt(1.3);
    await poll(10);
    expect(lit()).toBe('p-1:3');
    dawAt(1.3, 'stopped');
    await poll(10);
    expect(lit()).toBe('p-1:3');
    act(() => playback.setFollow(false));
    dawAt(4.2);
    await poll(10);
    expect(playback.follow).toBe(true);
  });
  it('still finds a play or a stop whose transport event was lost, at the backstop', async () => {
    mount();
    await poll(500);
    // The DAW plays but no event comes: the backstop read finds it.
    transport = { ...transport, playState: 'playing', playPosition: at(1.3) };
    await poll(BACKSTOP_MS + 100);
    expect(lit()).toBe('p-1:3');
    expect(client.projectState).toHaveBeenCalled();
  });
  it('a backstop read that was out when a newer event came is dropped: a stop is not undone by the older play it brings', async () => {
    let release: (ps: DawProjectState) => void = () => {};
    vi.mocked(client.projectState).mockImplementation(() => new Promise((resolve) => (release = resolve)));
    mount();
    dawAt(4.2);
    await poll(BACKSTOP_MS + 100);
    expect(client.projectState).toHaveBeenCalledTimes(1);
    expect(lit()).toBe('p-2:1');
    dawAt(4.2, 'stopped');
    // The read had been asked before the stop was announced; it answers with the play it saw.
    await act(async () => release({ savedAt: null, unsavedChanges: false, playState: 'playing', playPosition: at(1.3) }));
    expect(lit()).toBe('p-2:1');
    act(() => page.dispatch({ type: 'place', key: 'p-1:0' }));
    expect(state().playT).toBeNull();
  });
  it('a word table that arrives after a play started lights its word at once, with no new event', async () => {
    const api = makeApi();
    const view = render(tree(api, DAW_SETUPS.reaper, null));
    dawAt(1.3);
    await poll(10);
    expect(lit()).toBeNull();
    view.rerender(tree(api, DAW_SETUPS.reaper, CLOCK));
    await poll(10);
    expect(lit()).toBe('p-1:3');
  });
  it('waits for a slow read before asking again', async () => {
    vi.mocked(client.projectState).mockImplementation(() => new Promise(() => {}));
    mount();
    await poll(BACKSTOP_MS * 3 + 100);
    expect(client.projectState).toHaveBeenCalledTimes(1);
  });
});
