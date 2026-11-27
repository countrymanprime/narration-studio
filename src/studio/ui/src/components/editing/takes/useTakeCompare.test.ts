// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { LinePassage, LineTake } from './types';
import { useTakeCompare, type TakeCompareArgs } from './useTakeCompare';

const take = (id: string): LineTake => ({ id, label: id, active: false, usable: true, sourceFile: `${id}.wav`, sourceStart: 0, sourceLength: 5 });
const passage = { id: 'p', chapterId: 'c', firstToken: 0, lastToken: 1, script: 'x', takes: [take('t1'), take('t2'), take('t3')] } as LinePassage;

/** The comparison as the page drives it: `onPlay` asks a take, the audition then holds it (`waitingId`) and shows it playing or not. */
function start() {
  const onPlay = vi.fn();
  const props: TakeCompareArgs = { passage, keptId: null, playingId: null, onPlay };
  const hook = renderHook((p: TakeCompareArgs) => useTakeCompare(p), { initialProps: props });
  const show = (extra: Partial<TakeCompareArgs>) => hook.rerender({ ...props, ...extra });
  act(() => hook.result.current.playEvery());
  return { onPlay, show, result: hook.result };
}

describe('a comparison whose take played nothing', () => {
  it('holds on that take through the refusal, as the page orders it, and goes on from it after Retry', () => {
    const { onPlay, show, result } = start();
    expect(onPlay.mock.calls[0]![0].id).toBe('t1');
    show({ waitingId: 't1' });
    show({ waitingId: 't1', playingId: 't1' });
    // The DAW refuses: the take stops showing as playing while the page still waits on it (the room is read before it says so).
    show({ waitingId: 't1', playingId: null });
    show({ waitingId: 't1', playingId: null });
    expect(onPlay).toHaveBeenCalledTimes(1);
    expect(result.current.running).toBe('every');
    // Retry asks t1 again; it plays and ends, and the run asks for t2.
    show({ waitingId: 't1', playingId: null });
    show({ waitingId: null, playingId: 't1' });
    show({ waitingId: null, playingId: null });
    expect(onPlay).toHaveBeenCalledTimes(2);
    expect(onPlay.mock.calls[1]![0].id).toBe('t2');
  });

  it('ends when another take is asked by hand while it holds, whether that one plays or is refused too', () => {
    for (const second of [{ playingId: 't2' }, { playingId: null }]) {
      const { onPlay, show, result } = start();
      show({ waitingId: 't1', playingId: 't1' });
      show({ waitingId: 't1', playingId: null });
      expect(result.current.running).toBe('every');
      show({ waitingId: 't2', ...second });
      expect(result.current.running).toBeNull();
      show({ waitingId: null, playingId: 't1' });
      expect(onPlay).toHaveBeenCalledTimes(1);
    }
  });

  it('still goes through the takes when each one plays and ends', () => {
    const { onPlay, show } = start();
    show({ waitingId: 't1', playingId: 't1' });
    show({ waitingId: null, playingId: 't1' });
    show({ waitingId: null, playingId: null });
    expect(onPlay.mock.calls.map((c) => c[0].id)).toEqual(['t1', 't2']);
  });
});

describe('a stop from outside ends the run (#4124)', () => {
  it("the script's Play stopping the take that plays does not start the next take over it", () => {
    const { onPlay, show, result } = start();
    show({ waitingId: 't1', playingId: 't1' });
    show({ waitingId: null, playingId: 't1' });
    // The script played: the take was stopped (its `stops` count rose) and shows nothing playing.
    show({ waitingId: null, playingId: null, stops: 1 });
    expect(result.current.running).toBeNull();
    expect(onPlay).toHaveBeenCalledTimes(1);
  });
});
