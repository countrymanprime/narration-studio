// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { type ReactNode } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { ApiProvider } from '../../../../../api/ApiContext';
import { createMockApi } from '../../../../../api/mockApi';
import { StudioProvider } from '../../../../../studio/StudioProvider';
import { useFind } from './useFind';

afterEach(cleanup);

function setup(count: number) {
  const api = createMockApi();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <ApiProvider api={api}>
      <StudioProvider>{children}</StudioProvider>
    </ApiProvider>
  );
  return renderHook(() => useFind(count), { wrapper });
}

describe('ctrl-f-opens-find-with-the-selection-as-the-term', () => {
  it('openFind(term) opens Find on the term, and openFind() reopens it as it was', () => {
    const { result } = setup(3);
    act(() => result.current.openFind('queen'));
    expect(result.current.find).toMatchObject({ open: true, q: 'queen', i: 0, list: true });
    const asked = result.current.nonce;
    act(() => result.current.onClose());
    expect(result.current.find.open).toBe(false);
    act(() => result.current.openFind());
    expect(result.current.find).toMatchObject({ open: true, q: 'queen' });
    expect(result.current.nonce).toBe(asked + 1);
  });

  it('steps with wrap over the match count and picks', () => {
    const { result } = setup(3);
    act(() => result.current.openFind('queen'));
    act(() => result.current.onStep(-1));
    expect(result.current.find.i).toBe(2);
    act(() => result.current.onPick(1));
    expect(result.current.find).toMatchObject({ i: 1, list: false });
    act(() => result.current.onToggleList());
    expect(result.current.find.list).toBe(true);
    act(() => result.current.onQuery('king'));
    expect(result.current.find).toMatchObject({ q: 'king', i: 0 });
  });
});
