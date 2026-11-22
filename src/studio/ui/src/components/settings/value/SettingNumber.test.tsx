// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { NumberSettingRange, ScopedSettingField } from '../../../api/contracts/system';
import { wireSettings } from '../../../api/mockFixtures';
import { settingsForScopeSchema } from '../../../api/schemas/settings';
import { numberProblem } from '../numberSetting';
import { SettingNumber } from './SettingNumber';

afterEach(cleanup);

const GOLDEN_DIR = join(__dirname, '..', '..', '..', '..', '..', '..', '..', 'tests', 'fixtures', 'contracts');

/** Every number field's stored and effective value, in the host's settings goldens (both scopes) and the mock's settings, with its range. */
function hostDefaults(): [string, string, NumberSettingRange][] {
  const sources: [string, Record<string, ScopedSettingField[]>][] = [
    ...['settings-global.json', 'settings-project.json'].map((file): [string, Record<string, ScopedSettingField[]>] => [
      file,
      settingsForScopeSchema.parse(JSON.parse(readFileSync(join(GOLDEN_DIR, file), 'utf8'))),
    ]),
    ['mock', wireSettings()],
  ];
  return sources.flatMap(([source, tools]) =>
    Object.entries(tools).flatMap(([tool, fields]) =>
      fields.flatMap(({ kind, key, value, effectiveValue, number }) =>
        kind === 'number' && number
          ? [...new Set([value, effectiveValue])].map((text): [string, string, NumberSettingRange] => [
              `${source} ${tool}.${key} (${text || 'unset'})`,
              text,
              number,
            ])
          : [],
      ),
    ),
  );
}

const GAP: NumberSettingRange = { min: 0, max: null, step: 0.1, unit: 's' };
const CAP: NumberSettingRange = { min: 1, max: 100, step: 1, unit: '%' };

/** The box over a value the "host" keeps: `onChange` is the save, and the saved value comes back as the next `value`. */
function Kept({
  start,
  range = GAP,
  commit = 'settle',
  allowEmpty = true,
  onChange,
}: {
  start: string;
  range?: NumberSettingRange;
  commit?: 'input' | 'settle';
  allowEmpty?: boolean;
  onChange: (value: string) => void;
}) {
  const [value, setValue] = useState(start);
  return (
    <SettingNumber
      label="Gap"
      value={value}
      range={range}
      commit={commit}
      allowEmpty={allowEmpty}
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

  it('without allowEmpty an emptied box reports nothing and shows the stored value again', () => {
    const onChange = vi.fn();
    render(<Kept start="7" range={CAP} allowEmpty={false} onChange={onChange} />);
    type('');
    fireEvent.keyDown(box(), { key: 'Enter' });
    expect(onChange).not.toHaveBeenCalled();
    expect(box().value).toBe('7');
    type('');
    fireEvent.blur(box());
    expect(onChange).not.toHaveBeenCalled();
    expect(box().value).toBe('7');
  });

  /** A box whose saves stay out until the test ends them, over a stored value that follows the last save kept. */
  function slowHost(start: string, range: NumberSettingRange = CAP) {
    const ends: ((kept: boolean) => void)[] = [];
    const onChange = vi.fn((_: string) => new Promise<boolean>((resolve) => ends.push(resolve)));
    render(<SettingNumber label="Gap" value={start} range={range} commit="settle" onChange={onChange} />);
    return { onChange, ends };
  }

  // qa-breaker B4 on #3681: the box compared with the stored value, so the way back was dropped and the value on its way was kept.
  it('a value typed back to the stored one while a save is out is sent after it', async () => {
    const { onChange, ends } = slowHost('10');
    type('20');
    fireEvent.keyDown(box(), { key: 'Enter' });
    type('10');
    fireEvent.keyDown(box(), { key: 'Enter' });
    expect(onChange.mock.calls).toEqual([['20'], ['10']]);
    expect(box().value).toBe('10');
    // The first save ending does not take the second value off the box.
    await act(async () => ends[0](true));
    expect(box().value).toBe('10');
    await act(async () => ends[1](true));
    expect(box().value).toBe('10');
  });

  it('the value on its way typed again sends nothing', () => {
    const { onChange } = slowHost('10');
    type('20');
    fireEvent.keyDown(box(), { key: 'Enter' });
    type('20');
    fireEvent.keyDown(box(), { key: 'Enter' });
    expect(onChange).toHaveBeenCalledExactlyOnceWith('20');
  });

  // qa-breaker B7 on #3681: "1e+21" went to the host, which refuses an exponent.
  it.each(['1e21', '123456789012345678901234567890'])('a number too large to write plainly (%s) is not sent', (text) => {
    const onChange = vi.fn();
    render(<Kept start="2" onChange={onChange} />);
    type(text);
    fireEvent.keyDown(box(), { key: 'Enter' });
    expect(onChange).not.toHaveBeenCalled();
    expect(box().value).toBe('2');
  });

  // qa-breaker B9 on #3681: a hand-edited value the range refuses read as if it were fine.
  it.each([
    ['past the maximum', '500', CAP],
    ['under the minimum', '-3', GAP],
  ])('a stored number past the range is marked invalid: %s', (_, value, range) => {
    render(<SettingNumber label="Gap" value={value} range={range} commit="settle" onChange={vi.fn()} />);
    expect(box().value).toBe(value);
    expect(box().getAttribute('aria-invalid')).toBe('true');
  });

  // A hand-edited file can hold a number the host refuses for its step, as it can one past the range.
  it.each([
    ['2.5 for a whole number', '2.5', CAP],
    ['0.15 on a 0.1 step', '0.15', GAP],
  ])('a stored number between steps is marked invalid: %s', (_, value, range) => {
    render(<SettingNumber label="Gap" value={value} range={range} commit="settle" onChange={vi.fn()} />);
    expect(box().value).toBe(value);
    expect(box().getAttribute('aria-invalid')).toBe('true');
  });

  // Marking a number between steps is only right while no default the host ships is one (#4010 was two that were).
  it.each(hostDefaults())('the default of %s is not marked invalid', (_, text, range) => {
    expect(numberProblem(range, text)).toBeUndefined();
    render(<SettingNumber label="Gap" value={text} range={range} commit="settle" onChange={vi.fn()} />);
    expect(box().getAttribute('aria-invalid')).toBeNull();
  });

  it('a stored number the range accepts is not marked, nor is an unset one', () => {
    const { rerender } = render(<SettingNumber label="Gap" value="50" range={CAP} commit="settle" onChange={vi.fn()} />);
    expect(box().getAttribute('aria-invalid')).toBeNull();
    rerender(<SettingNumber label="Gap" value="" range={CAP} commit="settle" onChange={vi.fn()} />);
    expect(box().getAttribute('aria-invalid')).toBeNull();
  });

  it('a stored 0x10 is text that is not a number, never 16', () => {
    render(<SettingNumber label="Gap" value="0x10" range={GAP} commit="settle" onChange={vi.fn()} />);
    expect(box().value).toBe('');
    expect(box().placeholder).toBe('0x10');
    expect(box().getAttribute('aria-invalid')).toBe('true');
  });

  // qa-breaker B10 on #3681: 0.15 on a 0.1 step went to 0.3, 50.5 on a step of 1 to 52.
  it('an arrow from a value between steps lands on the next step', () => {
    const onChange = vi.fn();
    render(<Kept start="0.15" onChange={onChange} />);
    fireEvent.keyDown(box(), { key: 'ArrowUp' });
    expect(onChange).toHaveBeenLastCalledWith('0.2');
    cleanup();
    render(<Kept start="50.5" range={CAP} onChange={onChange} />);
    fireEvent.keyDown(box(), { key: 'ArrowUp' });
    expect(onChange).toHaveBeenLastCalledWith('51');
    cleanup();
    render(<Kept start="50.5" range={CAP} onChange={onChange} />);
    fireEvent.keyDown(box(), { key: 'ArrowDown' });
    expect(onChange).toHaveBeenLastCalledWith('50');
  });

  it('a unit with no range to note is what describes the box; with a range, the caller’s note is', () => {
    const { rerender } = render(
      <SettingNumber label="Gap" value="2" range={{ min: null, max: null, step: 1, unit: 'words' }} commit="settle" describedBy="about" onChange={vi.fn()} />,
    );
    const [about, unit] = (box().getAttribute('aria-describedby') ?? '').split(' ');
    expect(about).toBe('about');
    expect(document.getElementById(unit)?.textContent).toBe('words');
    rerender(<SettingNumber label="Gap" value="2" range={CAP} commit="settle" describedBy="about note" onChange={vi.fn()} />);
    expect(box().getAttribute('aria-describedby')).toBe('about note');
  });

  it('showRange writes the range under the box, describing it after the caller’s description; with no range to note it writes nothing', () => {
    const { rerender } = render(<SettingNumber label="Gap" value="2" range={CAP} commit="settle" describedBy="about" showRange onChange={vi.fn()} />);
    const [about, note] = (box().getAttribute('aria-describedby') ?? '').split(' ');
    expect(about).toBe('about');
    expect(document.getElementById(note)?.textContent).toBe('From 1 to 100 %');
    rerender(
      <SettingNumber
        label="Gap"
        value="2"
        range={{ min: null, max: null, step: 1, unit: '' }}
        commit="settle"
        describedBy="about"
        showRange
        onChange={vi.fn()}
      />,
    );
    expect(box().getAttribute('aria-describedby')).toBe('about');
    expect(screen.queryByText(/^From /)).toBeNull();
  });
});
