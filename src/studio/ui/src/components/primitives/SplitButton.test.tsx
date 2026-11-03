// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SplitButton, SplitMain, SplitSide, SplitToggle } from './SplitButton';

afterEach(cleanup);

const drawn = (onMain = vi.fn(), onToggle = vi.fn(), onSide = vi.fn()) =>
  render(
    <SplitButton label="Recording">
      <SplitMain onClick={onMain}>Record</SplitMain>
      <SplitToggle pressed={false} icon="microphone" hint="Follow your voice" onClick={onToggle}>
        Cold read
      </SplitToggle>
      <SplitSide label="Levels" onClick={onSide} />
    </SplitButton>,
  );

describe('SplitButton', () => {
  it('is one named group of three buttons, each with its own name and press', async () => {
    const [main, toggle, side] = [vi.fn(), vi.fn(), vi.fn()];
    drawn(main, toggle, side);
    expect(screen.getByRole('group', { name: 'Recording' })).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Record' }));
    await userEvent.click(screen.getByRole('button', { name: 'Cold read' }));
    await userEvent.click(screen.getByRole('button', { name: 'Levels' }));
    expect([main.mock.calls.length, toggle.mock.calls.length, side.mock.calls.length]).toEqual([1, 1, 1]);
  });

  it('keeps the switch name when only its icon is drawn, and reports its pressed state', () => {
    drawn();
    const toggle = screen.getByRole('button', { name: 'Cold read' });
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    expect(toggle.querySelector('.sr-only, .max-lg\\:sr-only')).not.toBeNull();
  });

  it('forwards its ref and attributes so a Popover can use the side as its trigger', () => {
    render(
      <SplitButton label="Recording">
        <SplitMain>Record</SplitMain>
        <SplitSide label="Levels" aria-haspopup="dialog" id="side" />
      </SplitButton>,
    );
    const side = screen.getByRole('button', { name: 'Levels' });
    expect(side.id).toBe('side');
    expect(side.getAttribute('aria-haspopup')).toBe('dialog');
  });
});
