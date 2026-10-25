// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ToggleGroup } from './ToggleGroup';

afterEach(cleanup);

const OPTIONS = [
  { value: 'Quiet', label: 'Quiet' },
  { value: 'Normal', label: 'Normal' },
  { value: 'Verbose', label: 'Verbose', disabled: true },
];

function Controlled({ onChange = () => undefined }: { onChange?: (value: string) => void }) {
  const [value, setValue] = useState('Normal');
  return (
    <ToggleGroup
      label="Log detail"
      value={value}
      options={OPTIONS}
      onChange={(next) => {
        onChange(next);
        setValue(next);
      }}
    />
  );
}

describe('ToggleGroup', () => {
  it('is a named group with the chosen chip pressed and the others not', () => {
    render(<Controlled />);
    const group = screen.getByRole('group', { name: 'Log detail' });
    const pressed = within(group)
      .getAllByRole('button')
      .map((chip) => [chip.textContent, chip.getAttribute('aria-pressed')]);
    expect(pressed).toEqual([
      ['Quiet', 'false'],
      ['Normal', 'true'],
      ['Verbose', 'false'],
    ]);
  });

  it('reports the value of the chip pressed and moves the press to it', async () => {
    const onChange = vi.fn();
    render(<Controlled onChange={onChange} />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Quiet' }));
    expect(onChange).toHaveBeenCalledWith('Quiet');
    expect(screen.getByRole('button', { name: 'Quiet' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Normal' }).getAttribute('aria-pressed')).toBe('false');
  });

  it('reports the chosen chip when it is pressed again, and the caller decides', async () => {
    const onChange = vi.fn();
    render(<Controlled onChange={onChange} />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Normal' }));
    expect(onChange).toHaveBeenCalledWith('Normal');
  });

  it('does not report a disabled chip', async () => {
    const onChange = vi.fn();
    render(<Controlled onChange={onChange} />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Verbose' }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('keeps every enabled chip a tab stop', async () => {
    const user = userEvent.setup();
    render(<Controlled />);
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Quiet' }));
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Normal' }));
  });

  // The segmented look (the Master platform switch): one container,
  // still a named group of pressed chips underneath.
  it('is the same group and chips in the segmented look', async () => {
    const onChange = vi.fn();
    render(
      <ToggleGroup
        label="Platform"
        look="segmented"
        value="acx"
        options={[
          { value: 'acx', label: 'ACX' },
          { value: 'kobo', label: 'Kobo' },
        ]}
        onChange={onChange}
      />,
    );
    const group = screen.getByRole('group', { name: 'Platform' });
    expect(within(group).getByRole('button', { name: 'ACX' }).getAttribute('aria-pressed')).toBe('true');
    await userEvent.setup().click(within(group).getByRole('button', { name: 'Kobo' }));
    expect(onChange).toHaveBeenCalledWith('kobo');
  });
  // Alignment audit cause L: the default group was a plain flex row, so chips squeezed their labels or ran out of the panel
  // unless each caller remembered `flex-wrap gap-1.5`.
  it('wraps its chips with a 6 px gap by default and never breaks a chip label', () => {
    render(<Controlled />);
    const group = screen.getByRole('group', { name: 'Log detail' });
    expect(group.className).toContain('[:where(&)]:flex-wrap');
    expect(group.className).toContain('[:where(&)]:gap-1.5');
    for (const chip of screen.getAllByRole('button')) expect(chip.className).toContain('whitespace-nowrap');
  });

  // XSE1-19, XPF-6: the segmented control was 33 px beside 36 px fields, and an unchosen half read as a bold label.
  it('draws the segmented look at the control height, its parts sharing the room and an unchosen part muted', () => {
    render(
      <ToggleGroup
        label="Author"
        look="segmented"
        value="proofer"
        onChange={() => undefined}
        options={[
          { value: 'proofer', label: 'Proofer replied' },
          { value: 'you', label: 'My note' },
        ]}
      />,
    );
    expect(screen.getByRole('group', { name: 'Author' }).className).toContain('h-[var(--control-height)]');
    const mine = screen.getByRole('button', { name: 'My note' });
    expect(mine.className).toContain('grow');
    expect(mine.className).toContain('text-[var(--text-muted)]');
  });
});
