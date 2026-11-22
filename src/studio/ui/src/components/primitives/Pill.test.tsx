// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Pill } from './Pill';

afterEach(cleanup);

describe('Pill', () => {
  it("is the same element, still focused, when a reason arrives for a caller that passes '' while it has none", () => {
    const { rerender } = render(<Pill label="Rendered file" active={false} disabledReason="" />);
    const before = screen.getByRole('button', { name: 'Rendered file' });
    before.focus();
    rerender(<Pill label="Rendered file" active={false} disabledReason="Saving the choice…" />);
    const after = screen.getByRole('button', { name: 'Rendered file' });
    expect(after).toBe(before);
    expect(document.activeElement).toBe(after);
    expect(after.getAttribute('aria-disabled')).toBe('true');
    expect(after.getAttribute('aria-describedby')).toBeTruthy();
  });

  it('does not invoke a disabled constrained pill', () => {
    const select = vi.fn();
    render(<Pill label="10m" active={false} disabled onClick={select} />);
    fireEvent.click(screen.getByRole('button', { name: '10m' }));
    expect(select).not.toHaveBeenCalled();
  });

  it('invokes onClick for an enabled pill and marks the active one', () => {
    const select = vi.fn();
    render(<Pill label="1m" active onClick={select} />);
    const button = screen.getByRole('button', { name: '1m' });
    expect(button.className).toContain('active');
    fireEvent.click(button);
    expect(select).toHaveBeenCalledOnce();
  });

  it('announces whether it is the selected one, by role and pressed state', () => {
    render(
      <>
        <Pill label="small" active={false} />
        <Pill label="medium" active />
      </>,
    );
    expect(screen.getByRole('button', { name: 'small', pressed: false })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'medium', pressed: true })).toBeTruthy();
  });

  it('invokes onClick for the keyboard too, and again on the already selected pill', async () => {
    const select = vi.fn();
    const user = userEvent.setup();
    render(<Pill label="medium" active onClick={select} />);
    await user.tab();
    await user.keyboard('{Enter}');
    await user.keyboard(' ');
    expect(select).toHaveBeenCalledTimes(2);
  });

  // The segmented look is still a pressed toggle underneath —
  // only ToggleGroup's container draws the border, so a segment carries none of its own.
  it('is still a pressed toggle in the segmented look, without its own border', () => {
    render(<Pill label="ACX" active look="segmented" />);
    const button = screen.getByRole('button', { name: 'ACX', pressed: true });
    expect(button.className).toContain('active');
    expect(button.className).not.toMatch(/(?:^|\s)border(?:\s|$)/);
  });

  it('an action chip is a plain button with no pressed state, draws its icon, and runs its action', async () => {
    const onClick = vi.fn();
    render(<Pill look="filter" action raised icon="showAbove" label="2 effects above" active={false} onClick={onClick} />);
    const chip = screen.getByRole('button', { name: '2 effects above' });
    expect(chip.hasAttribute('aria-pressed')).toBe(false);
    expect(chip.querySelector('svg[aria-hidden="true"]')).toBeTruthy();
    expect(chip.className).toContain('shadow-[var(--shadow-lg)]');
    await userEvent.click(chip);
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
