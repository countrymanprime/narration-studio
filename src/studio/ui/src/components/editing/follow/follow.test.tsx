// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DawCapabilities, DawProjectState } from '../../../api/contracts/daw';
import type { WorkspaceItem } from '../../../api/contracts/workspace';
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
import { docTimeAt, sourceAt, wordAtProject } from './dawPosition';
import { POLL_MS, useDawPlayPosition } from './useDawPlayPosition';
import { useFollowScroll } from './useFollowScroll';

const doc = marksDoc();

// One item at 100 s in the project, its source from 10 s, at twice the speed: project 100 + x is source 10 + 2x, which the page plays as
// document time 2x.
const ITEMS: WorkspaceItem[] = [{ index: 0, itemGuid: 'g', live: true, position: 100, sourceStart: 10, playRate: 2, length: 4 }];
const PLAYLIST: PlaylistSegment[] = [
  { itemGuid: 'g', sourceFile: 'a.wav', sourceStart: 10, sourceEnd: 18, elapsedStart: 0, elapsedEnd: 8, overlapsPrevious: false },
];
/** The project time at which the page's clock reads `docT`. */
const at = (docT: number): number => 100 + docT / 2;
const t0 = (key: string): number => doc.items[doc.index.get(key) ?? -1].t0 as number;

describe('position-maps-to-a-word', () => {
  it("maps a project time to the item's source time (position, source start, play rate) and then to the word it falls in", () => {
    expect(sourceAt(ITEMS, 101)).toEqual({ itemGuid: 'g', sourceTime: 12 });
    expect(docTimeAt(PLAYLIST, { itemGuid: 'g', sourceTime: 12 })).toBe(2);
    expect(wordAtProject(doc, ITEMS, PLAYLIST, at(1.3))?.key).toBe('p-1:3');
    expect(wordAtProject(doc, ITEMS, PLAYLIST, at(4.2))?.key).toBe('p-2:1');
  });
  it('lights nothing in a gap, before the first word, after the last, outside every item or on an item that is not live', () => {
    expect(wordAtProject(doc, ITEMS, PLAYLIST, at(3.6))).toBeNull();
    expect(wordAtProject(doc, ITEMS, PLAYLIST, at(0.3))).toBeNull();
    expect(wordAtProject(doc, ITEMS, PLAYLIST, at(7))).toBeNull();
    expect(wordAtProject(doc, ITEMS, PLAYLIST, 50)).toBeNull();
    expect(wordAtProject(doc, [{ ...ITEMS[0], live: false }], PLAYLIST, at(1.3))).toBeNull();
    expect(docTimeAt(PLAYLIST, { itemGuid: 'other', sourceTime: 12 })).toBeNull();
  });
  it('takes the item that starts latest where two overlap', () => {
    const later: WorkspaceItem = { index: 1, itemGuid: 'h', live: true, position: 101, sourceStart: 0, playRate: 1, length: 4 };
    expect(sourceAt([...ITEMS, later], 101.5)).toEqual({ itemGuid: 'h', sourceTime: 0.5 });
    expect(sourceAt([later, ...ITEMS], 101.5)).toEqual({ itemGuid: 'h', sourceTime: 0.5 });
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

function Harness({ caps }: { caps: DawCapabilities | null }) {
  const root = useRef<HTMLDivElement>(null);
  page = useEditingPage();
  playback = useScriptPlayback({ playlist: PLAYLIST, mediaUrl: (f) => f, notify: () => {} });
  useDawPlayPosition({ items: ITEMS, playlist: PLAYLIST, caps, playback });
  useFollowScroll(root, playback);
  return (
    <div ref={root}>
      <output data-testid="state">{JSON.stringify({ playT: page.state.playT, follow: playback.follow })}</output>
      <ScriptDoc />
    </div>
  );
}

const mount = (caps: DawCapabilities | null = DAW_SETUPS.reaper) =>
  render(
    <ApiProvider api={createMockApi()}>
      <PortOverrides clients={{ daw: client }}>
        <EditingPageProvider doc={doc}>
          <Harness caps={caps} />
        </EditingPageProvider>
      </PortOverrides>
    </ApiProvider>,
  );
const state = () => JSON.parse(screen.getByTestId('state').textContent ?? '{}') as { playT: number | null; follow: boolean };
const lit = (): string | null => document.querySelector('[data-now]')?.getAttribute('data-k') ?? null;
/** Lets one poll's read answer. */
const poll = async (ms = POLL_MS) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
};
const dawAt = (docT: number, playState: DawProjectState['playState'] = 'playing') => {
  transport = { ...transport, playState, playPosition: at(docT) };
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
    await poll();
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
    await poll(POLL_MS * 4);
    expect(client.projectState).not.toHaveBeenCalled();
    expect(state().playT).toBeNull();
    expect(toast).not.toHaveBeenCalled();
  });
  it('stays silent when the read fails', async () => {
    const toast = vi.spyOn(overlay, 'toast');
    vi.mocked(client.projectState).mockRejectedValue(new Error('gone'));
    mount();
    await poll(POLL_MS * 4);
    expect(state().playT).toBeNull();
    expect(toast).not.toHaveBeenCalled();
  });
});

describe('poll-is-bounded', () => {
  it('reads at most four times a second while visible, and stops when hidden or unmounted', async () => {
    const view = mount();
    await poll(1000);
    const perSecond = vi.mocked(client.projectState).mock.calls.length;
    expect(perSecond).toBeGreaterThan(0);
    expect(perSecond).toBeLessThanOrEqual(5);
    const hidden = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    const before = vi.mocked(client.projectState).mock.calls.length;
    await poll(2000);
    expect(vi.mocked(client.projectState).mock.calls.length).toBe(before);
    hidden.mockReturnValue('visible');
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await poll(1000);
    const after = vi.mocked(client.projectState).mock.calls.length;
    expect(after).toBeGreaterThan(before);
    view.unmount();
    await poll(2000);
    expect(vi.mocked(client.projectState).mock.calls.length).toBe(after);
  });
  it('waits for a slow read before asking again', async () => {
    vi.mocked(client.projectState).mockImplementation(() => new Promise(() => {}));
    mount();
    await poll(2000);
    expect(client.projectState).toHaveBeenCalledTimes(1);
  });
});
