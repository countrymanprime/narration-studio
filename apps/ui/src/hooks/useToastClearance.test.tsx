// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { useRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TOAST_CLEAR_VAR, useToastClearance } from './useToastClearance';

function Bar() {
  const ref = useRef<HTMLDivElement>(null);
  useToastClearance(ref);
  return <div ref={ref}>bar</div>;
}

afterEach(() => {
  vi.restoreAllMocks();
  document.documentElement.style.removeProperty(TOAST_CLEAR_VAR);
});

describe('useToastClearance', () => {
  it('raises the toasts by the bar height while it is mounted and puts them back when it goes', () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ height: 96.4 } as DOMRect);
    const { unmount } = render(<Bar />);
    expect(document.documentElement.style.getPropertyValue(TOAST_CLEAR_VAR)).toBe('97px');
    unmount();
    expect(document.documentElement.style.getPropertyValue(TOAST_CLEAR_VAR)).toBe('');
  });

  it('follows the bar when the window is resized', () => {
    const rect = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ height: 60 } as DOMRect);
    render(<Bar />);
    expect(document.documentElement.style.getPropertyValue(TOAST_CLEAR_VAR)).toBe('60px');
    rect.mockReturnValue({ height: 140 } as DOMRect);
    window.dispatchEvent(new Event('resize'));
    expect(document.documentElement.style.getPropertyValue(TOAST_CLEAR_VAR)).toBe('140px');
  });
});
