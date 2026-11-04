// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SplitButton, SplitMain, SplitSide } from './SplitButton';

afterEach(cleanup);

const drawn = (onMain = vi.fn(), onSide = vi.fn()) =>
  render(
    <SplitButton label="Recording">
      <SplitMain onClick={onMain}>Record</SplitMain>
      <SplitSide label="Levels" onClick={onSide} />
    </SplitButton>,
  );

describe('SplitButton', () => {
  it('is one named group of two buttons, each with its own name and press', async () => {
    const [main, side] = [vi.fn(), vi.fn()];
    drawn(main, side);
    expect(screen.getByRole('group', { name: 'Recording' })).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Record' }));
    await userEvent.click(screen.getByRole('button', { name: 'Levels' }));
    expect([main.mock.calls.length, side.mock.calls.length]).toEqual([1, 1]);
  });

  it('draws the cold-read tone as an info outline on both parts, and the accent fill otherwise', () => {
    render(
      <SplitButton label="Recording">
        <SplitMain tone="cold">Cold read</SplitMain>
        <SplitSide label="Levels" tone="cold" />
      </SplitButton>,
    );
    expect(screen.getByRole('button', { name: 'Cold read' }).className).toContain('border-[var(--info)]');
    expect(screen.getByRole('button', { name: 'Levels' }).className).toContain('border-[var(--info)]');
    cleanup();
    drawn();
    expect(screen.getByRole('button', { name: 'Record' }).className).toContain('bg-[var(--accent)]');
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
