// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Slider } from './Slider';

afterEach(cleanup);

function Controlled({ onChange, disabled, withHeader = true }: { onChange?: (value: number) => void; disabled?: boolean; withHeader?: boolean }) {
  const [value, setValue] = useState(20);
  return (
    <Slider
      id="speed"
      data-field="speed"
      aria-label={withHeader ? undefined : 'Speed'}
      label={withHeader ? 'Speed' : undefined}
      valueText={withHeader ? `${value} wpm` : undefined}
      min={0}
      max={100}
      step={1}
      value={value}
      disabled={disabled}
      onValueChange={(next) => {
        setValue(next);
        onChange?.(next);
      }}
    />
  );
}

describe('Slider', () => {
  it('slider-has-a-name-range-and-value-text', () => {
    render(<Controlled />);
    const range = screen.getByRole('slider', { name: 'Speed' });
    expect(range.id).toBe('speed');
    expect(range.getAttribute('data-field')).toBe('speed');
    expect([range.getAttribute('min'), range.getAttribute('max'), range.getAttribute('step')]).toEqual(['0', '100', '1']);
    expect(range.getAttribute('aria-valuenow')).toBe('20');
    expect(range.getAttribute('aria-valuetext')).toBe('20 wpm');
    expect(screen.getByText('20 wpm')).toBeTruthy();
  });

  it('is named by aria-label when there is no visible label', () => {
    render(<Controlled withHeader={false} />);
    expect(screen.getByRole('slider', { name: 'Speed' })).toBeTruthy();
  });

  it('arrows-home-end-change-the-value', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Controlled onChange={onChange} />);
    await user.tab();
    expect(screen.getByRole('slider')).toBe(document.activeElement);
    await user.keyboard('{ArrowRight}');
    expect(onChange).toHaveBeenLastCalledWith(21);
    await user.keyboard('{ArrowLeft}{ArrowLeft}');
    expect(onChange).toHaveBeenLastCalledWith(19);
    await user.keyboard('{PageUp}');
    expect(onChange).toHaveBeenLastCalledWith(29);
    await user.keyboard('{PageDown}');
    expect(onChange).toHaveBeenLastCalledWith(19);
    await user.keyboard('{End}');
    expect(onChange).toHaveBeenLastCalledWith(100);
    await user.keyboard('{Home}');
    expect(onChange).toHaveBeenLastCalledWith(0);
  });

  it('change-event-reports-the-number', () => {
    const onChange = vi.fn();
    render(<Controlled onChange={onChange} />);
    fireEvent.change(screen.getByRole('slider'), { target: { value: '8' } });
    expect(onChange).toHaveBeenCalledWith(8);
  });

  it('disabled-disables-the-range-input', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Controlled onChange={onChange} disabled />);
    const range = screen.getByRole('slider') as HTMLInputElement;
    expect(range.disabled).toBe(true);
    await user.tab();
    expect(document.activeElement).not.toBe(range);
    await user.keyboard('{ArrowRight}');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('header-row-is-optional', () => {
    const { container } = render(<Slider aria-label="Gap" value={3} min={0} max={10} onValueChange={() => undefined} />);
    expect(container.querySelector('b')).toBeNull();
    expect(container.textContent).toBe('');
    expect(screen.getByRole('slider', { name: 'Gap' }).getAttribute('aria-valuetext')).toBeNull();
  });
});
