// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { useRef, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlaylistSegment } from '../../proof/playlist';
import { EditingPageProvider, useEditingPage } from '../script/EditingPageState';
import { marksDoc } from '../script/scriptFixtures';
import { clock } from './clock';
import { SelectionActionButton } from './SelectionActionButton';
import { SelectionBar } from './SelectionBar';
import { SelToolbar } from './SelToolbar';
import { registerSelectionAction } from './selectionActions';
import { AUDIO_FAILED, useScriptPlayback, type ScriptPlayback } from './useScriptPlayback';

class FakeAudio extends EventTarget {
  src = '';
  currentTime = 0;
  play = vi.fn().mockResolvedValue(undefined);
  pause = vi.fn();
}
const instances: FakeAudio[] = [];
const audio = (): FakeAudio => instances[instances.length - 1];

const SEGMENT: PlaylistSegment = {
  itemGuid: 'g',
  sourceFile: 'a.wav',
  sourceStart: 0,
  sourceEnd: 60,
  elapsedStart: 0,
  elapsedEnd: 60,
  overlapsPrevious: false,
};
const base = marksDoc();
const notify = vi.fn();
let playback: ScriptPlayback;
let page: ReturnType<typeof useEditingPage>;

function Probe() {
  page = useEditingPage();
  return <output data-testid="state">{JSON.stringify({ cursor: page.state.cursor, sel: page.state.sel, playT: page.state.playT })}</output>;
}
function Harness({ playlist = [SEGMENT], children }: { playlist?: PlaylistSegment[]; children?: ReactNode }) {
  playback = useScriptPlayback({ playlist, mediaUrl: (f) => `media/${f}`, notify });
  return (
    <>
      <Probe />
      <SelectionBar playback={playback} end={843} />
      {children}
    </>
  );
}
const mount = (node: ReactNode = null, doc = base, playlist = [SEGMENT]) =>
  render(
    <EditingPageProvider doc={doc}>
      <Harness playlist={playlist}>{node}</Harness>
    </EditingPageProvider>,
  );
const state = () => JSON.parse(screen.getByTestId('state').textContent ?? '{}') as { cursor: string | null; sel: unknown; playT: number | null };
const dispatch = (a: Parameters<typeof page.dispatch>[0]) => act(() => page.dispatch(a));
const t0 = (key: string) => base.items[base.index.get(key) ?? -1].t0 as number;
const tick = (seconds: number) =>
  act(() => {
    audio().currentTime = seconds;
    audio().dispatchEvent(new Event('timeupdate'));
  });

beforeEach(() => {
  instances.length = 0;
  notify.mockClear();
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
  vi.unstubAllGlobals();
});

describe('play from the cursor', () => {
  it('lights the word it plays and pauses on the word it reached', () => {
    mount();
    dispatch({ type: 'place', key: 'p-1:1' });
    act(() => playback.toggle());
    expect(audio().src).toBe('media/a.wav');
    expect(audio().currentTime).toBeCloseTo(t0('p-1:1'));
    expect(state().playT).toBeCloseTo(t0('p-1:1'));
    tick(t0('p-1:3') + 0.05);
    expect(state().playT).toBeCloseTo(t0('p-1:3') + 0.05);
    act(() => playback.toggle());
    expect(audio().pause).toHaveBeenCalled();
    expect(state()).toMatchObject({ cursor: 'p-1:3', playT: null });
  });

  it('follows the text until a hand scroll says otherwise, and the next play turns it back on', () => {
    mount();
    dispatch({ type: 'place', key: 'p-1:1' });
    act(() => playback.toggle());
    expect(playback.follow).toBe(true);
    act(() => playback.setFollow(false));
    expect(playback.follow).toBe(false);
    act(() => playback.toggle());
    act(() => playback.toggle());
    expect(playback.follow).toBe(true);
  });

  it('says so when nothing was recorded from here and plays nothing', () => {
    mount(null, base, []);
    dispatch({ type: 'place', key: 'p-1:1' });
    act(() => playback.toggle());
    expect(notify).toHaveBeenCalledWith('Nothing was recorded from here.');
    expect(state().playT).toBeNull();
    expect(audio().play).not.toHaveBeenCalled();
  });
});

describe('play the selection', () => {
  it('plays only its span, stops at its end and shows its start while stopped', () => {
    mount();
    dispatch({ type: 'select', anchor: 'p-1:1', head: 'p-1:4' });
    const start = t0('p-1:1');
    const end = base.items[base.index.get('p-1:4') ?? -1].t1 as number;
    act(() => playback.toggle());
    expect(audio().currentTime).toBeCloseTo(start);
    tick(end + 0.01);
    expect(state().playT).toBeNull();
    expect(state().sel).not.toBeNull();
    expect(screen.getByText('/ 14:03', { exact: false }).parentElement?.textContent).toBe(`${clock(start)} / 14:03`);
  });
});

describe('previous and next word', () => {
  it('move the cursor to the heard words when nothing plays', () => {
    mount();
    dispatch({ type: 'place', key: 'p-1:1' });
    fireEvent.click(screen.getByRole('button', { name: 'Go to the next word' }));
    const next = state().cursor;
    expect(next).not.toBe('p-1:1');
    expect(next).not.toBe('p-1:2');
    fireEvent.click(screen.getByRole('button', { name: 'Go to the previous word' }));
    expect(state().cursor).toBe('p-1:1');
  });

  it('move the playing position while it plays', () => {
    mount();
    dispatch({ type: 'place', key: 'p-1:1' });
    act(() => playback.toggle());
    fireEvent.click(screen.getByRole('button', { name: 'Go to the next word' }));
    expect(state().playT).toBeGreaterThan(t0('p-1:1'));
    expect(audio().currentTime).toBeCloseTo(state().playT as number);
  });
});

describe('the selection summary', () => {
  it('is a polite live region with the words, the range and the pill', () => {
    mount();
    dispatch({ type: 'select', anchor: 'p-1:0', head: 'p-1:1' });
    const live = screen.getByText('2 words').closest('[aria-live]');
    expect(live?.getAttribute('aria-live')).toBe('polite');
    expect(live?.textContent).toMatch(/0:\d\d to 0:\d\d · \d\.\d s/);
    expect(live?.textContent).toContain('In the script');
  });

  it('says not in the script for a said word, cut for cut words and counts low confidence', () => {
    const extra = base.items.find((i) => i.st === 'extra')!;
    const { unmount } = mount();
    dispatch({ type: 'select', anchor: extra.key, head: extra.key });
    expect(screen.getByText('Not in the script')).toBeTruthy();
    dispatch({ type: 'select', anchor: 'p-1:0', head: 'p-1:3' });
    expect(screen.getByText('1 low confidence')).toBeTruthy();
    unmount();
    const cut = marksDoc({ cuts: [{ id: 'c1', a: 5, b: 5.3, mode: 'gap', keys: ['p-1:0'], off0: 0, off1: 0.3 }] });
    mount(null, cut);
    dispatch({ type: 'select', anchor: 'p-1:0', head: 'p-1:0' });
    expect(screen.getByText('Cut')).toBeTruthy();
  });

  it('asks for a click when nothing is selected', () => {
    mount();
    expect(screen.getByText(/Click a word to place the cursor/)).toBeTruthy();
  });
});

describe('the actions are slots', () => {
  const removers: (() => void)[] = [];
  afterEach(() => removers.splice(0).forEach((r) => r()));

  it('shows none until one is registered, and draws a refusal disabled with its reason', () => {
    mount();
    dispatch({ type: 'select', anchor: 'p-1:0', head: 'p-1:1' });
    expect(screen.getAllByRole('button')).toHaveLength(3);
    const onClick = vi.fn();
    act(() => {
      removers.push(
        registerSelectionAction({
          id: 'mute',
          order: 20,
          where: 'both',
          render: ({ allCut }) =>
            allCut ? null : <SelectionActionButton label="Mute" hint="Mute, keep the audio (M)" reason="REAPER is not connected." onClick={onClick} />,
        }),
      );
    });
    const mute = screen.getByRole('button', { name: 'Mute' });
    expect(mute.getAttribute('aria-disabled')).toBe('true');
    expect(mute.getAttribute('aria-description')).toContain('REAPER is not connected.');
    fireEvent.click(mute);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('draws them in order, and Restore replaces the others when every word is cut', () => {
    const cut = marksDoc({ cuts: [{ id: 'c1', a: 5, b: 5.3, mode: 'gap', keys: ['p-1:0'], off0: 0, off1: 0.3 }] });
    mount(null, cut);
    act(() => {
      removers.push(
        registerSelectionAction({
          id: 'delete',
          order: 30,
          where: 'bar',
          render: ({ allCut }) => (allCut ? null : <SelectionActionButton label="Delete" onClick={() => {}} />),
        }),
        registerSelectionAction({
          id: 'fx',
          order: 10,
          where: 'bar',
          render: ({ allCut }) => (allCut ? null : <SelectionActionButton label="Add FX" onClick={() => {}} />),
        }),
        registerSelectionAction({
          id: 'restore',
          order: 5,
          where: 'bar',
          render: ({ allCut }) => (allCut ? <SelectionActionButton label="Restore" onClick={() => {}} /> : null),
        }),
      );
    });
    dispatch({ type: 'select', anchor: 'p-1:1', head: 'p-1:1' });
    expect(screen.getAllByRole('button').map((b) => b.getAttribute('aria-label'))).toEqual(expect.arrayContaining(['Add FX', 'Delete']));
    expect(screen.queryByRole('button', { name: 'Restore' })).toBeNull();
    dispatch({ type: 'select', anchor: 'p-1:0', head: 'p-1:0' });
    expect(screen.getByRole('button', { name: 'Restore' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull();
  });
});

describe('the floating toolbar', () => {
  const host = (
    <div data-testid="host">
      {base.items.map((i) => (
        <span key={i.key} data-k={i.key}>
          {i.text}
        </span>
      ))}
    </div>
  );
  function Toolbar({ hidden }: { hidden?: boolean }) {
    const ref = useRef<HTMLDivElement>(null);
    return (
      <div ref={ref}>
        {host}
        <SelToolbar host={ref} playback={playback} hidden={hidden} />
      </div>
    );
  }
  const removers: (() => void)[] = [];
  afterEach(() => removers.splice(0).forEach((r) => r()));

  it('follows the selection with the registered actions, and is gone while playing, with a card open or with no selection', () => {
    mount(<Toolbar />);
    expect(screen.queryByRole('toolbar', { name: 'Selection' })).toBeNull();
    act(() => {
      removers.push(
        registerSelectionAction({ id: 'fx', order: 10, where: 'toolbar', render: () => <SelectionActionButton label="Add FX" onClick={() => {}} /> }),
      );
    });
    dispatch({ type: 'select', anchor: 'p-1:0', head: 'p-1:1' });
    const bar = screen.getByRole('toolbar', { name: 'Selection' });
    expect(bar.querySelector('[aria-label="Add FX"]')).toBeTruthy();
    expect(bar.querySelector('[aria-label="Play the selection"]')).toBeTruthy();
    dispatch({ type: 'openFlag', key: 'p-1:1' });
    expect(screen.queryByRole('toolbar', { name: 'Selection' })).toBeNull();
    dispatch({ type: 'closeFlag' });
    expect(screen.getByRole('toolbar', { name: 'Selection' })).toBeTruthy();
    act(() => playback.toggle());
    expect(screen.queryByRole('toolbar', { name: 'Selection' })).toBeNull();
  });
});

describe('the audio element', () => {
  it('stops and says why when play is refused, and ignores an AbortError', async () => {
    mount();
    dispatch({ type: 'place', key: 'p-1:1' });
    audio().play.mockRejectedValueOnce(new DOMException('interrupted', 'AbortError'));
    await act(async () => playback.toggle());
    expect(notify).not.toHaveBeenCalled();
    expect(state().playT).not.toBeNull();
    act(() => playback.toggle());
    audio().play.mockRejectedValueOnce(new DOMException('no', 'NotSupportedError'));
    await act(async () => playback.toggle());
    expect(notify).toHaveBeenCalledWith(AUDIO_FAILED);
    expect(state().playT).toBeNull();
  });

  it('stops and says why when a segment fails to load, and when play throws', () => {
    mount();
    dispatch({ type: 'place', key: 'p-1:1' });
    act(() => playback.toggle());
    act(() => {
      audio().dispatchEvent(new Event('error'));
    });
    expect(notify).toHaveBeenCalledWith(AUDIO_FAILED);
    expect(state().playT).toBeNull();
    notify.mockClear();
    audio().play.mockImplementationOnce(() => {
      throw new Error('boom');
    });
    expect(() => act(() => playback.toggle())).not.toThrow();
    expect(notify).toHaveBeenCalledWith(AUDIO_FAILED);
  });
});

describe('the folder', () => {
  it('imports nothing from the old workspace except playlist.ts', () => {
    const dir = __dirname;
    const files = readdirSync(dir).filter((f) => /\.tsx?$/.test(f) && !/\.(test|stories)\./.test(f));
    const bad = files.flatMap((f) =>
      [...readFileSync(join(dir, f), 'utf8').matchAll(/from '([^']*proof\/[^']*)'/g)]
        .map((m) => m[1])
        .filter((p) => !p.endsWith('proof/playlist'))
        .map((p) => `${f}: ${p}`),
    );
    expect(bad).toEqual([]);
  });
});
