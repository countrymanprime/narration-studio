// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../../api/ApiContext';
import type { DawMockControl } from '../../../api/dawMock';
import { createMockApi } from '../../../api/mockApi';
import type { WorkspaceItem } from '../../../api/contracts/workspace';
import { DAW_SETUPS } from '../../../fixtures/daw';
import type { PlaylistSegment } from '../../proof/playlist';
import { useScriptPlayback } from '../bar/useScriptPlayback';
import { EditingPageProvider, useEditingPage } from '../script/EditingPageState';
import { ScriptDoc } from '../script/ScriptDoc';
import { marksDoc } from '../script/scriptFixtures';
import { LIVE_ITEMS_REFRESH_MS, useLiveFollowMap } from './useLiveFollowMap';

const doc = marksDoc();

// The saved project had one item at 100 s, its source from 10 s, at twice the speed (project 100 + x is document time 2x).
const SAVED: WorkspaceItem[] = [{ index: 0, itemGuid: 'g', live: true, position: 100, sourceStart: 10, playRate: 2, length: 4 }];
const PLAYLIST: PlaylistSegment[] = [
  { itemGuid: 'g', sourceFile: 'a.wav', sourceStart: 10, sourceEnd: 18, elapsedStart: 0, elapsedEnd: 8, overlapsPrevious: false },
];
const t0 = (key: string): number => doc.items[doc.index.get(key) ?? -1].t0 as number;
/** Where the page's clock reads `docT` once the narrator has moved the item to 200 s in REAPER. */
const movedAt = (docT: number): number => 200 + docT / 2;
const edited = (over: Partial<{ muted: boolean; sourceFile: string }> = {}) => [
  { guid: 'g', sourceFile: 'a.wav', position: 200, length: 4, sourceStart: 10, playRate: 2, muted: false, ...over },
];

class FakeAudio extends EventTarget {
  src = '';
  currentTime = 0;
  play = vi.fn().mockResolvedValue(undefined);
  pause = vi.fn();
}
let daw: DawMockControl;

function Harness() {
  const page = useEditingPage();
  const follow = useLiveFollowMap('c1', { playlist: PLAYLIST, items: SAVED, cuts: [] }, DAW_SETUPS.reaper);
  useScriptPlayback({
    playlist: PLAYLIST,
    mediaUrl: (f) => f,
    sync: { items: follow.items, cuts: follow.cuts, playlist: follow.playlist, caps: DAW_SETUPS.reaper },
  });
  return (
    <div>
      <output data-testid="playT">{String(page.state.playT)}</output>
      <ScriptDoc />
    </div>
  );
}

const lit = (): string | null => document.querySelector('[data-now]')?.getAttribute('data-k') ?? null;
const wait = async (ms: number) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
};
const mount = async () => {
  const api = createMockApi({}, { daw: {} });
  daw = window.__NARRATION_MOCK_DAW__ as DawMockControl;
  render(
    <ApiProvider api={api}>
      <EditingPageProvider doc={doc}>
        <Harness />
      </EditingPageProvider>
    </ApiProvider>,
  );
  await wait(10);
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('Audio', function () {
    return new FakeAudio();
  });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("follow over the DAW's live items", () => {
  it('lights the word the DAW plays after the item was moved in the DAW', async () => {
    await mount();
    daw.setLiveItems(edited());
    act(() => daw.moveInDaw({ playing: true, head: movedAt(t0('p-2:3')) }));
    await wait(10);
    act(() => daw.moveInDaw({ head: movedAt(t0('p-2:3')) }));
    await wait(10);
    expect(lit()).toBe('p-2:3');
  });

  it('lights nothing for the old place when the DAW can be read and the item is no longer there', async () => {
    await mount();
    daw.setLiveItems(edited());
    act(() => daw.moveInDaw({ playing: true, head: 50 }));
    await wait(10);
    act(() => daw.moveInDaw({ head: 100 + t0('p-2:3') / 2 }));
    await wait(10);
    expect(lit()).toBeNull();
  });

  it('follows the saved items while the DAW cannot be read', async () => {
    await mount();
    act(() => daw.moveInDaw({ playing: true, head: 100 + t0('p-2:3') / 2 }));
    await wait(10);
    expect(lit()).toBe('p-2:3');
  });

  it('reads the DAW again while it plays, so an edit made during the play lands', async () => {
    await mount();
    act(() => daw.moveInDaw({ playing: true, head: 100 + t0('p-2:1') / 2 }));
    await wait(10);
    daw.setLiveItems(edited());
    await wait(LIVE_ITEMS_REFRESH_MS + 10);
    act(() => daw.moveInDaw({ head: movedAt(t0('p-2:3')) }));
    await wait(10);
    expect(lit()).toBe('p-2:3');
  });

  it('a muted item plays nothing, so a take the narrator muted is not followed', async () => {
    await mount();
    daw.setLiveItems(edited({ muted: true }));
    act(() => daw.moveInDaw({ playing: true, head: 100 + t0('p-2:3') / 2 }));
    await wait(10);
    // Nothing live plays the file, so the saved map stands.
    expect(lit()).toBe('p-2:3');
  });
});
