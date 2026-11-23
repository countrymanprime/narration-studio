// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { LinePassage, LineTake } from './types';
import { useTakeCompare, type TakeCompareArgs } from './useTakeCompare';

const take = (id: string): LineTake => ({ id, label: id, active: false, usable: true, sourceFile: `${id}.wav`, sourceStart: 0, sourceLength: 5 });
const passage = { id: 'p', chapterId: 'c', firstToken: 0, lastToken: 1, script: 'x', takes: [take('t1'), take('t2'), take('t3')] } as LinePassage;

describe('a comparison whose take played nothing', () => {
  it('waits on that take for its Retry and goes on from it, and does not run through the takes that follow', () => {
    const onPlay = vi.fn();
    const props: TakeCompareArgs = { passage, keptId: null, playingId: null, onPlay };
    const { result, rerender } = renderHook((p: TakeCompareArgs) => useTakeCompare(p), { initialProps: props });
    act(() => result.current.playEvery());
    expect(onPlay).toHaveBeenCalledTimes(1);
    expect(onPlay.mock.calls[0]![0].id).toBe('t1');
    // The page shows the take playing at once, then the DAW refuses and nothing plays.
    rerender({ ...props, playingId: 't1' });
    rerender({ ...props, playingId: null, failedId: 't1' });
    expect(onPlay).toHaveBeenCalledTimes(1);
    expect(result.current.running).toBe('every');
    // Retry plays t1 again; when it ends the run asks for t2.
    rerender({ ...props, playingId: null, failedId: null });
    rerender({ ...props, playingId: 't1', failedId: null });
    rerender({ ...props, playingId: null, failedId: null });
    expect(onPlay).toHaveBeenCalledTimes(2);
    expect(onPlay.mock.calls[1]![0].id).toBe('t2');
  });
});
