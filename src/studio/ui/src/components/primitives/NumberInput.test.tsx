// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef, useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NumberInput } from './NumberInput';

afterEach(cleanup);

function Controlled({ onChange = () => undefined, start = 3 }: { onChange?: (value: number) => void; start?: number }) {
  const [value, setValue] = useState(start);
  return (
    <NumberInput
      label="Count"
      min={1}
      max={12}
      step={1}
      value={value}
      onValueChange={(next) => {
        setValue(next);
        onChange(next);
      }}
    />
  );
}

const box = (): HTMLInputElement => screen.getByLabelText('Count');

describe('NumberInput', () => {
  it('applies-a-valid-in-range-number-at-once', () => {
    const onChange = vi.fn();
    render(<Controlled onChange={onChange} />);
    fireEvent.change(box(), { target: { value: '7' } });
    expect(onChange).toHaveBeenCalledWith(7);
  });

  it('clamps-an-out-of-range-number-on-blur-and-on-enter', async () => {
    const onChange = vi.fn();
    render(<Controlled onChange={onChange} />);
    fireEvent.change(box(), { target: { value: '99' } });
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.blur(box());
    expect(onChange).toHaveBeenLastCalledWith(12);
    expect(box().value).toBe('12');
    fireEvent.change(box(), { target: { value: '-4' } });
    fireEvent.keyDown(box(), { key: 'Enter' });
    expect(onChange).toHaveBeenLastCalledWith(1);
    expect(box().value).toBe('1');
    await Promise.resolve();
    expect([box().selectionStart, box().selectionEnd]).toEqual([0, 1]);
  });

  it('reverts-an-empty-or-junk-entry-on-blur', () => {
    const onChange = vi.fn();
    render(<Controlled onChange={onChange} />);
    fireEvent.change(box(), { target: { value: '' } });
    fireEvent.blur(box());
    expect(box().value).toBe('3');
    fireEvent.change(box(), { target: { value: 'abc' } });
    fireEvent.blur(box());
    expect(box().value).toBe('3');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('arrow-keys-step-by-step', async () => {
    const onChange = vi.fn();
    render(<Controlled onChange={onChange} start={11} />);
    await userEvent.click(box());
    await userEvent.keyboard('{ArrowUp}');
    expect(onChange).toHaveBeenLastCalledWith(12);
    await userEvent.keyboard('{ArrowUp}');
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(box().value).toBe('12');
    await userEvent.keyboard('{ArrowDown}{ArrowDown}');
    expect(box().value).toBe('10');
  });

  it('arrow-keys-stop-at-min', async () => {
    render(<Controlled start={2} />);
    await userEvent.click(box());
    await userEvent.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}');
    expect(box().value).toBe('1');
  });

  it('steps by a fractional step without float drift', async () => {
    const onChange = vi.fn();
    render(<NumberInput label="Count" step={0.1} value={0.2} onValueChange={onChange} />);
    await userEvent.click(box());
    await userEvent.keyboard('{ArrowUp}');
    expect(onChange).toHaveBeenLastCalledWith(0.3);
  });

  it('exposes-min-max-step-and-disabled', async () => {
    const onChange = vi.fn();
    render(<NumberInput label="Count" min={1} max={8} step={2} value={4} onValueChange={onChange} disabled />);
    expect(screen.getByRole('textbox', { name: 'Count' })).toBe(box());
    expect([box().getAttribute('min'), box().getAttribute('max'), box().getAttribute('step')]).toEqual(['1', '8', '2']);
    expect(box().disabled).toBe(true);
    await userEvent.type(box(), '5');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('marks an invalid value', () => {
    render(<NumberInput label="Count" value={4} onValueChange={() => undefined} invalid />);
    expect(box().getAttribute('aria-invalid')).toBe('true');
  });

  it('forwards-ref-and-handlers', () => {
    const ref = createRef<HTMLInputElement>();
    const onBlur = vi.fn();
    const onKeyDown = vi.fn();
    render(<NumberInput ref={ref} label="Count" value={3} onValueChange={() => undefined} onBlur={onBlur} onKeyDown={onKeyDown} />);
    expect(ref.current).toBe(box());
    fireEvent.keyDown(box(), { key: 'a' });
    fireEvent.blur(box());
    expect(onKeyDown).toHaveBeenCalled();
    expect(onBlur).toHaveBeenCalled();
  });

  it('lets onKeyDown prevent the Enter settle', () => {
    const onChange = vi.fn();
    render(<NumberInput label="Count" max={12} value={3} onValueChange={onChange} onKeyDown={(event) => event.preventDefault()} />);
    fireEvent.change(box(), { target: { value: '99' } });
    fireEvent.keyDown(box(), { key: 'Enter' });
    expect(onChange).not.toHaveBeenCalled();
    expect(box().value).toBe('99');
  });
});
