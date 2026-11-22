// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ScopedSettingField } from '../../../types';
import type { SettingMeta } from '../registry/types';
import { ValueControl } from './ValueControl';

afterEach(cleanup);

const field = (over: Partial<ScopedSettingField>): ScopedSettingField => ({
  key: 'k',
  label: 'Label',
  kind: 'text',
  choices: [],
  value: '',
  isSet: true,
  effectiveValue: '',
  effectiveSource: 'global',
  ...over,
});
// The control reads a row's id, label and unit only.
const row = (label: string, id = 'row.id') => ({ id, label }) as SettingMeta;

/** The control over a value the "host" keeps: `onChange` is the save, and the saved value comes back as the next `value`. */
function Row({
  label,
  kind,
  start,
  which,
  onChange,
}: {
  label: string;
  kind: ScopedSettingField['kind'];
  start: string;
  which?: string;
  onChange: (value: string) => void;
}) {
  const [value, setValue] = useState(start);
  return (
    <ValueControl
      row={row(label)}
      field={field({ kind, number: kind === 'number' ? { min: 0, max: 10, step: null, unit: 's' } : undefined })}
      value={value}
      which={which}
      id="control"
      onChange={(next) => {
        onChange(next);
        setValue(next);
      }}
    />
  );
}

describe('ValueControl, a colour (#3680, S4)', () => {
  const hex = (name = 'Note colour hex') => screen.getByRole('textbox', { name }) as HTMLInputElement;
  const picker = (name = 'Note colour') => screen.getByLabelText(name, { selector: 'input[type="color"]' }) as HTMLInputElement;

  it('is a picker and a hex box, named for the row and for whose value it is', () => {
    render(<Row label="Note colour" kind="color" start="B5473C" which="this project" onChange={vi.fn()} />);
    expect(picker('Note colour (this project)').type).toBe('color');
    expect(picker('Note colour (this project)').value).toBe('#b5473c');
    expect(hex('Note colour (this project) hex').value).toBe('B5473C');
    // The row's visible label points at the hex box.
    expect(hex('Note colour (this project) hex').id).toBe('control');
  });

  it('saves a typed colour on Enter or on leaving the box, in capitals without the hash, and never per key', () => {
    const onChange = vi.fn();
    render(<Row label="Note colour" kind="color" start="B5473C" onChange={onChange} />);
    fireEvent.change(hex(), { target: { value: '#3f6' } });
    fireEvent.change(hex(), { target: { value: '#3f6ea6' } });
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.keyDown(hex(), { key: 'Enter' });
    expect(onChange).toHaveBeenCalledExactlyOnceWith('3F6EA6');
    fireEvent.change(hex(), { target: { value: '000000' } });
    fireEvent.blur(hex());
    expect(onChange).toHaveBeenLastCalledWith('000000');
  });

  // Before #3680 the row sent whatever was typed and the host answered "must be a six-digit color"; now what is not a colour never leaves the box.
  it('does not send text that is not six hex digits: it stays in the box, marked, with what to type', () => {
    const onChange = vi.fn();
    render(<Row label="Note colour" kind="color" start="B5473C" onChange={onChange} />);
    for (const text of ['B85C1', 'ZZZZZZ', 'B5473C0', '']) {
      fireEvent.change(hex(), { target: { value: text } });
      fireEvent.blur(hex());
      expect(hex().value).toBe(text);
      expect(hex().getAttribute('aria-invalid')).toBe('true');
    }
    expect(onChange).not.toHaveBeenCalled();
    expect(document.getElementById(hex().getAttribute('aria-describedby')!.split(' ')[0]!)?.textContent).toBe('Six hex digits, like B5473C');
    fireEvent.keyDown(hex(), { key: 'Escape' });
    expect(hex().value).toBe('B5473C');
    expect(hex().getAttribute('aria-invalid')).toBeNull();
  });

  it('saves a picked colour once, when the picker closes, not on each step of a drag', () => {
    const onChange = vi.fn();
    render(<Row label="Note colour" kind="color" start="B5473C" onChange={onChange} />);
    for (const step of ['#a00000', '#a10000', '#a1b200', '#a1b2c3']) fireEvent.input(picker(), { target: { value: step } });
    expect(onChange).not.toHaveBeenCalled();
    act(() => void picker().dispatchEvent(new Event('change', { bubbles: true })));
    expect(onChange).toHaveBeenCalledExactlyOnceWith('A1B2C3');
    expect(hex().value).toBe('A1B2C3');
  });

  it("carries the row's own verdict and description to the hex box, and turns both controls off when disabled", () => {
    render(
      <>
        <span id="hint">From the host</span>
        <ValueControl
          row={row('Note colour')}
          field={field({ kind: 'color' })}
          value="B5473C"
          id="control"
          describedBy="hint"
          invalid
          disabled
          onChange={vi.fn()}
        />
      </>,
    );
    expect(hex().getAttribute('aria-invalid')).toBe('true');
    expect(hex().getAttribute('aria-describedby')).toBe('hint');
    expect(hex().disabled).toBe(true);
    expect(picker().disabled).toBe(true);
  });
});

// A box of a plain setting saves when the narrator is done with it, never per key: text on `useSettledDraft`, a number on `NumberInput`.
describe('ValueControl, a text or number box settles the same way', () => {
  const box = (name: string) => screen.getByRole('textbox', { name }) as HTMLInputElement;

  it('text: typing saves nothing, Enter and leaving save a changed value once, Escape puts the value back', () => {
    const onChange = vi.fn();
    render(<Row label="Narrator" kind="text" start="Ann" onChange={onChange} />);
    fireEvent.change(box('Narrator'), { target: { value: 'Anne' } });
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.keyDown(box('Narrator'), { key: 'Enter' });
    expect(onChange).toHaveBeenCalledExactlyOnceWith('Anne');
    fireEvent.blur(box('Narrator'));
    expect(onChange).toHaveBeenCalledTimes(1);
    fireEvent.change(box('Narrator'), { target: { value: 'Bob' } });
    fireEvent.keyDown(box('Narrator'), { key: 'Escape' });
    expect(box('Narrator').value).toBe('Anne');
    fireEvent.blur(box('Narrator'));
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('text: a key pressed in the first frame is kept, and a value from outside replaces the draft', () => {
    const onChange = vi.fn();
    const view = render(<ValueControl row={row('Narrator')} field={field({})} value="Ann" id="control" onChange={onChange} />);
    fireEvent.change(box('Narrator'), { target: { value: 'Anne' } });
    expect(box('Narrator').value).toBe('Anne');
    view.rerender(<ValueControl row={row('Narrator')} field={field({})} value="Zed" id="control" onChange={onChange} />);
    expect(box('Narrator').value).toBe('Zed');
    fireEvent.blur(box('Narrator'));
    expect(onChange).not.toHaveBeenCalled();
  });

  // This test pinned the red refusal line of #2989 ("one out of range is refused with the reason and not saved"). The owner's rule CS-N1
  // (#3681) changed that on purpose: the box saves the nearest limit, and the range note stays under it.
  it('number: a value in range is saved trimmed on leaving; one out of range is saved as the nearest limit, with no refusal line', () => {
    const onChange = vi.fn();
    render(<Row label="Gap" kind="number" start="2" onChange={onChange} />);
    fireEvent.change(box('Gap'), { target: { value: ' 5 ' } });
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.blur(box('Gap'));
    expect(onChange).toHaveBeenCalledExactlyOnceWith('5');
    fireEvent.change(box('Gap'), { target: { value: '99' } });
    fireEvent.keyDown(box('Gap'), { key: 'Enter' });
    expect(onChange).toHaveBeenLastCalledWith('10');
    expect(box('Gap').value).toBe('10');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(box('Gap').getAttribute('aria-invalid')).toBeNull();
    expect(screen.getByText('From 0 to 10 s')).toBeTruthy();
  });

  it('number: an unset value is an empty box, an emptied one is saved as "", and the row unit wins over the host one', () => {
    const onChange = vi.fn();
    const number = { min: 0, max: 10, step: 1, unit: 's' };
    const unitRow = { id: 'row.id', label: 'Gap', unit: 'seconds' } as SettingMeta;
    const view = render(<ValueControl row={unitRow} field={field({ kind: 'number', number })} value="" id="control" onChange={onChange} />);
    expect(box('Gap').value).toBe('');
    expect(box('Gap').id).toBe('control');
    expect(screen.getByText('seconds')).toBeTruthy();
    view.rerender(<ValueControl row={unitRow} field={field({ kind: 'number', number })} value="4" id="control" onChange={onChange} />);
    fireEvent.change(box('Gap'), { target: { value: '' } });
    fireEvent.blur(box('Gap'));
    expect(onChange).toHaveBeenCalledExactlyOnceWith('');
  });

  it('number: the range note describes the box after the row description, and a stored number past the range is marked', () => {
    const number = { min: 0, max: 10, step: 1, unit: 's' };
    render(<ValueControl row={row('Gap')} field={field({ kind: 'number', number })} value="99" id="control" describedBy="about" onChange={vi.fn()} />);
    const [about, note] = (box('Gap').getAttribute('aria-describedby') ?? '').split(' ');
    expect(about).toBe('about');
    expect(document.getElementById(note)?.textContent).toBe('From 0 to 10 s');
    expect(box('Gap').getAttribute('aria-invalid')).toBe('true');
  });
});
