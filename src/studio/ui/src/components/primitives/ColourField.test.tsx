// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ColourField, freeNames, type ColourChoice } from './ColourField';
import { TooltipProvider } from './Tooltip';

afterEach(cleanup);

type Hue = 'green' | 'blue' | 'violet';
const CHOICES: readonly ColourChoice<Hue>[] = [
  { value: 'green', token: 'character', name: 'Green' },
  { value: 'blue', token: 'place', name: 'Blue' },
  { value: 'violet', token: 'org', name: 'Violet' },
];

type PaletteExtras = { automatic?: { resolvesTo: Hue }; form?: 'row' | 'popover'; pending?: boolean; disabled?: boolean };

function Palette({ start, onChange = () => undefined, ...extras }: { start: Hue | null; onChange?: (value: Hue | null) => void } & PaletteExtras) {
  const [value, setValue] = useState<Hue | null>(start);
  return (
    <TooltipProvider>
      <ColourField
        mode="palette"
        label="Colour for Character"
        choices={CHOICES}
        value={value}
        onChange={(next) => {
          onChange(next);
          setValue(next);
        }}
        {...extras}
      />
    </TooltipProvider>
  );
}

const radio = (name: string) => screen.getByRole('radio', { name });
const checked = (name: string) => radio(name).getAttribute('aria-checked');

describe('ColourField palette, as a row', () => {
  it('is a radio group named by its label, with one radio per choice named by its colour', () => {
    render(<Palette start="blue" />);
    expect(screen.getByRole('radiogroup', { name: 'Colour for Character' })).toBeTruthy();
    expect(screen.getAllByRole('radio').map((el) => el.getAttribute('aria-label'))).toEqual(['Green', 'Blue', 'Violet']);
    expect(checked('Blue')).toBe('true');
    expect(checked('Green')).toBe('false');
  });

  it('marks the chosen swatch with a check, not with colour alone', () => {
    render(<Palette start="blue" />);
    expect(radio('Blue').querySelector('svg')).toBeTruthy();
    expect(radio('Green').querySelector('svg')).toBeNull();
  });

  it('is one tab stop, on the chosen swatch', async () => {
    render(
      <>
        <button type="button">Before</button>
        <Palette start="blue" />
        <button type="button">After</button>
      </>,
    );
    await userEvent.tab();
    await userEvent.tab();
    expect(document.activeElement).toBe(radio('Blue'));
    await userEvent.tab();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'After' }));
  });

  it('moves and reports with the arrow keys, wrapping at the ends, in the caller’s own value type', async () => {
    const onChange = vi.fn<(value: Hue | null) => void>();
    render(<Palette start="blue" onChange={onChange} />);
    radio('Blue').focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(onChange).toHaveBeenLastCalledWith('violet');
    expect(document.activeElement).toBe(radio('Violet'));
    await userEvent.keyboard('{ArrowLeft}');
    expect(onChange).toHaveBeenLastCalledWith('blue');
    await userEvent.keyboard('{ArrowUp}');
    expect(onChange).toHaveBeenLastCalledWith('green');
    await userEvent.keyboard('{ArrowLeft}');
    expect(onChange).toHaveBeenLastCalledWith('violet');
    await userEvent.keyboard('{ArrowDown}');
    expect(onChange).toHaveBeenLastCalledWith('green');
    expect(checked('Green')).toBe('true');
  });

  it('reports a click and a Space press', async () => {
    const onChange = vi.fn<(value: Hue | null) => void>();
    render(<Palette start={null} onChange={onChange} />);
    await userEvent.click(radio('Violet'));
    expect(onChange).toHaveBeenLastCalledWith('violet');
    cleanup();
    onChange.mockClear();
    render(<Palette start={null} onChange={onChange} />);
    radio('Green').focus();
    await userEvent.keyboard(' ');
    expect(onChange).toHaveBeenCalledExactlyOnceWith('green');
  });

  it('throws on a token the stylesheet does not declare', () => {
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    // The cast stands in for a caller that built its token name from data.
    const unknown = [{ value: 'x', token: 'chartreuse' as 'accent', name: 'Chartreuse' }];
    expect(() => render(<ColourField mode="palette" label="Colour" choices={unknown} value="x" onChange={() => undefined} />)).toThrow(/chartreuse/);
    quiet.mockRestore();
  });
});

describe('ColourField palette with Automatic', () => {
  it('draws Automatic first, named with the colour it resolves to, and checks it for a null value', () => {
    render(<Palette start={null} automatic={{ resolvesTo: 'violet' }} />);
    expect(screen.getAllByRole('radio')[0]).toBe(radio('Automatic (Violet)'));
    expect(checked('Automatic (Violet)')).toBe('true');
    expect(radio('Automatic (Violet)').textContent).toBe('Auto');
    expect(checked('Violet')).toBe('false');
  });

  it('reports null when Automatic is picked, and the value when a colour is', async () => {
    const onChange = vi.fn<(value: Hue | null) => void>();
    render(<Palette start="green" automatic={{ resolvesTo: 'violet' }} onChange={onChange} />);
    await userEvent.click(radio('Automatic (Violet)'));
    expect(onChange).toHaveBeenLastCalledWith(null);
    await userEvent.click(radio('Blue'));
    expect(onChange).toHaveBeenLastCalledWith('blue');
  });

  it('refuses an Automatic that resolves to no choice', () => {
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() =>
      render(<ColourField mode="palette" label="Colour" choices={CHOICES} value={null} automatic={{ resolvesTo: 'teal' as Hue }} onChange={() => undefined} />),
    ).toThrow(/teal/);
    quiet.mockRestore();
  });
});

describe('ColourField palette while a save runs, and when off', () => {
  it('pending: says it is busy, keeps focus on the swatch and ignores keys and clicks', async () => {
    const onChange = vi.fn();
    render(<Palette start="blue" pending onChange={onChange} />);
    expect(screen.getByRole('radiogroup').getAttribute('aria-busy')).toBe('true');
    expect(radio('Blue').tabIndex).toBe(0);
    radio('Blue').focus();
    expect(document.activeElement).toBe(radio('Blue'));
    await userEvent.keyboard('{ArrowRight}{ArrowDown}{ArrowLeft}{ArrowUp}{ArrowRight}');
    // An arrow key does not move focus off the swatch being saved: focus and the check stay on the same swatch.
    expect(document.activeElement).toBe(radio('Blue'));
    await userEvent.keyboard(' ');
    await userEvent.click(radio('Green'));
    expect(onChange).not.toHaveBeenCalled();
    expect(checked('Blue')).toBe('true');
    expect(screen.getByRole('radiogroup').contains(document.activeElement)).toBe(true);
  });

  it('keeps focus on the swatch when a pick turns pending on', async () => {
    function SavesOnPick() {
      const [value, setValue] = useState<Hue>('green');
      const [busy, setBusy] = useState(false);
      return (
        <ColourField
          mode="palette"
          label="Colour"
          choices={CHOICES}
          value={value}
          pending={busy}
          onChange={(next) => {
            if (next) setValue(next);
            setBusy(true);
          }}
        />
      );
    }
    render(<SavesOnPick />);
    radio('Green').focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(screen.getByRole('radiogroup').getAttribute('aria-busy')).toBe('true');
    expect(document.activeElement).toBe(radio('Blue'));
  });

  it('disabled: no swatch can be operated', async () => {
    const onChange = vi.fn();
    render(<Palette start="blue" disabled onChange={onChange} />);
    for (const el of screen.getAllByRole('radio')) expect(el.getAttribute('aria-disabled')).toBe('true');
    await userEvent.click(radio('Green'));
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('ColourField palette, as a popover', () => {
  const trigger = (name: string) => screen.getByRole('button', { name });

  it('names its box with the label and the chosen colour, and shows that colour’s name', () => {
    render(<Palette start="blue" form="popover" />);
    expect(trigger('Colour for Character: Blue').textContent).toBe('Blue');
    expect(screen.queryByRole('radiogroup')).toBeNull();
  });

  it('opens the same row with focus on the chosen swatch', async () => {
    render(<Palette start="blue" form="popover" />);
    await userEvent.click(trigger('Colour for Character: Blue'));
    expect(await screen.findByRole('radiogroup', { name: 'Colour for Character' })).toBeTruthy();
    await waitFor(() => expect(document.activeElement).toBe(radio('Blue')));
  });

  it('a click picks, closes and returns focus to the box', async () => {
    const onChange = vi.fn();
    render(<Palette start="blue" form="popover" onChange={onChange} />);
    await userEvent.click(trigger('Colour for Character: Blue'));
    await userEvent.click(await screen.findByRole('radio', { name: 'Violet' }));
    expect(onChange).toHaveBeenCalledExactlyOnceWith('violet');
    await waitFor(() => expect(screen.queryByRole('radiogroup')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(trigger('Colour for Character: Violet')));
  });

  it('arrow keys check without closing; Enter then closes without a second report', async () => {
    const onChange = vi.fn();
    render(<Palette start="blue" form="popover" onChange={onChange} />);
    await userEvent.click(trigger('Colour for Character: Blue'));
    await waitFor(() => expect(document.activeElement).toBe(radio('Blue')));
    await userEvent.keyboard('{ArrowRight}');
    expect(onChange).toHaveBeenCalledExactlyOnceWith('violet');
    expect(screen.getByRole('radiogroup')).toBeTruthy();
    await userEvent.keyboard('{Enter}');
    await waitFor(() => expect(screen.queryByRole('radiogroup')).toBeNull());
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('Enter picks a swatch that nothing has checked yet', async () => {
    const onChange = vi.fn();
    render(<Palette start={null} form="popover" onChange={onChange} />);
    await userEvent.click(trigger('Colour for Character: None'));
    await waitFor(() => expect(document.activeElement).toBe(radio('Green')));
    await userEvent.keyboard('{Enter}');
    expect(onChange).toHaveBeenCalledExactlyOnceWith('green');
    await waitFor(() => expect(screen.queryByRole('radiogroup')).toBeNull());
  });

  it('Space picks and closes', async () => {
    const onChange = vi.fn();
    render(<Palette start={null} form="popover" onChange={onChange} />);
    await userEvent.click(trigger('Colour for Character: None'));
    await waitFor(() => expect(document.activeElement).toBe(radio('Green')));
    await userEvent.keyboard(' ');
    expect(onChange).toHaveBeenCalledExactlyOnceWith('green');
    await waitFor(() => expect(screen.queryByRole('radiogroup')).toBeNull());
  });

  // Keyboard focus shows the swatch's name as a hint, and the first Escape is the hint's (WCAG 1.4.13), as on every hinted control in a dialog.
  it('Escape dismisses the swatch’s hint, then closes, and keeps what the arrow keys checked', async () => {
    const onChange = vi.fn();
    render(<Palette start="green" form="popover" onChange={onChange} />);
    await userEvent.click(trigger('Colour for Character: Green'));
    await waitFor(() => expect(document.activeElement).toBe(radio('Green')));
    await userEvent.keyboard('{ArrowRight}');
    expect(await screen.findByRole('tooltip')).toBeTruthy();
    await userEvent.keyboard('{Escape}');
    expect(screen.getByRole('radiogroup')).toBeTruthy();
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('radiogroup')).toBeNull());
    expect(trigger('Colour for Character: Blue')).toBeTruthy();
    expect(onChange).toHaveBeenCalledExactlyOnceWith('blue');
  });

  it('names Automatic in the box when it is chosen', () => {
    render(<Palette start={null} form="popover" automatic={{ resolvesTo: 'green' }} />);
    expect(trigger('Colour for Character: Automatic (Green)')).toBeTruthy();
  });

  it('pending: the box says it is busy, and a press on a swatch neither picks nor closes', async () => {
    const onChange = vi.fn();
    render(<Palette start="blue" form="popover" pending onChange={onChange} />);
    const box = trigger('Colour for Character: Blue');
    expect(box.getAttribute('aria-busy')).toBe('true');
    await userEvent.click(box);
    await userEvent.click(await screen.findByRole('radio', { name: 'Green' }));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole('radiogroup')).toBeTruthy();
  });

  it('disabled: the box cannot be opened', async () => {
    render(<Palette start="blue" form="popover" disabled />);
    await userEvent.click(trigger('Colour for Character: Blue'));
    expect(screen.queryByRole('radiogroup')).toBeNull();
  });
});

describe('freeNames', () => {
  it.each([
    ['Tint', 'Tint colour', 'Tint hex'],
    ['Note color', 'Note colour', 'Note hex'],
    ['Marker Colour', 'Marker colour', 'Marker hex'],
    ['Colour', 'Colour', 'Hex'],
    ['Décor', 'Décor colour', 'Décor hex'],
    ['Note colour (this project)', 'Note colour (this project)', 'Note hex (this project)'],
    ['Tint (all projects)', 'Tint colour (all projects)', 'Tint hex (all projects)'],
    ['Colour (all projects)', 'Colour (all projects)', 'Hex (all projects)'],
  ])('%s names the picker %j and the box %j', (label, picker, hex) => {
    expect(freeNames(label)).toEqual({ picker, hex });
  });
});

type FreeExtras = { allowUnset?: boolean; placeholder?: string; invalid?: boolean; disabled?: boolean; describedBy?: string; id?: string };

function Free({
  start,
  onChange = () => undefined,
  label = 'Note color',
  ...extras
}: { start: string; onChange?: (hex: string) => void; label?: string } & FreeExtras) {
  const [value, setValue] = useState(start);
  return (
    <ColourField
      mode="free"
      label={label}
      value={value}
      onChange={(next) => {
        onChange(next);
        setValue(next);
      }}
      {...extras}
    />
  );
}

describe('ColourField free', () => {
  const hexBox = () => screen.getByRole<HTMLInputElement>('textbox', { name: 'Note hex' });
  const picker = () => screen.getByLabelText<HTMLInputElement>('Note colour');

  it('draws the browser’s picker and a hex box, each named for what it is', () => {
    render(<Free start="B5473C" />);
    expect(picker().type).toBe('color');
    expect(picker().value).toBe('#b5473c');
    expect(hexBox().value).toBe('B5473C');
  });

  it('does not report while the narrator types', async () => {
    const onChange = vi.fn();
    render(<Free start="B5473C" onChange={onChange} />);
    await userEvent.clear(hexBox());
    await userEvent.type(hexBox(), '00ff7f');
    expect(onChange).not.toHaveBeenCalled();
    expect(hexBox().value).toBe('00ff7f');
  });

  it('reports capitals without the # on Enter', async () => {
    const onChange = vi.fn();
    render(<Free start="B5473C" onChange={onChange} />);
    await userEvent.clear(hexBox());
    await userEvent.type(hexBox(), ' #00ff7f{Enter}');
    expect(onChange).toHaveBeenCalledExactlyOnceWith('00FF7F');
    expect(hexBox().value).toBe('00FF7F');
    expect(picker().value).toBe('#00ff7f');
  });

  it('reports when focus leaves the box', async () => {
    const onChange = vi.fn();
    render(<Free start="B5473C" onChange={onChange} />);
    await userEvent.clear(hexBox());
    await userEvent.type(hexBox(), 'abcdef');
    await userEvent.tab();
    expect(onChange).toHaveBeenCalledExactlyOnceWith('ABCDEF');
  });

  it('tidies a draft that spells the stored colour another way, without a report', async () => {
    const onChange = vi.fn();
    render(<Free start="B5473C" onChange={onChange} />);
    await userEvent.clear(hexBox());
    await userEvent.type(hexBox(), '#b5473c{Enter}');
    expect(onChange).not.toHaveBeenCalled();
    expect(hexBox().value).toBe('B5473C');
  });

  it.each(['zzz', 'B547', 'B5473C00', 'rgb(1,2,3)', 'Б5473C'])('keeps %j in the box, marks it invalid with a spoken hint and reports nothing', async (text) => {
    const onChange = vi.fn();
    render(<Free start="B5473C" onChange={onChange} />);
    await userEvent.clear(hexBox());
    await userEvent.type(hexBox(), `${text}{Enter}`);
    expect(onChange).not.toHaveBeenCalled();
    expect(hexBox().value).toBe(text);
    expect(hexBox().getAttribute('aria-invalid')).toBe('true');
    const hint = document.getElementById(hexBox().getAttribute('aria-describedby')!);
    expect(hint?.textContent).toBe('Six hex digits, like B5473C');
    // The hint is for a screen reader only: nothing is added to the page flow (errors are a toast, a dialog or a fixed box).
    expect(hint?.className).toContain('sr-only');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('stops marking the box once the narrator types again', async () => {
    render(<Free start="B5473C" />);
    await userEvent.clear(hexBox());
    await userEvent.type(hexBox(), 'zzz{Enter}');
    await userEvent.type(hexBox(), '0');
    expect(hexBox().getAttribute('aria-invalid')).toBeNull();
    expect(hexBox().getAttribute('aria-describedby')).toBeNull();
  });

  it('Escape puts the stored colour back and clears the mark', async () => {
    const onChange = vi.fn();
    render(<Free start="B5473C" onChange={onChange} />);
    await userEvent.clear(hexBox());
    await userEvent.type(hexBox(), 'zzz{Enter}{Escape}');
    expect(hexBox().value).toBe('B5473C');
    expect(hexBox().getAttribute('aria-invalid')).toBeNull();
    await userEvent.tab();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('an emptied box is refused unless the colour may be unset', async () => {
    const onChange = vi.fn();
    render(<Free start="B5473C" onChange={onChange} />);
    await userEvent.clear(hexBox());
    await userEvent.tab();
    expect(onChange).not.toHaveBeenCalled();
    expect(hexBox().getAttribute('aria-invalid')).toBe('true');
  });

  it('allowUnset: an emptied box reports no colour, and the picker shows mid grey', async () => {
    const onChange = vi.fn();
    render(<Free start="B5473C" allowUnset placeholder="Not set" onChange={onChange} />);
    await userEvent.clear(hexBox());
    await userEvent.tab();
    expect(onChange).toHaveBeenCalledExactlyOnceWith('');
    expect(hexBox().getAttribute('aria-invalid')).toBeNull();
    expect(hexBox().placeholder).toBe('Not set');
    expect(picker().value).toBe('#808080');
  });

  it('the picker reports once, when it closes, not on each step of a drag', () => {
    const onChange = vi.fn();
    render(<Free start="B5473C" onChange={onChange} />);
    fireEvent.input(picker(), { target: { value: '#112233' } });
    fireEvent.input(picker(), { target: { value: '#445566' } });
    expect(onChange).not.toHaveBeenCalled();
    expect(picker().value).toBe('#445566');
    act(() => void picker().dispatchEvent(new Event('change', { bubbles: true })));
    expect(onChange).toHaveBeenCalledExactlyOnceWith('445566');
    expect(hexBox().value).toBe('445566');
  });

  it('a picker closed on the stored colour reports nothing', () => {
    const onChange = vi.fn();
    render(<Free start="B5473C" onChange={onChange} />);
    picker().dispatchEvent(new Event('change', { bubbles: true }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('takes the caller’s id, description and verdict on the hex box', () => {
    render(
      <>
        <label htmlFor="note-colour">Note color</label>
        <span id="why">Used for notes</span>
        <Free start="B5473C" id="note-colour" describedBy="why" invalid />
      </>,
    );
    expect(hexBox().id).toBe('note-colour');
    expect(hexBox().getAttribute('aria-describedby')).toBe('why');
    expect(hexBox().getAttribute('aria-invalid')).toBe('true');
  });

  it('disabled: neither control can be used', () => {
    render(<Free start="B5473C" disabled />);
    expect(picker().disabled).toBe(true);
    expect(hexBox().disabled).toBe(true);
  });
});
