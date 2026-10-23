// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DecisionButtons } from './DecisionButtons';

afterEach(cleanup);

const pressed = () =>
  screen
    .getAllByRole('button')
    .filter((b) => b.getAttribute('aria-pressed') === 'true')
    .map((b) => b.textContent);

describe('decision-buttons-set-the-status-and-show-the-key', () => {
  it('is the group "Resolution" with four buttons, each carrying its key cap', () => {
    render(<DecisionButtons status="unreviewed" fix="pickup" onDecide={() => {}} />);
    const group = screen.getByRole('group', { name: 'Resolution' });
    expect(group.querySelectorAll('button')).toHaveLength(4);
    expect([...group.querySelectorAll('button')].map((b) => b.textContent)).toEqual(['Needs pickupP', 'Fix in editE', 'Fine as readW', 'DeferD']);
    expect(pressed()).toEqual([]);
  });

  it('maps the buttons to the stored statuses: pickup and edit are accepted, Fine as read is dismissed, Defer is deferred', async () => {
    const onDecide = vi.fn();
    render(<DecisionButtons status="unreviewed" fix="pickup" onDecide={onDecide} />);
    for (const name of ['Needs pickup', 'Fix in edit', 'Fine as read', 'Defer'])
      await userEvent.click(screen.getByRole('button', { name: new RegExp(`^${name}`) }));
    expect(onDecide.mock.calls.map(([s]) => s)).toEqual(['accepted', 'accepted', 'dismissed', 'deferred']);
  });

  it('allows every decision on any note, with no gate and no helper sentence', () => {
    for (const fix of ['pickup', 'edit'] as const) {
      const { unmount } = render(<DecisionButtons status="unreviewed" fix={fix} onDecide={() => {}} />);
      for (const button of screen.getByRole('group', { name: 'Resolution' }).querySelectorAll('button')) expect(button.disabled).toBe(false);
      expect(screen.queryByText(/re-recorded|fixed in the edit/)).toBeNull();
      unmount();
    }
  });

  it('presses the one that was chosen, the fix the note asks for deciding between the two accepted ones', () => {
    const { rerender } = render(<DecisionButtons status="accepted" fix="edit" onDecide={() => {}} />);
    expect(pressed()).toEqual(['Fix in editE']);
    rerender(<DecisionButtons status="accepted" fix="pickup" onDecide={() => {}} />);
    expect(pressed()).toEqual(['Needs pickupP']);
    rerender(<DecisionButtons status="dismissed" fix="pickup" onDecide={() => {}} />);
    expect(pressed()).toEqual(['Fine as readW']);
    rerender(<DecisionButtons status="deferred" fix="pickup" onDecide={() => {}} />);
    expect(pressed()).toEqual(['DeferD']);
  });

  it('is inert when disabled', async () => {
    const onDecide = vi.fn();
    render(<DecisionButtons status="unreviewed" fix="pickup" disabled onDecide={onDecide} />);
    await userEvent.click(screen.getByRole('button', { name: /^Fine as read/ }));
    expect(onDecide).not.toHaveBeenCalled();
  });
});
