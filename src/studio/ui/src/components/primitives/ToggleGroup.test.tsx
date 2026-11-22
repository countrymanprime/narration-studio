// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ToggleGroup } from './ToggleGroup';
import { TooltipProvider } from './Tooltip';

afterEach(cleanup);

const OPTIONS = [
  { value: 'Quiet', label: 'Quiet' },
  { value: 'Normal', label: 'Normal' },
  { value: 'Verbose', label: 'Verbose', disabled: true },
];

const PLATFORMS = [
  { value: 'acx', label: 'ACX' },
  { value: 'inaudio', label: 'iNaudio' },
  { value: 'kobo', label: 'Kobo' },
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

  // component-selection CS-K6 (#3681): every chip used to be a tab stop, so a five-option group cost five Tab presses to pass.
  describe('as one tab stop', () => {
    const chip = (name: string) => screen.getByRole('button', { name });

    it('takes Tab on the chosen chip and gives it up to what follows the group', async () => {
      const user = userEvent.setup();
      render(
        <>
          <Controlled />
          <button type="button">After</button>
        </>,
      );
      await user.tab();
      expect(document.activeElement).toBe(chip('Normal'));
      await user.tab();
      expect(document.activeElement).toBe(chip('After'));
      await user.tab({ shift: true });
      expect(document.activeElement).toBe(chip('Normal'));
    });

    it('takes Tab on the first chip that can take focus when no chip is chosen', async () => {
      const user = userEvent.setup();
      render(<ToggleGroup label="Log detail" value="" options={[{ ...OPTIONS[2] }, OPTIONS[0], OPTIONS[1]]} onChange={() => undefined} />);
      await user.tab();
      expect(document.activeElement).toBe(chip('Quiet'));
    });

    it('moves focus with the arrow keys, wrapping at the ends and skipping a disabled chip, and chooses nothing', async () => {
      const onChange = vi.fn();
      const user = userEvent.setup();
      render(<Controlled onChange={onChange} />);
      await user.tab();
      await user.keyboard('{ArrowRight}');
      expect(document.activeElement).toBe(chip('Quiet'));
      await user.keyboard('{ArrowLeft}');
      expect(document.activeElement).toBe(chip('Normal'));
      await user.keyboard('{ArrowUp}');
      expect(document.activeElement).toBe(chip('Quiet'));
      await user.keyboard('{ArrowDown}');
      expect(document.activeElement).toBe(chip('Normal'));
      expect(onChange).not.toHaveBeenCalled();
      expect(chip('Normal').getAttribute('aria-pressed')).toBe('true');
    });

    it('goes to the first chip on Home and the last on End', async () => {
      const user = userEvent.setup();
      render(<ToggleGroup label="Platform" value="inaudio" options={PLATFORMS} onChange={() => undefined} />);
      await user.tab();
      await user.keyboard('{End}');
      expect(document.activeElement).toBe(chip('Kobo'));
      await user.keyboard('{Home}');
      expect(document.activeElement).toBe(chip('ACX'));
    });

    it.each(['{Enter}', ' '])('chooses the focused chip on %j', async (key) => {
      const onChange = vi.fn();
      const user = userEvent.setup();
      render(<Controlled onChange={onChange} />);
      await user.tab();
      await user.keyboard('{ArrowLeft}');
      await user.keyboard(key);
      expect(onChange).toHaveBeenCalledExactlyOnceWith('Quiet');
      expect(chip('Quiet').getAttribute('aria-pressed')).toBe('true');
    });

    it('leaves the group on Tab from a chip the arrows reached, in either direction', async () => {
      const user = userEvent.setup();
      render(
        <>
          <button type="button">Before</button>
          <ToggleGroup label="Platform" value="inaudio" options={PLATFORMS} onChange={() => undefined} />
          <button type="button">After</button>
        </>,
      );
      chip('iNaudio').focus();
      await user.keyboard('{ArrowLeft}');
      expect(document.activeElement).toBe(chip('ACX'));
      await user.tab();
      expect(document.activeElement).toBe(chip('After'));
      chip('iNaudio').focus();
      await user.keyboard('{ArrowRight}');
      await user.tab({ shift: true });
      expect(document.activeElement).toBe(chip('Before'));
    });

    it('comes back to the chosen chip, not the one the arrows left', async () => {
      const user = userEvent.setup();
      render(<ToggleGroup label="Platform" value="inaudio" options={PLATFORMS} onChange={() => undefined} />);
      await user.tab();
      await user.keyboard('{End}');
      await user.tab();
      await user.tab({ shift: true });
      expect(document.activeElement).toBe(chip('iNaudio'));
    });

    it('keeps a chip that is off with a reason in the rotation, and a press on it chooses nothing', async () => {
      const onChange = vi.fn();
      const user = userEvent.setup();
      render(
        <TooltipProvider>
          <ToggleGroup
            label="Scope"
            value="all"
            onChange={onChange}
            options={[
              { value: 'all', label: 'All projects' },
              { value: 'project', label: 'This project', disabledReason: 'Open a project to see what it sets' },
            ]}
          />
        </TooltipProvider>,
      );
      await user.tab();
      await user.keyboard('{ArrowRight}');
      expect(document.activeElement).toBe(chip('This project'));
      await user.keyboard('{Enter}');
      expect(onChange).not.toHaveBeenCalled();
    });

    it('leaves a key held with a modifier to the page', async () => {
      const user = userEvent.setup();
      render(<Controlled />);
      await user.tab();
      await user.keyboard('{Control>}{ArrowRight}{/Control}');
      expect(document.activeElement).toBe(chip('Normal'));
    });
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

describe('ToggleGroup at a narrow width (#2642)', () => {
  it('lets a segmented group wrap and stay inside its container instead of clipping the last option', () => {
    render(<ToggleGroup label="My prep" look="segmented" value="Quiet" options={OPTIONS} onChange={() => undefined} />);
    const group = screen.getByRole('group', { name: 'My prep' });
    expect(group.className).toMatch(/(^|\s)flex-wrap(\s|$)/);
    expect(group.className).toMatch(/(^|\s)max-w-full(\s|$)/);
    expect(group.className).not.toMatch(/(^|\s)h-\[/);
  });
});
