// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ChoiceControl } from '../registry/types';
import { isGroupControl, SettingChoice, type SettingChoiceProps } from './SettingChoice';

afterEach(cleanup);

const CHUNKS = [
  { value: '30', label: '30 s' },
  { value: '60', label: '60 s' },
  { value: '300', label: '300 s' },
];
const TONE = Array.from({ length: 11 }, (_, n) => ({ value: String(n), label: `${n} s` }));

function draw(control: ChoiceControl, props: Partial<SettingChoiceProps> = {}) {
  const onChange = vi.fn();
  render(
    <>
      <p id="about">How long a piece is.</p>
      <SettingChoice control={control} label="Chunk length" value="60" options={CHUNKS} onChange={onChange} {...props} />
    </>,
  );
  return onChange;
}

const group = () => screen.getByRole('group', { name: 'Chunk length' });
const radios = () => screen.getByRole('radiogroup', { name: 'Chunk length' });
const select = () => screen.getByRole('combobox', { name: 'Chunk length' }) as HTMLSelectElement;

describe('SettingChoice as a segmented group', () => {
  it('is a named group with the stored value pressed, and reports the value of another segment once', async () => {
    const onChange = draw('segmented');
    expect(
      within(group())
        .getAllByRole('button')
        .map((chip) => chip.textContent),
    ).toEqual(['30 s', '60 s', '300 s']);
    expect(within(group()).getByRole('button', { name: '60 s' }).getAttribute('aria-pressed')).toBe('true');
    await userEvent.setup().click(within(group()).getByRole('button', { name: '300 s' }));
    expect(onChange.mock.calls).toEqual([['300']]);
  });

  it('saves nothing when the chosen segment is pressed again', async () => {
    const onChange = draw('segmented');
    await userEvent.setup().click(within(group()).getByRole('button', { name: '60 s' }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('shows a stored value the host no longer offers as a first, pressed segment', () => {
    draw('segmented', { value: '45', staleLabel: (value) => `${value} s` });
    const chips = within(group()).getAllByRole('button');
    expect(chips.map((chip) => chip.textContent)).toEqual(['45 s', '30 s', '60 s', '300 s']);
    expect(chips.map((chip) => chip.getAttribute('aria-pressed'))).toEqual(['true', 'false', 'false', 'false']);
  });

  it('is off as a whole, and described by the text its row names', () => {
    draw('segmented', { disabled: true, describedBy: 'about' });
    expect(group().getAttribute('aria-describedby')).toBe('about');
    for (const chip of within(group()).getAllByRole('button')) expect((chip as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('SettingChoice as radios', () => {
  it('is a named radio group with the stored value checked, and reports another option once', async () => {
    const onChange = draw('radio');
    expect(within(radios()).getByRole('radio', { name: '60 s' }).getAttribute('aria-checked')).toBe('true');
    await userEvent.setup().click(within(radios()).getByRole('radio', { name: '30 s' }));
    expect(onChange.mock.calls).toEqual([['30']]);
  });

  it('shows a stored value the host no longer offers as a first, checked option, named by the value when no label is given', () => {
    draw('radio', { value: 'abc' });
    const options = within(radios()).getAllByRole('radio');
    expect(options).toHaveLength(4);
    expect(options[0].getAttribute('aria-checked')).toBe('true');
    expect(within(radios()).getByRole('radio', { name: 'abc' })).toBe(options[0]);
  });

  it('is off as a whole, and described by the text its row names', () => {
    draw('radio', { disabled: true, describedBy: 'about' });
    expect(radios().getAttribute('aria-describedby')).toBe('about');
    for (const option of within(radios()).getAllByRole('radio')) expect(option.getAttribute('aria-disabled')).toBe('true');
  });
});

describe('SettingChoice as a select', () => {
  it('is a named select on the stored value, with the id and the width its caller gives, and reports the option picked once', () => {
    const onChange = draw('select', { id: 'set-row', selectClassName: 'w-full max-w-80', describedBy: 'about' });
    expect(select().value).toBe('60');
    expect(select().id).toBe('set-row');
    expect(select().className).toContain('max-w-80');
    expect(select().getAttribute('aria-describedby')).toBe('about');
    fireEvent.change(select(), { target: { value: '300' } });
    expect(onChange.mock.calls).toEqual([['300']]);
  });

  it('shows a stored value the host no longer offers as a first, selected option', () => {
    draw('select', { value: '45', staleLabel: (value) => `${value} s` });
    expect(Array.from(select().options).map((option) => option.textContent)).toEqual(['45 s', '30 s', '60 s', '300 s']);
    expect(select().value).toBe('45');
  });

  it('is off when disabled', () => {
    draw('select', { disabled: true });
    expect(select().disabled).toBe(true);
  });
});

describe('SettingChoice as a number box', () => {
  const box = () => screen.getByRole('textbox', { name: 'Chunk length' }) as HTMLInputElement;

  it('is a number box over the lowest and highest choice in whole steps, with its unit, and reports the stored text when the narrator settles', () => {
    const onChange = draw('number', { value: '2', options: TONE, unit: 's', id: 'set-row', describedBy: 'about' });
    expect(box().value).toBe('2');
    expect(box().id).toBe('set-row');
    expect([box().getAttribute('min'), box().getAttribute('max'), box().getAttribute('step')]).toEqual(['0', '10', '1']);
    expect(box().getAttribute('aria-describedby')).toBe('about');
    expect(screen.getByText('s')).toBeTruthy();
    fireEvent.change(box(), { target: { value: '5' } });
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.blur(box());
    expect(onChange.mock.calls).toEqual([['5']]);
  });

  it('keeps a number past the choices inside them', () => {
    const onChange = draw('number', { value: '2', options: TONE });
    fireEvent.change(box(), { target: { value: '40' } });
    fireEvent.blur(box());
    expect(onChange.mock.calls).toEqual([['10']]);
  });

  // "-1" sits next to "0", so with it the choices are still consecutive: a box over them would start at -1, which the host refuses.
  it.each(['abc', '15', '2.5', '-1', '11'])('falls back to a select that shows a stored "%s", which no number box over the choices could', (stored) => {
    const onChange = draw('number', { value: stored, options: TONE, staleLabel: (value) => `${value} (invalid)` });
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(select().value).toBe(stored);
    expect(select().options[0].textContent).toBe(`${stored} (invalid)`);
    fireEvent.change(select(), { target: { value: '3' } });
    expect(onChange.mock.calls).toEqual([['3']]);
  });

  it('is off when disabled', () => {
    draw('number', { value: '2', options: TONE, disabled: true });
    expect(box().disabled).toBe(true);
  });

  // "Not set" is not one of the choices and the host refuses '' for a choice (qa-breaker B1 on #3681).
  it('a number choice that is emptied reports nothing and shows the stored value again', () => {
    const onChange = draw('number', { value: '7', options: TONE });
    fireEvent.change(box(), { target: { value: '' } });
    fireEvent.keyDown(box(), { key: 'Enter' });
    expect(onChange).not.toHaveBeenCalled();
    expect(box().value).toBe('7');
    fireEvent.change(box(), { target: { value: '' } });
    fireEvent.blur(box());
    expect(onChange).not.toHaveBeenCalled();
    expect(box().value).toBe('7');
  });
});

describe('SettingChoice while a save is out', () => {
  /** A choice whose saves stay out until the test ends them; the stored value stays "60" throughout. */
  function slow(control: ChoiceControl) {
    const ends: ((kept: boolean) => void)[] = [];
    const onChange = vi.fn((_: string) => new Promise<boolean>((resolve) => ends.push(resolve)));
    render(<SettingChoice control={control} label="Chunk length" value="60" options={CHUNKS} onChange={onChange} />);
    return { onChange, ends };
  }
  const option = (control: ChoiceControl, name: string) => screen.getByRole(control === 'radio' ? 'radio' : 'button', { name });
  const isChosen = (control: ChoiceControl, name: string) =>
    option(control, name).getAttribute(control === 'radio' ? 'aria-checked' : 'aria-pressed') === 'true';

  // qa-breaker B4 on #3681: the press on the stored value was compared with the stored value and dropped, so the last value sent stayed.
  it.each(['radio', 'segmented'] as const)('%s: the stored value chosen again while a save is out is sent after it', async (control) => {
    const { onChange, ends } = slow(control);
    fireEvent.click(option(control, '30 s'));
    fireEvent.click(option(control, '300 s'));
    fireEvent.click(option(control, '60 s'));
    expect(onChange.mock.calls).toEqual([['30'], ['300'], ['60']]);
    // An earlier save ending does not move the choice off the last one made.
    await act(async () => ends[0](true));
    expect(isChosen(control, '60 s')).toBe(true);
  });

  // qa-breaker B5 on #3681: a held Enter or a double click sent one save per press.
  it.each(['radio', 'segmented'] as const)('%s: a second press of the option being saved sends nothing', (control) => {
    const { onChange } = slow(control);
    fireEvent.click(option(control, '300 s'));
    fireEvent.click(option(control, '300 s'));
    fireEvent.click(option(control, '300 s'));
    expect(onChange).toHaveBeenCalledExactlyOnceWith('300');
  });

  it.each(['radio', 'segmented'] as const)('%s: the option being saved is shown as chosen until the save ends', async (control) => {
    const { ends } = slow(control);
    fireEvent.click(option(control, '300 s'));
    expect(isChosen(control, '300 s')).toBe(true);
    expect(isChosen(control, '60 s')).toBe(false);
    // Refused: the choice in force is the chosen one again.
    await act(async () => ends[0](false));
    expect(isChosen(control, '60 s')).toBe(true);
  });

  it('select: the stored value picked again while a save is out is sent after it', () => {
    const { onChange } = slow('select');
    fireEvent.change(select(), { target: { value: '300' } });
    expect(select().value).toBe('300');
    fireEvent.change(select(), { target: { value: '60' } });
    expect(onChange.mock.calls).toEqual([['300'], ['60']]);
  });
});

// The host offers Whisper alone as the live engine off Windows (qa-breaker B12 on #3681; component-selection CS-B7).
describe('SettingChoice with one option', () => {
  const ONLY = [{ value: 'whisper', label: 'Whisper' }];

  it.each(['radio', 'segmented'] as const)('%s: a choice the host offers one option for is not drawn as a group', (control) => {
    draw(control, { value: 'whisper', options: ONLY, id: 'set-row' });
    expect(screen.queryByRole('radiogroup')).toBeNull();
    expect(screen.queryByRole('group')).toBeNull();
    expect(screen.queryByRole('radio')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByText('Whisper').id).toBe('set-row');
  });

  it('a stored value the one option is not is still a group, with the stored value first and chosen', () => {
    draw('radio', { value: 'moonshine', options: ONLY, staleLabel: () => 'Moonshine (Windows)' });
    const all = within(radios()).getAllByRole('radio');
    expect(all).toHaveLength(2);
    expect(all[0].getAttribute('aria-checked')).toBe('true');
  });

  it('a select of one option stays a select', () => {
    draw('select', { value: 'whisper', options: ONLY });
    expect(select().value).toBe('whisper');
  });
});

describe('isGroupControl', () => {
  it('is true for the controls a label cannot point at', () => {
    expect((['segmented', 'radio', 'select', 'number', undefined] as const).map(isGroupControl)).toEqual([true, true, false, false, false]);
  });
});
