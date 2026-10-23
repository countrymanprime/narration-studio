// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SkipToRail } from './SkipToRail';

afterEach(cleanup);

function mount() {
  render(
    <div>
      <SkipToRail />
      <div data-panel="rail">
        <div role="tablist">
          <button role="tab" aria-selected="false">
            Marks
          </button>
          <button role="tab" aria-selected="true">
            Words
          </button>
        </div>
      </div>
    </div>,
  );
}

describe('SkipToRail', () => {
  it('moves focus to the open tab of the side panel', async () => {
    mount();
    await userEvent.click(screen.getByRole('button', { name: 'Skip to the side panel' }));
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'Words' }));
  });

  it('is the first stop for the keyboard and is read by its name', async () => {
    mount();
    await userEvent.tab();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Skip to the side panel' }));
  });

  it('opens the drawer instead when the side panel is a closed drawer', async () => {
    const onOpenRail = vi.fn();
    render(
      <div>
        <SkipToRail onOpenRail={onOpenRail} />
        <div data-panel="rail" style={{ visibility: 'hidden' }}>
          <button role="tab" aria-selected="true">
            Words
          </button>
        </div>
      </div>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Skip to the side panel' }));
    expect(onOpenRail).toHaveBeenCalledOnce();
    expect(document.activeElement).not.toBe(document.querySelector('[role="tab"]'));
  });

  it('does nothing, and does not throw, when the panel is not drawn', async () => {
    render(<SkipToRail />);
    await userEvent.click(screen.getByRole('button', { name: 'Skip to the side panel' }));
    expect(document.activeElement).not.toBeNull();
  });
});
