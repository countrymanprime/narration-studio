// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Radio, RadioGroup } from './RadioGroup';

afterEach(cleanup);

const OPTIONS = [
  { value: 'reference', label: 'Not a chapter', description: 'A part title, an epigraph or a false split. Hidden from navigation too.' },
  { value: 'opening', label: 'Front matter', description: "Stays in the manuscript's navigation, not recorded as a chapter." },
] as const;

function Controlled({ onChange = () => undefined }: { onChange?: (next: 'reference' | 'opening') => void }) {
  const [value, setValue] = useState<'reference' | 'opening'>('reference');
  return (
    <RadioGroup
      label="What is it?"
      value={value}
      onChange={(next) => {
        onChange(next);
        setValue(next);
      }}
      options={OPTIONS}
    />
  );
}

describe('RadioGroup', () => {
  it('names the group and each option, with the description visible for both at once', () => {
    render(<Controlled />);
    expect(screen.getByRole('radiogroup', { name: 'What is it?' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Not a chapter' }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByRole('radio', { name: 'Front matter' }).getAttribute('aria-checked')).toBe('false');
    expect(screen.getByText(/A part title, an epigraph/)).toBeTruthy();
    expect(screen.getByText(/Stays in the manuscript/)).toBeTruthy();
  });

  it('switches on a click and reports the new value', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Controlled onChange={onChange} />);
    await user.click(screen.getByRole('radio', { name: 'Front matter' }));
    expect(onChange).toHaveBeenCalledWith('opening');
    expect(screen.getByRole('radio', { name: 'Front matter' }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByRole('radio', { name: 'Not a chapter' }).getAttribute('aria-checked')).toBe('false');
  });

  it('switches on the label text being pressed', async () => {
    const user = userEvent.setup();
    render(<Controlled />);
    await user.click(screen.getByText('Front matter'));
    expect(screen.getByRole('radio', { name: 'Front matter' }).getAttribute('aria-checked')).toBe('true');
  });

  it('moves with the arrow keys', async () => {
    const user = userEvent.setup();
    render(<Controlled />);
    await user.tab();
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('radio', { name: 'Front matter' }).getAttribute('aria-checked')).toBe('true');
  });

  it('draws an unselected option with --surface-3 and a --border rim', () => {
    render(<Controlled />);
    const unselected = screen.getByRole('radio', { name: 'Front matter' });
    expect(unselected.className).toContain('bg-[var(--surface-3)]');
    expect(unselected.className).toContain('border-[var(--border)]');
    expect(unselected.className).not.toContain('bg-[var(--surface)]');
  });

  it('arrow keys skip a disabled radio', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    function Three() {
      const [value, setValue] = useState<'a' | 'b' | 'c'>('a');
      return (
        <RadioGroup
          label="Theme"
          value={value}
          onChange={(next) => {
            onChange(next);
            setValue(next);
          }}
          options={[
            { value: 'a', label: 'Alpha' },
            { value: 'b', label: 'Beta', disabled: true },
            { value: 'c', label: 'Gamma' },
          ]}
        />
      );
    }
    render(<Three />);
    await user.tab();
    expect(screen.getByRole('radio', { name: 'Alpha' })).toBe(document.activeElement);
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('radio', { name: 'Gamma' }).getAttribute('aria-checked')).toBe('true');
    await user.keyboard('{ArrowUp}');
    expect(onChange.mock.calls.map((call) => call[0])).toEqual(['c', 'a']);
  });

  it('clicking the label of a disabled radio leaves it off', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      <RadioGroup
        label="Theme"
        value="a"
        onChange={onChange}
        options={[
          { value: 'a', label: 'Alpha' },
          { value: 'b', label: 'Beta', disabled: true },
        ]}
      />,
    );
    expect(screen.getByRole('radio', { name: 'Beta' }).getAttribute('aria-disabled')).toBe('true');
    await user.click(screen.getByText('Beta'));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole('radio', { name: 'Beta' }).getAttribute('aria-checked')).toBe('false');
  });

  it("each option's description is its aria-describedby", () => {
    render(<Controlled />);
    for (const option of OPTIONS) {
      const radio = screen.getByRole('radio', { name: option.label });
      const id = radio.getAttribute('aria-describedby');
      expect(id).toBeTruthy();
      const description = document.getElementById(id as string);
      expect(description?.textContent).toBe(option.description);
      expect(screen.getByText(option.description)).toBe(description);
    }
  });

  it('leaves aria-describedby off an option without a description', () => {
    render(<RadioGroup label="Theme" value="a" onChange={() => undefined} options={[{ value: 'a', label: 'Alpha' }]} />);
    expect(screen.getByRole('radio', { name: 'Alpha' }).hasAttribute('aria-describedby')).toBe(false);
  });

  it('a standalone Radio works controlled by checked', async () => {
    const onCheckedChange = vi.fn();
    const user = userEvent.setup();
    function Solo() {
      const [checked, setChecked] = useState(false);
      return (
        <Radio
          name="solo"
          value="v"
          label="Solo"
          description="Picked on its own."
          checked={checked}
          onCheckedChange={() => {
            onCheckedChange();
            setChecked(true);
          }}
        />
      );
    }
    render(<Solo />);
    const radio = screen.getByRole('radio', { name: 'Solo' });
    expect(radio.getAttribute('aria-checked')).toBe('false');
    expect(document.getElementById(radio.getAttribute('aria-describedby') as string)?.textContent).toBe('Picked on its own.');
    await user.click(radio);
    expect(onCheckedChange).toHaveBeenCalledTimes(1);
    expect(radio.getAttribute('aria-checked')).toBe('true');
  });
});
