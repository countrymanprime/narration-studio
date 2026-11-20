// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { NumberSettingRange } from '../../../api/contracts/system';
import { SettingNumber } from './SettingNumber';

afterEach(cleanup);

const GAP: NumberSettingRange = { min: 0, max: null, step: 0.1, unit: 's' };
const CAP: NumberSettingRange = { min: 1, max: 100, step: 1, unit: '%' };

/** The box over a value the "host" keeps: `onChange` is the save, and the saved value comes back as the next `value`. */
function Kept({
  start,
  range = GAP,
  commit = 'settle',
  onChange,
}: {
  start: string;
  range?: NumberSettingRange;
  commit?: 'input' | 'settle';
  onChange: (value: string) => void;
}) {
  const [value, setValue] = useState(start);
  return (
    <SettingNumber
      label="Gap"
      value={value}
      range={range}
      commit={commit}
      onChange={(next) => {
        onChange(next);
        setValue(next);
      }}
    />
  );
}

const box = () => screen.getByRole('textbox', { name: 'Gap' }) as HTMLInputElement;
const type = (text: string) => fireEvent.change(box(), { target: { value: text } });

describe('SettingNumber', () => {
  it('shows an unset value as an empty box, not 0, with the range on the box and the unit beside it', () => {
    render(<Kept start="" range={CAP} onChange={vi.fn()} />);
    expect(box().value).toBe('');
    expect(box().inputMode).toBe('decimal');
    expect([box().getAttribute('min'), box().getAttribute('max'), box().getAttribute('step')]).toEqual(['1', '100', '1']);
    expect(screen.getByText('%')).toBeTruthy();
  });

  it('a unit of its own replaces the range unit', () => {
    render(<SettingNumber label="Gap" value="2" range={GAP} unit="seconds" commit="settle" onChange={vi.fn()} />);
    expect(screen.getByText('seconds')).toBeTruthy();
    expect(screen.queryByText('s')).toBeNull();
  });

  it('settle: reports nothing while typing, then the stored string once on Enter', () => {
    const onChange = vi.fn();
    render(<Kept start="2" onChange={onChange} />);
    type('1');
    type('1.5');
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.keyDown(box(), { key: 'Enter' });
    fireEvent.keyDown(box(), { key: 'Enter' });
    fireEvent.blur(box());
    expect(onChange).toHaveBeenCalledExactlyOnceWith('1.5');
  });

  it('clamps a value past the range to the limit on leaving the box', () => {
    const onChange = vi.fn();
    render(<Kept start="50" range={CAP} onChange={onChange} />);
    type('250');
    fireEvent.blur(box());
    expect(onChange).toHaveBeenCalledExactlyOnceWith('100');
    expect(box().value).toBe('100');
    type('-4');
    fireEvent.blur(box());
    expect(onChange).toHaveBeenLastCalledWith('1');
  });

  it('moves a value between steps onto the step', () => {
    const onChange = vi.fn();
    render(<Kept start="2" onChange={onChange} />);
    type('0.15');
    fireEvent.blur(box());
    expect(onChange).toHaveBeenCalledExactlyOnceWith('0.2');
    expect(box().value).toBe('0.2');
  });

  it('reports an emptied box as "", and puts the value back over text that is not a number', () => {
    const onChange = vi.fn();
    render(<Kept start="2" onChange={onChange} />);
    type('loud');
    fireEvent.blur(box());
    expect(box().value).toBe('2');
    expect(onChange).not.toHaveBeenCalled();
    type('');
    fireEvent.blur(box());
    expect(onChange).toHaveBeenCalledExactlyOnceWith('');
    expect(box().value).toBe('');
  });

  it('arrow keys step by the step and save', () => {
    const onChange = vi.fn();
    render(<Kept start="0.2" onChange={onChange} />);
    fireEvent.keyDown(box(), { key: 'ArrowUp' });
    expect(onChange).toHaveBeenLastCalledWith('0.3');
    fireEvent.keyDown(box(), { key: 'ArrowDown' });
    fireEvent.keyDown(box(), { key: 'ArrowDown' });
    expect(onChange).toHaveBeenLastCalledWith('0.1');
  });

  it('Escape drops what was typed and saves nothing', () => {
    const onChange = vi.fn();
    render(<Kept start="2" onChange={onChange} />);
    type('9');
    fireEvent.keyDown(box(), { key: 'Escape' });
    fireEvent.blur(box());
    expect(box().value).toBe('2');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('input: reports each valid value as typed, and the clamped one when the box is left', () => {
    const onChange = vi.fn();
    render(<Kept start="" range={CAP} commit="input" onChange={onChange} />);
    type('7');
    expect(onChange).toHaveBeenLastCalledWith('7');
    type('700');
    expect(onChange).toHaveBeenCalledTimes(1);
    fireEvent.blur(box());
    expect(onChange).toHaveBeenLastCalledWith('100');
    type('');
    expect(onChange).toHaveBeenLastCalledWith('');
  });

  it('shows the value being saved until the save ends, and sends it once', async () => {
    let done: (kept: boolean) => void = () => undefined;
    const onChange = vi.fn(() => new Promise<boolean>((resolve) => (done = resolve)));
    render(<SettingNumber label="Gap" value="2" range={GAP} commit="settle" onChange={onChange} />);
    type('5');
    fireEvent.keyDown(box(), { key: 'Enter' });
    fireEvent.keyDown(box(), { key: 'Enter' });
    expect(box().value).toBe('5');
    expect(onChange).toHaveBeenCalledExactlyOnceWith('5');
    // The host refused it: the box goes back to the value in force.
    await act(async () => done(false));
    expect(box().value).toBe('2');
  });

  it('a stored text that is not a number is an empty, marked box that names it, never 0', () => {
    render(<SettingNumber label="Gap" value="abc" range={GAP} commit="settle" onChange={vi.fn()} />);
    expect(box().value).toBe('');
    expect(box().placeholder).toBe('abc');
    expect(box().getAttribute('aria-invalid')).toBe('true');
  });

  it('passes id, description, disabled and invalid to the box', () => {
    render(<SettingNumber label="Gap" value="2" range={GAP} commit="settle" id="set-gap" describedBy="hint" disabled invalid onChange={vi.fn()} />);
    expect(box().id).toBe('set-gap');
    expect(box().getAttribute('aria-describedby')).toBe('hint');
    expect(box().disabled).toBe(true);
    expect(box().getAttribute('aria-invalid')).toBe('true');
  });
});
