// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
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
    // The range stays under the box whatever is typed (CS-N1).
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
});

// component-selection CS-E6 (#3681): the registry row says which control draws its choice.
describe('ValueControl, a choice drawn by the control its row declares', () => {
  const chunks = field({ kind: 'choice', choices: ['30', '60', '300'], value: '60' });
  const choiceRow = (over: Partial<SettingMeta>) => ({ id: 'row.id', label: 'Chunk length', unit: 's', ...over }) as SettingMeta;
  const draw = (meta: SettingMeta, over: { field?: ScopedSettingField; value?: string; which?: string } = {}) => {
    const onChange = vi.fn();
    render(
      <ValueControl
        row={meta}
        field={over.field ?? chunks}
        value={over.value ?? '60'}
        which={over.which}
        id="control"
        describedBy="about"
        onChange={onChange}
      />,
    );
    return onChange;
  };

  it('segmented: a group named for the row and whose value it is, the stored value pressed, a press saved once', () => {
    const onChange = draw(choiceRow({ control: 'segmented' }), { which: 'this project' });
    const group = screen.getByRole('group', { name: 'Chunk length (this project)' });
    expect(group.getAttribute('aria-describedby')).toBe('about');
    expect(within(group).getByRole('button', { name: '60 s' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(within(group).getByRole('button', { name: '300 s' }));
    expect(onChange.mock.calls).toEqual([['300']]);
  });

  it('segmented: a stored value the host no longer offers is a first, pressed segment that says what it is', () => {
    draw(choiceRow({ control: 'segmented' }), { value: '45' });
    expect(screen.getByRole('button', { name: '45 s' }).getAttribute('aria-pressed')).toBe('true');
    cleanup();
    draw(choiceRow({ control: 'segmented' }), { value: 'x' });
    expect(screen.getByRole('button', { name: 'x (invalid)' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('radio: a radio group in the registry’s words, the stored value checked, another option saved once', () => {
    const channel = field({ kind: 'choice', choices: ['candidates', 'stable'], value: 'candidates' });
    const meta = choiceRow({
      label: 'Update channel',
      unit: undefined,
      control: 'radio',
      options: { candidates: { label: 'Candidates and stable' }, stable: { label: 'Stable only' } },
    });
    const onChange = draw(meta, { field: channel, value: 'candidates' });
    const radios = within(screen.getByRole('radiogroup', { name: 'Update channel' }));
    expect(radios.getByRole('radio', { name: 'Candidates and stable' }).getAttribute('aria-checked')).toBe('true');
    fireEvent.click(radios.getByRole('radio', { name: 'Stable only' }));
    expect(onChange.mock.calls).toEqual([['stable']]);
  });

  it('select: the row’s id and one field width, as before', () => {
    draw(choiceRow({ control: 'select' }));
    const select = screen.getByRole('combobox', { name: 'Chunk length' }) as HTMLSelectElement;
    expect(select.id).toBe('control');
    expect(select.className).toContain('max-w-80');
    expect(Array.from(select.options).map((option) => option.textContent)).toEqual(['30 s', '60 s', '300 s']);
  });

  it('a row that declares nothing is a select', () => {
    draw(choiceRow({}));
    expect(screen.getByRole('combobox', { name: 'Chunk length' })).toBeTruthy();
  });

  describe('number, over a choice of consecutive whole numbers', () => {
    const tone = field({ kind: 'choice', choices: Array.from({ length: 11 }, (_, n) => String(n)), value: '0' });
    const toneRow = choiceRow({ label: 'Room tone', control: 'number' });
    const box = () => screen.getByRole('textbox', { name: 'Room tone' }) as HTMLInputElement;

    it('is a number box with the row’s id and unit and the range under it, and saves the whole number settled on as its stored text', () => {
      const onChange = draw(toneRow, { field: tone, value: '0' });
      expect(box().id).toBe('control');
      expect(box().value).toBe('0');
      expect(screen.getByText('s')).toBeTruthy();
      expect(screen.getByText('From 0 to 10 s')).toBeTruthy();
      fireEvent.change(box(), { target: { value: '2.6' } });
      expect(onChange).not.toHaveBeenCalled();
      fireEvent.blur(box());
      expect(onChange.mock.calls).toEqual([['3']]);
    });

    it('keeps a number past the choices inside them', () => {
      const onChange = draw(toneRow, { field: tone, value: '0' });
      fireEvent.change(box(), { target: { value: '99' } });
      fireEvent.keyDown(box(), { key: 'Enter' });
      expect(onChange.mock.calls).toEqual([['10']]);
    });

    it('shows a stored value that is not one of the numbers in a select that lists them, and never as 0', () => {
      draw(toneRow, { field: tone, value: 'abc' });
      expect(screen.queryByRole('textbox')).toBeNull();
      expect(screen.queryByText('From 0 to 10 s')).toBeNull();
      const select = screen.getByRole('combobox', { name: 'Room tone' }) as HTMLSelectElement;
      expect(select.value).toBe('abc');
      expect(select.options[0].textContent).toBe('abc (invalid)');
      expect(select.options).toHaveLength(12);
    });

    // A hand-edited -1 is one below the lowest choice: drawn as a box it had a minimum of -1, so an arrow could send a value the host refuses.
    it.each(['-1', '11'])(
      'shows a stored whole number just outside the choices (%s) in the select, with no range note and the eleven real choices',
      (stored) => {
        const onChange = draw(toneRow, { field: tone, value: stored });
        expect(screen.queryByRole('textbox')).toBeNull();
        expect(screen.queryByText(/^From /)).toBeNull();
        const select = screen.getByRole('combobox', { name: 'Room tone' }) as HTMLSelectElement;
        expect(select.value).toBe(stored);
        expect(Array.from(select.options).map((option) => option.value)).toEqual([stored, ...tone.choices]);
        fireEvent.change(select, { target: { value: '0' } });
        expect(onChange.mock.calls).toEqual([['0']]);
      },
    );

    // qa-breaker B1 on #3681: '' went to the host, which refuses it for a choice.
    it('an emptied box sends nothing and shows the stored value again', () => {
      const onChange = draw(toneRow, { field: tone, value: '7' });
      fireEvent.change(box(), { target: { value: '' } });
      fireEvent.keyDown(box(), { key: 'Enter' });
      expect(onChange).not.toHaveBeenCalled();
      expect(box().value).toBe('7');
    });

    it('the range note is part of the number box’s description, after the row’s own', () => {
      draw(toneRow, { field: tone, value: '0' });
      expect(box().getAttribute('aria-describedby')).toBe(`about ${screen.getByText('From 0 to 10 s').id}`);
    });
  });

  // The host offers Whisper alone as the live engine off Windows (qa-breaker B12 on #3681).
  it('a choice the host offers one option for is not drawn as a group: it is the option’s words', () => {
    const engine = field({ kind: 'choice', choices: ['whisper'], value: 'whisper' });
    const meta = choiceRow({ label: 'Live engine', unit: undefined, control: 'radio', options: { whisper: { label: 'Whisper' } } });
    draw(meta, { field: engine, value: 'whisper' });
    expect(screen.queryByRole('radiogroup')).toBeNull();
    expect(screen.queryByRole('radio')).toBeNull();
    expect(screen.getByText('Whisper').id).toBe('control');
  });
});

// qa-breaker B14 on #3681: the range and the unit were plain text beside the box, which a screen reader did not say with it.
describe('ValueControl, what describes a number box', () => {
  const numberRow = (unit?: string) => ({ id: 'row.id', label: 'Parallel processes', unit }) as SettingMeta;
  const box = () => screen.getByRole('textbox', { name: 'Parallel processes' }) as HTMLInputElement;
  const described = () => (box().getAttribute('aria-describedby') ?? '').split(' ').map((id) => document.getElementById(id)?.textContent ?? `#${id}`);
  const draw = (number: NonNullable<ScopedSettingField['number']>, unit?: string) =>
    render(
      <>
        <p id="about">How many at once.</p>
        <ValueControl row={numberRow(unit)} field={field({ kind: 'number', number })} value="4" id="control" describedBy="about" onChange={vi.fn()} />
      </>,
    );

  it('the range note is part of the number box’s description', () => {
    draw({ min: 0, max: 32, step: 1, unit: 'processes' });
    expect(described()).toEqual(['How many at once.', 'From 0 to 32 processes']);
  });

  it('with no range to note, the unit is', () => {
    draw({ min: null, max: null, step: 1, unit: 'words' });
    expect(described()).toEqual(['How many at once.', 'words']);
  });

  it('with neither, the row’s description alone', () => {
    draw({ min: null, max: null, step: 1, unit: '' });
    expect(described()).toEqual(['How many at once.']);
  });
});
