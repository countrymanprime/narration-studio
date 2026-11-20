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

  describe('allowEmpty', () => {
    function Emptiable({ onChange, start = null, commit }: { onChange: (value: number | null) => void; start?: number | null; commit?: 'input' | 'settle' }) {
      const [value, setValue] = useState<number | null>(start);
      return (
        <NumberInput
          allowEmpty
          label="Count"
          min={1}
          max={12}
          commit={commit}
          value={value}
          onValueChange={(next) => {
            setValue(next);
            onChange(next);
          }}
        />
      );
    }

    it('shows an unset value as an empty box, not 0', () => {
      render(<Emptiable onChange={() => undefined} />);
      expect(box().value).toBe('');
    });

    it('reports an emptied box as null at once and leaves it empty on blur', () => {
      const onChange = vi.fn();
      render(<Emptiable onChange={onChange} start={4} />);
      fireEvent.change(box(), { target: { value: '' } });
      expect(onChange).toHaveBeenLastCalledWith(null);
      fireEvent.blur(box());
      expect(box().value).toBe('');
      expect(onChange).toHaveBeenCalledTimes(1);
    });

    it('still reverts junk to the last value, and to empty when there was none', () => {
      const onChange = vi.fn();
      render(<Emptiable onChange={onChange} />);
      fireEvent.change(box(), { target: { value: 'abc' } });
      fireEvent.blur(box());
      expect(box().value).toBe('');
      expect(onChange).not.toHaveBeenCalled();
    });

    it('steps from an empty box to the minimum', async () => {
      const onChange = vi.fn();
      render(<Emptiable onChange={onChange} />);
      await userEvent.click(box());
      await userEvent.keyboard('{ArrowUp}');
      expect(onChange).toHaveBeenLastCalledWith(1);
      expect(box().value).toBe('1');
    });

    it('reports nothing for a box left empty that was empty', () => {
      const onChange = vi.fn();
      render(<Emptiable onChange={onChange} commit="settle" />);
      fireEvent.change(box(), { target: { value: '  ' } });
      fireEvent.blur(box());
      expect(onChange).not.toHaveBeenCalled();
    });
  });

  describe('commit="settle"', () => {
    function Settled({ onChange }: { onChange: (value: number) => void }) {
      const [value, setValue] = useState(3);
      return (
        <NumberInput
          label="Count"
          min={1}
          max={12}
          commit="settle"
          value={value}
          onValueChange={(next) => {
            setValue(next);
            onChange(next);
          }}
        />
      );
    }

    it('reports nothing while typing, then the value once on Enter', () => {
      const onChange = vi.fn();
      render(<Settled onChange={onChange} />);
      fireEvent.change(box(), { target: { value: '1' } });
      fireEvent.change(box(), { target: { value: '12' } });
      expect(onChange).not.toHaveBeenCalled();
      fireEvent.keyDown(box(), { key: 'Enter' });
      fireEvent.keyDown(box(), { key: 'Enter' });
      fireEvent.blur(box());
      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onChange).toHaveBeenLastCalledWith(12);
    });

    it('reports a clamped value on blur', () => {
      const onChange = vi.fn();
      render(<Settled onChange={onChange} />);
      fireEvent.change(box(), { target: { value: '99' } });
      fireEvent.blur(box());
      expect(onChange).toHaveBeenLastCalledWith(12);
      expect(box().value).toBe('12');
    });

    it('Escape drops the draft and reports nothing', () => {
      const onChange = vi.fn();
      render(<Settled onChange={onChange} />);
      fireEvent.change(box(), { target: { value: '7' } });
      fireEvent.keyDown(box(), { key: 'Escape' });
      expect(box().value).toBe('3');
      fireEvent.blur(box());
      expect(onChange).not.toHaveBeenCalled();
    });

    it('an arrow step reports at once, from the draft', async () => {
      const onChange = vi.fn();
      render(<Settled onChange={onChange} />);
      fireEvent.change(box(), { target: { value: '7' } });
      fireEvent.keyDown(box(), { key: 'ArrowUp' });
      expect(onChange).toHaveBeenLastCalledWith(8);
      expect(onChange).toHaveBeenCalledTimes(1);
    });

    it('without allowEmpty an emptied box reverts', () => {
      const onChange = vi.fn();
      render(<Settled onChange={onChange} />);
      fireEvent.change(box(), { target: { value: '' } });
      fireEvent.blur(box());
      expect(box().value).toBe('3');
      expect(onChange).not.toHaveBeenCalled();
    });
  });
});
