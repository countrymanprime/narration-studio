// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { ApiProvider } from '../../api/ApiContext';
import type { CoverageState } from '../../api/contracts/coverage';
import { createMockApi } from '../../api/mockApi';
import { useCoverageRuns } from './useCoverageRuns';

afterEach(cleanup);

const running = (chapterId: string, runId: string, percent = 10): CoverageState => ({ runId, chapterId, phase: 'running', percent, message: '' });

function setup(seed?: CoverageState) {
  let listener: (state: CoverageState) => void = () => undefined;
  const api = createMockApi({
    subscribeCoverage: (onUpdate) => {
      listener = onUpdate;
      return () => undefined;
    },
    coverageState: async () => seed ?? { phase: 'idle', percent: 0, message: '' },
  });
  const wrapper = ({ children }: { children: ReactNode }) => <ApiProvider api={api}>{children}</ApiProvider>;
  const hook = renderHook(() => useCoverageRuns(), { wrapper });
  return { hook, emit: (state: CoverageState) => act(() => listener(state)) };
}

describe('useCoverageRuns', () => {
  it('keeps each chapter its own state, so two runs never replace one another', async () => {
    const { hook, emit } = setup();
    emit(running('a', 'r1', 20));
    emit(running('b', 'r2', 70));
    emit(running('a', 'r1', 30));
    expect(hook.result.current.forChapter('a')).toMatchObject({ runId: 'r1', percent: 30 });
    expect(hook.result.current.forChapter('b')).toMatchObject({ runId: 'r2', percent: 70 });
    expect(hook.result.current.forChapter('c')).toEqual({ phase: 'idle', percent: 0, message: '' });
  });

  it('counts the other chapters running, not its own or the ended', () => {
    const { hook, emit } = setup();
    emit(running('a', 'r1'));
    emit(running('b', 'r2'));
    emit({ ...running('c', 'r3'), phase: 'complete', percent: 100 });
    expect(hook.result.current.othersRunning('a')).toBe(1);
    expect(hook.result.current.othersRunning('z')).toBe(2);
    emit({ ...running('b', 'r2'), phase: 'failed' });
    expect(hook.result.current.othersRunning('a')).toBe(0);
  });

  it('is seeded from the host so a check left running is picked up', async () => {
    const { hook } = setup(running('a', 'r1', 40));
    await act(async () => undefined);
    expect(hook.result.current.forChapter('a')).toMatchObject({ runId: 'r1', percent: 40 });
  });

  it('ignores a state that names no chapter', () => {
    const { hook, emit } = setup();
    emit({ phase: 'running', percent: 5, message: '' });
    expect(hook.result.current.othersRunning('x')).toBe(0);
  });
});
