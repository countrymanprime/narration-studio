// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { useSettingsOrigin } from './useSettingsOrigin';

function setup(initial: string) {
  const wrapper = ({ children }: { children: ReactNode }) => <MemoryRouter initialEntries={[initial]}>{children}</MemoryRouter>;
  return renderHook(() => ({ origin: useSettingsOrigin(), go: useNavigate() }), { wrapper });
}

afterEach(cleanup);

describe('useSettingsOrigin', () => {
  it('has no origin when Settings is reached by the rail', () => {
    const { result } = setup('/proof?chapter=2');
    act(() => result.current.go('/settings'));
    expect(result.current.origin.origin).toBeUndefined();
  });

  it('remembers the page a marked link came from', () => {
    const { result } = setup('/proof?chapter=2');
    act(() => result.current.origin.markLink());
    act(() => result.current.go('/settings'));
    expect(result.current.origin.origin).toBe('/proof?chapter=2');
  });

  it('remembers the page a deep link (a hash) came from', () => {
    const { result } = setup('/booth');
    act(() => result.current.go('/settings#credits'));
    expect(result.current.origin.origin).toBe('/booth');
  });

  it('forgets the origin once the narrator leaves Settings', () => {
    const { result } = setup('/booth');
    act(() => result.current.go('/settings#credits'));
    act(() => result.current.go('/script'));
    expect(result.current.origin.origin).toBeUndefined();
  });
});
