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

describe('useToastClearance with several bars', () => {
  it('raises the toasts by all the bars at the bottom, so a notice above the footer stays uncovered, and lowers them as each goes', () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      return { height: Number(this.dataset.h) } as DOMRect;
    });
    function Tall({ id, h }: { id: string; h: number }) {
      const ref = useRef<HTMLDivElement>(null);
      useToastClearance(ref);
      return (
        <div ref={ref} data-h={h} id={id}>
          x
        </div>
      );
    }
    const read = () => document.documentElement.style.getPropertyValue(TOAST_CLEAR_VAR);
    const footer = render(<Tall id="footer" h={90} />);
    expect(read()).toBe('90px');
    const notice = render(<Tall id="notice" h={160} />);
    expect(read()).toBe('250px');
    notice.unmount();
    expect(read()).toBe('90px');
    footer.unmount();
    expect(read()).toBe('');
  });

  it("counts a bar's bottom margin, which is part of the space it takes", () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ height: 100 } as DOMRect);
    function Spaced() {
      const ref = useRef<HTMLDivElement>(null);
      useToastClearance(ref);
      return (
        <div ref={ref} style={{ marginBottom: '8px' }}>
          x
        </div>
      );
    }
    render(<Spaced />);
    expect(document.documentElement.style.getPropertyValue(TOAST_CLEAR_VAR)).toBe('108px');
  });
});
