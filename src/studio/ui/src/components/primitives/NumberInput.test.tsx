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

    // A dialog dismissed by a press outside takes the box away with no blur (qa-breaker B2 on #3681).
    it('a settle box that unmounts with a draft reports it', () => {
      const onChange = vi.fn();
      const { unmount } = render(<Settled onChange={onChange} />);
      fireEvent.change(box(), { target: { value: '99' } });
      unmount();
      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onChange).toHaveBeenLastCalledWith(12);
    });

    it('a settle box that unmounts after Escape, after Enter or untouched reports nothing more', () => {
      const onChange = vi.fn();
      const escaped = render(<Settled onChange={onChange} />);
      fireEvent.change(box(), { target: { value: '7' } });
      fireEvent.keyDown(box(), { key: 'Escape' });
      escaped.unmount();
      expect(onChange).not.toHaveBeenCalled();
      const entered = render(<Settled onChange={onChange} />);
      fireEvent.change(box(), { target: { value: '7' } });
      fireEvent.keyDown(box(), { key: 'Enter' });
      entered.unmount();
      expect(onChange).toHaveBeenCalledTimes(1);
      render(<Settled onChange={onChange} />).unmount();
      expect(onChange).toHaveBeenCalledTimes(1);
    });
  });

  it('an input box that unmounts with a draft out of range reports nothing', () => {
    const onChange = vi.fn();
    const { unmount } = render(<Controlled onChange={onChange} />);
    fireEvent.change(box(), { target: { value: '99' } });
    unmount();
    expect(onChange).not.toHaveBeenCalled();
  });

  // `Number()` reads these as 16, 3 and 100; nobody typing them means that, and the host calls them not a number (qa-breaker B8 on #3681).
  it.each(['0x10', '0b11', '1e2', '+5', 'Infinity', '1,000'])('%s is junk and reverts', (text) => {
    const onChange = vi.fn();
    render(<Controlled onChange={onChange} />);
    fireEvent.change(box(), { target: { value: text } });
    fireEvent.blur(box());
    expect(box().value).toBe('3');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('takes a number with spaces around it and one that starts or ends with the point', () => {
    const onChange = vi.fn();
    render(<Controlled onChange={onChange} />);
    fireEvent.change(box(), { target: { value: ' 7 ' } });
    expect(onChange).toHaveBeenLastCalledWith(7);
    fireEvent.change(box(), { target: { value: '8.' } });
    expect(onChange).toHaveBeenLastCalledWith(8);
  });

  describe('stepFrom', () => {
    function Stepped({ start, step, from, onChange }: { start: number; step: number; from: number; onChange: (value: number) => void }) {
      const [value, setValue] = useState(start);
      return (
        <NumberInput
          label="Count"
          step={step}
          stepFrom={from}
          value={value}
          onValueChange={(next) => {
            setValue(next);
            onChange(next);
          }}
        />
      );
    }

    it('an arrow from a value between steps lands on the next step, up or down', () => {
      const onChange = vi.fn();
      render(<Stepped start={0.15} step={0.1} from={0} onChange={onChange} />);
      fireEvent.keyDown(box(), { key: 'ArrowUp' });
      expect(onChange).toHaveBeenLastCalledWith(0.2);
      cleanup();
      render(<Stepped start={50.5} step={1} from={1} onChange={onChange} />);
      fireEvent.keyDown(box(), { key: 'ArrowDown' });
      expect(onChange).toHaveBeenLastCalledWith(50);
    });

    it('an arrow from a value on a step moves one step, counted from the origin', () => {
      const onChange = vi.fn();
      render(<Stepped start={0.3} step={0.1} from={0.1} onChange={onChange} />);
      fireEvent.keyDown(box(), { key: 'ArrowUp' });
      expect(onChange).toHaveBeenLastCalledWith(0.4);
      fireEvent.keyDown(box(), { key: 'ArrowDown' });
      fireEvent.keyDown(box(), { key: 'ArrowDown' });
      expect(onChange).toHaveBeenLastCalledWith(0.2);
    });
  });

  // unsaved-drafts.spec.ts "Alt+Left from a focused invalid number box asks every time": a form's box that dropped text that is not a number when
  // it was left let an exit leave without asking, and the text was gone.
  describe('onRefused, for a field of a form', () => {
    function Form({ onRefused, onValueChange = () => undefined }: { onRefused: (text: string) => void; onValueChange?: (value: number | null) => void }) {
      const [held, setHeld] = useState<string>();
      const [value, setValue] = useState<number | null>(4);
      return (
        <>
          <NumberInput
            label="Count"
            allowEmpty
            min={1}
            max={12}
            value={held === undefined ? value : null}
            heldText={held}
            onValueChange={(next) => {
              onValueChange(next);
              setHeld(undefined);
              setValue(next);
            }}
            onRefused={(text) => {
              onRefused(text);
              setHeld(text);
            }}
          />
          <button type="button" onClick={() => setHeld(undefined)}>
            Discard
          </button>
        </>
      );
    }

    it('hands text that is not a number to the form as it is typed, and the box keeps it when left', () => {
      const onRefused = vi.fn();
      render(<Form onRefused={onRefused} />);
      fireEvent.change(box(), { target: { value: ' abc ' } });
      expect(onRefused).toHaveBeenCalledExactlyOnceWith('abc');
      fireEvent.blur(box());
      expect(box().value).toBe('abc');
      expect(onRefused).toHaveBeenCalledTimes(1);
    });

    it('a number typed over the held text is reported, even the number the form held before it', () => {
      const onValueChange = vi.fn();
      render(<Form onRefused={vi.fn()} onValueChange={onValueChange} />);
      fireEvent.change(box(), { target: { value: 'abc' } });
      fireEvent.change(box(), { target: { value: '4' } });
      expect(onValueChange).toHaveBeenCalledExactlyOnceWith(4);
      fireEvent.blur(box());
      expect(box().value).toBe('4');
    });

    it('shows the value again when the form lets go of the text', () => {
      render(<Form onRefused={vi.fn()} />);
      fireEvent.change(box(), { target: { value: 'abc' } });
      fireEvent.blur(box());
      fireEvent.click(screen.getByRole('button', { name: 'Discard' }));
      expect(box().value).toBe('4');
    });

    it('does not hand over an emptied box that may not be empty: it reverts', () => {
      const onRefused = vi.fn();
      render(<NumberInput label="Count" value={3} onValueChange={vi.fn()} onRefused={onRefused} />);
      fireEvent.change(box(), { target: { value: ' ' } });
      fireEvent.blur(box());
      expect(onRefused).not.toHaveBeenCalled();
      expect(box().value).toBe('3');
    });
  });
});
