// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { DialogFooter } from './DialogFooter';

afterEach(cleanup);

describe('DialogFooter', () => {
  // R3ED-10, XED-20: the body scrolled under the row with nothing to show there was more.
  it('shows a shadow over the body while more of it is below the row', () => {
    render(
      <div data-testid="body" style={{ overflowY: 'auto' }}>
        <p>A long question.</p>
        <DialogFooter>
          <button type="button">Cancel</button>
          <button type="button">Go</button>
        </DialogFooter>
      </div>,
    );
    const body = screen.getByTestId('body');
    Object.defineProperty(body, 'scrollHeight', { configurable: true, value: 900 });
    Object.defineProperty(body, 'clientHeight', { configurable: true, value: 500 });
    const footer = screen.getByRole('button', { name: 'Cancel' }).parentElement!;
    act(() => {
      fireEvent.scroll(body);
    });
    expect(footer.hasAttribute('data-more-below')).toBe(true);
    expect(footer.className).toMatch(/shadow-/);
    act(() => {
      body.scrollTop = 400;
      fireEvent.scroll(body);
    });
    expect(footer.hasAttribute('data-more-below')).toBe(false);
    expect(footer.className).not.toMatch(/shadow-/);
  });
});
