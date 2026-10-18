// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { useSettingsOrigin } from './useSettingsOrigin';

afterEach(cleanup);

/** The hook and the router's `navigate` side by side, so a test can move the narrator the way a link or the rail does. */
function mount(at: string) {
  const wrapper = ({ children }: { children: ReactNode }) => <MemoryRouter initialEntries={[at]}>{children}</MemoryRouter>;
  return renderHook(() => ({ origin: useSettingsOrigin(), navigate: useNavigate() }), { wrapper });
}

describe('useSettingsOrigin', () => {
  it('has no origin while the narrator is on an ordinary page', () => {
    const view = mount('/proof?chapter=chapter-1');
    expect(view.result.current.origin.origin).toBeUndefined();
  });

  it('arriving at Settings by the rail (no link, no hash) is not a link: no origin', () => {
    const view = mount('/proof?chapter=chapter-1');
    act(() => view.result.current.navigate('/settings'));
    expect(view.result.current.origin.origin).toBeUndefined();
  });

  it('a deep link (a hash) takes the page and query the narrator came from as the origin', () => {
    const view = mount('/proof?chapter=chapter-1');
    act(() => view.result.current.navigate('/settings#credits'));
    expect(view.result.current.origin.origin).toBe('/proof?chapter=chapter-1');
  });

  it('a deep link as the first address has "/" for its origin, there being no page before it', () => {
    const view = mount('/settings#credits');
    expect(view.result.current.origin.origin).toBe('/');
  });

  it('markLink() before the move counts as a link even with no hash, and only for that one move', () => {
    const view = mount('/booth');
    act(() => view.result.current.origin.markLink());
    act(() => view.result.current.navigate('/settings'));
    expect(view.result.current.origin.origin).toBe('/booth');
    act(() => view.result.current.navigate('/editing/chapter-1'));
    expect(view.result.current.origin.origin).toBeUndefined();
    act(() => view.result.current.navigate('/settings'));
    expect(view.result.current.origin.origin).toBeUndefined();
  });

  it('keeps the first origin while moving about Settings, and drops it on leaving', () => {
    const view = mount('/script');
    act(() => view.result.current.navigate('/settings#credits'));
    expect(view.result.current.origin.origin).toBe('/script');
    act(() => view.result.current.navigate('/settings#recording'));
    expect(view.result.current.origin.origin).toBe('/script');
    act(() => view.result.current.navigate('/pickups'));
    expect(view.result.current.origin.origin).toBeUndefined();
  });
});
