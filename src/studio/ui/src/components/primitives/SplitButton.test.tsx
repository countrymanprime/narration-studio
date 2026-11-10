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
      <SplitSide label="Record options" onClick={onSide} />
    </SplitButton>,
  );

describe('SplitButton', () => {
  it('is one named group of two buttons, each with its own name and press', async () => {
    const [main, side] = [vi.fn(), vi.fn()];
    drawn(main, side);
    expect(screen.getByRole('group', { name: 'Recording' })).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Record' }));
    await userEvent.click(screen.getByRole('button', { name: 'Record options' }));
    expect([main.mock.calls.length, side.mock.calls.length]).toEqual([1, 1]);
  });

  it('draws the cold-read tone as an info outline on both parts, and the accent fill otherwise', () => {
    render(
      <SplitButton label="Recording">
        <SplitMain tone="cold">Cold read</SplitMain>
        <SplitSide label="Record options" tone="cold" />
      </SplitButton>,
    );
    expect(screen.getByRole('button', { name: 'Cold read' }).className).toContain('border-[var(--info)]');
    expect(screen.getByRole('button', { name: 'Record options' }).className).toContain('border-[var(--info)]');
    cleanup();
    drawn();
    expect(screen.getByRole('button', { name: 'Record' }).className).toContain('bg-[var(--accent)]');
  });

  it('pending says so as Button does: busy, a spinner, a press ignored, still focusable', async () => {
    const onMain = vi.fn();
    render(
      <SplitButton label="Recording">
        <SplitMain pending onClick={onMain}>
          Record
        </SplitMain>
        <SplitSide label="Record options" />
      </SplitButton>,
    );
    const main = screen.getByRole('button', { name: 'Record' });
    expect(main.getAttribute('aria-busy')).toBe('true');
    expect(main.getAttribute('aria-disabled')).toBe('true');
    expect(main.hasAttribute('disabled')).toBe(false);
    expect(main.querySelector('svg')).toBeTruthy();
    await userEvent.click(main);
    expect(onMain).not.toHaveBeenCalled();
    cleanup();
    drawn();
    expect(screen.getByRole('button', { name: 'Record' }).getAttribute('aria-busy')).toBeNull();
  });

  it('forwards its ref and attributes so a Popover can use the side as its trigger', () => {
    render(
      <SplitButton label="Recording">
        <SplitMain>Record</SplitMain>
        <SplitSide label="Record options" aria-haspopup="dialog" id="side" />
      </SplitButton>,
    );
    const side = screen.getByRole('button', { name: 'Record options' });
    expect(side.id).toBe('side');
    expect(side.getAttribute('aria-haspopup')).toBe('dialog');
  });
});
