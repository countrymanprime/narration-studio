// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { ApiProvider } from '../../../../api/ApiContext';
import { StudioProvider } from '../../../../studio/StudioProvider';
import { useScriptPrep } from '../data/useScriptData';
import { ONE, chapterHost } from './chapterFixtures';
import { useStepPrepFromKey } from './usePrepKeys';

afterEach(cleanup);

function setup(prep: Record<string, 'none' | 'progress' | 'prepped'>) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <ApiProvider api={chapterHost(prep, [])}>
      <StudioProvider>{children}</StudioProvider>
    </ApiProvider>
  );
  return renderHook(() => ({ step: useStepPrepFromKey(), prep: useScriptPrep() }), { wrapper });
}

describe('arrow keys on the reader step prep', () => {
  it('Right steps forward and Left back, and stops at either end', async () => {
    const hook = setup({ c1: 'none' });
    await waitFor(() => expect(hook.result.current.prep.status).toBe('ready'));
    const state = () => hook.result.current.prep.prepOf('c1');
    const press = async (key: string) => {
      let handled = false;
      await act(async () => {
        handled = hook.result.current.step(ONE, key);
        await new Promise((resolve) => setTimeout(resolve, 10));
      });
      return handled;
    };
    expect(await press('ArrowLeft')).toBe(true);
    expect(state()).toBe('none');
    expect(await press('ArrowRight')).toBe(true);
    await waitFor(() => expect(state()).toBe('progress'));
    expect(await press('ArrowRight')).toBe(true);
    await waitFor(() => expect(state()).toBe('prepped'));
    expect(await press('ArrowRight')).toBe(true);
    expect(state()).toBe('prepped');
    expect(await press('ArrowLeft')).toBe(true);
    await waitFor(() => expect(state()).toBe('progress'));
  });

  it('ignores other keys and a missing chapter', async () => {
    const hook = setup({});
    expect(hook.result.current.step(ONE, 'ArrowDown')).toBe(false);
    expect(hook.result.current.step(undefined, 'ArrowRight')).toBe(false);
  });
});
