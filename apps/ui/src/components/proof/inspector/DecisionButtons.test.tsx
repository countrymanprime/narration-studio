// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DecisionButtons, OTHER_FIX } from './DecisionButtons';

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
    expect([...group.querySelectorAll('button')].map((b) => b.textContent)).toEqual(['Needs pickupP', 'Fix in editE', 'WaiveW', 'DeferD']);
    expect(pressed()).toEqual([]);
  });

  it('maps the buttons to the stored statuses: pickup and edit are accepted, Waive is dismissed, Defer is deferred', async () => {
    const onDecide = vi.fn();
    render(<DecisionButtons status="unreviewed" fix="pickup" onDecide={onDecide} />);
    for (const name of ['Needs pickup', 'Fix in edit', 'Waive', 'Defer']) await userEvent.click(screen.getByRole('button', { name: new RegExp(`^${name}`) }));
    // Fix in edit is off for a note whose fix is a pickup, so it never saves a pickup in its name.
    expect(onDecide.mock.calls.map(([s]) => s)).toEqual(['accepted', 'dismissed', 'deferred']);
  });

  it('turns off the fix the note does not ask for, and says why', () => {
    const { rerender } = render(<DecisionButtons status="unreviewed" fix="pickup" onDecide={() => {}} />);
    expect((screen.getByRole('button', { name: /^Fix in edit/ }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: /^Needs pickup/ }) as HTMLButtonElement).disabled).toBe(false);
    expect(screen.getByText(OTHER_FIX.pickup)).toBeTruthy();
    rerender(<DecisionButtons status="unreviewed" fix="edit" onDecide={() => {}} />);
    expect((screen.getByRole('button', { name: /^Needs pickup/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(OTHER_FIX.edit)).toBeTruthy();
  });

  it('presses the one that was chosen, the fix the note asks for deciding between the two accepted ones', () => {
    const { rerender } = render(<DecisionButtons status="accepted" fix="edit" onDecide={() => {}} />);
    expect(pressed()).toEqual(['Fix in editE']);
    rerender(<DecisionButtons status="accepted" fix="pickup" onDecide={() => {}} />);
    expect(pressed()).toEqual(['Needs pickupP']);
    rerender(<DecisionButtons status="dismissed" fix="pickup" onDecide={() => {}} />);
    expect(pressed()).toEqual(['WaiveW']);
    rerender(<DecisionButtons status="deferred" fix="pickup" onDecide={() => {}} />);
    expect(pressed()).toEqual(['DeferD']);
  });

  it('is inert when disabled', async () => {
    const onDecide = vi.fn();
    render(<DecisionButtons status="unreviewed" fix="pickup" disabled onDecide={onDecide} />);
    await userEvent.click(screen.getByRole('button', { name: /^Waive/ }));
    expect(onDecide).not.toHaveBeenCalled();
  });
});
