// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DawCapabilities } from '../../../api/contracts/daw';
import type { WorkspaceItem } from '../../../api/contracts/workspace';
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
import { ECHO_WINDOW_MS } from './echoGuard';
import { LEASE_RENEW_MS, SILENT_MS } from './useDawTransportSync';

const doc = marksDoc();

// One item at 100 s in the project, its source from 10 s, at twice the speed: project 100 + x is source 10 + 2x, which the page plays as
// document time 2x (the same fixture as follow.test.tsx).
const ITEMS: WorkspaceItem[] = [{ index: 0, itemGuid: 'g', live: true, position: 100, sourceStart: 10, playRate: 2, length: 4 }];
const PLAYLIST: PlaylistSegment[] = [
  { itemGuid: 'g', sourceFile: 'a.wav', sourceStart: 10, sourceEnd: 18, elapsedStart: 0, elapsedEnd: 8, overlapsPrevious: false },
];
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

function Harness({ caps, items = ITEMS }: { caps: DawCapabilities | null; items?: WorkspaceItem[] }) {
  page = useEditingPage();
  playback = useScriptPlayback({ playlist: PLAYLIST, mediaUrl: (f) => f, notify: (text) => notices.push(text), sync: { items, cuts: [], caps } });
  useDawPlayPosition({ items, playlist: PLAYLIST, caps: playback.syncActive ? null : caps, playback });
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
  seed: Parameters<typeof createMockApi>[1] = { daw: { toggles: { transport_sync: 'on' } } },
  items?: WorkspaceItem[],
) => {
  const api = createMockApi({}, seed);
  daw = window.__NARRATION_MOCK_DAW__ as DawMockControl;
  return render(
    <ApiProvider api={api}>
      <EditingPageProvider doc={doc}>
        <Harness caps={caps} items={items} />
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
    act(() => daw.moveInDaw({ playing: false }));
    expect(lit()).toBe('p-2:1');
  });
  it('ignores a DAW that has another project open', async () => {
    mount(DAW_SETUPS.reaper, { daw: { toggles: { transport_sync: 'on' } }, dawScript: 'different' });
    await wait(LEASE_RENEW_MS + 10);
    act(() => daw.moveInDaw({ cursor: at(1.3) }));
    expect(state().cursor).toBeNull();
    expect(calls('watch')).toHaveLength(0);
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
    expect(calls('play')).toEqual([{ action: 'play', seconds: at(t0('p-2:1')) }]);
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
  it('stops the DAW at the end of a selection it was asked to play', async () => {
    await ready();
    act(() => playback.playFrom(t0('p-1:3'), t0('p-2:1')));
    await wait(10);
    act(() => daw.moveInDaw({ head: at(t0('p-2:1') + 0.05) }));
    await wait(10);
    expect(calls('stop')).toHaveLength(1);
    expect(state().playing).toBe(false);
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
  it('plays in the app itself, and says why, when the DAW refuses', async () => {
    await ready();
    daw.refuseNextSync('REAPER is recording. Stop recording first.');
    act(() => playback.playFrom(t0('p-2:1')));
    await wait(10);
    expect(audio.play).toHaveBeenCalled();
    expect(state().playing).toBe(true);
    expect(notices.join(' ')).toContain('Stop recording first');
  });
  it('plays in the app itself, asking the DAW for nothing, when the word has no project time', async () => {
    mount(DAW_SETUPS.reaper, undefined, [{ ...ITEMS[0], live: false }]);
    await wait(10);
    act(() => playback.playFrom(t0('p-2:1')));
    await wait(10);
    expect(calls('play')).toHaveLength(0);
    expect(audio.play).toHaveBeenCalled();
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

describe('without-the-daw-the-page-is-as-it-was', () => {
  it.each([
    ['a DAW that is off', DAW_SETUPS['reaper-off']],
    ['the built-in recorder', DAW_SETUPS.builtin],
    ['a DAW not yet answered', null],
  ])('asks %s for nothing and plays in the app', async (_, caps) => {
    await ready(caps);
    expect(daw.syncCalls()).toHaveLength(0);
    act(() => playback.playFrom(t0('p-2:1')));
    await wait(10);
    expect(audio.play).toHaveBeenCalled();
    expect(daw.syncCalls()).toHaveLength(0);
  });
  it('asks for nothing while the capability is switched off, and plays in the app', async () => {
    const off: DawCapabilities = {
      ...DAW_SETUPS.reaper,
      capabilities: {
        ...DAW_SETUPS.reaper.capabilities,
        transport_sync: { level: 'experimental', available: false, reason: 'experimental_off', message: 'Off.' },
      },
    };
    await ready(off);
    act(() => playback.playFrom(t0('p-2:1')));
    await wait(10);
    expect(audio.play).toHaveBeenCalled();
    expect(daw.syncCalls()).toHaveLength(0);
  });
  it('plays in the app when the DAW has another project open', async () => {
    mount();
    daw.openProject('other');
    await wait(10);
    act(() => playback.playFrom(t0('p-2:1')));
    await wait(10);
    expect(audio.play).toHaveBeenCalled();
    expect(calls('play')).toHaveLength(0);
  });
});
