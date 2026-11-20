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

  // B6 (#3680): a save that is slow or refused must not leave focus on a swatch that is not the chosen one.
  function Saving({ refuse = false }: { refuse?: boolean }) {
    const [value, setValue] = useState<Hue>('violet');
    const [busy, setBusy] = useState(false);
    return (
      <>
        <ColourField
          mode="palette"
          label="Colour"
          choices={CHOICES}
          value={value}
          pending={busy}
          onChange={(next) => {
            if (next && !refuse) setValue(next);
            setBusy(true);
          }}
        />
        <button type="button" onClick={() => setBusy(false)}>
          Answer
        </button>
      </>
    );
  }

  it('a press while pending leaves focus on the swatch being saved', async () => {
    render(<Saving />);
    await userEvent.click(radio('Green'));
    expect(screen.getByRole('radiogroup').getAttribute('aria-busy')).toBe('true');
    expect(document.activeElement).toBe(radio('Green'));
    await userEvent.click(radio('Blue'));
    expect(document.activeElement).toBe(radio('Green'));
    expect(checked('Green')).toBe('true');
    expect(checked('Blue')).toBe('false');
  });

  it('after the answer the tab stop is the checked swatch', async () => {
    render(<Saving refuse />);
    await userEvent.click(radio('Green'));
    expect(document.activeElement).toBe(radio('Green'));
    // The host refuses: the value stays Violet. Answering by key keeps focus where the narrator left it.
    act(() => screen.getByRole('button', { name: 'Answer' }).click());
    expect(checked('Violet')).toBe('true');
    expect(document.activeElement).toBe(radio('Violet'));
    expect(radio('Violet').tabIndex).toBe(0);
    expect(radio('Green').tabIndex).toBe(-1);
  });

  it('an answer that arrives while focus is elsewhere moves no focus', async () => {
    render(<Saving refuse />);
    await userEvent.click(radio('Green'));
    const answer = screen.getByRole('button', { name: 'Answer' });
    answer.focus();
    act(() => answer.click());
    expect(document.activeElement).toBe(answer);
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

  it('says the chosen colour in a hint on the box, not in a native title', async () => {
    render(<Palette start="blue" form="popover" />);
    const box = trigger('Colour for Character: Blue');
    expect(box.getAttribute('title')).toBeNull();
    await userEvent.tab();
    expect(document.activeElement).toBe(box);
    expect((await screen.findByRole('tooltip')).textContent).toBe('Blue');
  });

  // B1, R1 (#3680): swatches that closed under the pointer left the second press of a double click, or any press after it, to land on the row
  // they covered. A pointer press picks and they stay.
  describe('a pointer press on a swatch', () => {
    const press = { detail: 1, bubbles: true, cancelable: true };

    async function openOver(under: () => void, onChange: (value: Hue | null) => void = () => undefined) {
      render(
        <>
          <Palette start="blue" form="popover" onChange={onChange} />
          <button type="button" onClick={under}>
            Remove the next row
          </button>
        </>,
      );
      await userEvent.click(trigger('Colour for Character: Blue'));
      return screen.findByRole('radio', { name: 'Violet' });
    }

    it('picks, shows the choice in the box and leaves the swatches open', async () => {
      const onChange = vi.fn();
      const violet = await openOver(() => undefined, onChange);
      fireEvent.click(violet, press);
      expect(onChange).toHaveBeenCalledExactlyOnceWith('violet');
      expect(screen.getByRole('radiogroup')).toBeTruthy();
      expect(checked('Violet')).toBe('true');
      // The page behind an open popover is hidden from the accessibility tree, the box with it.
      expect(screen.getByRole('button', { name: 'Colour for Character: Violet', hidden: true }).textContent).toBe('Violet');
    });

    it.each([2, 3, 5])('a %i-fold click picks once and nothing under the swatches is pressed', async (presses) => {
      const onChange = vi.fn();
      const under = vi.fn();
      const violet = await openOver(under, onChange);
      for (let nth = 1; nth <= presses; nth += 1) fireEvent.click(violet, { ...press, detail: nth });
      expect(onChange).toHaveBeenCalledExactlyOnceWith('violet');
      expect(under).not.toHaveBeenCalled();
      expect(screen.getByRole('radiogroup')).toBeTruthy();
    });

    it('a second press long after the first lands on the swatch again', async () => {
      const onChange = vi.fn();
      const under = vi.fn();
      const violet = await openOver(under, onChange);
      fireEvent.click(violet, press);
      await new Promise((resolve) => setTimeout(resolve, 600));
      fireEvent.click(screen.getByRole('radio', { name: 'Violet' }), press);
      expect(onChange).toHaveBeenCalledTimes(1);
      expect(under).not.toHaveBeenCalled();
      expect(screen.getByRole('radiogroup')).toBeTruthy();
    });

    it('another swatch can be picked without opening the box again', async () => {
      const onChange = vi.fn();
      const violet = await openOver(() => undefined, onChange);
      fireEvent.click(violet, press);
      fireEvent.click(screen.getByRole('radio', { name: 'Green' }), press);
      expect(onChange.mock.calls).toEqual([['violet'], ['green']]);
      expect(screen.getByRole('radiogroup')).toBeTruthy();
    });

    it('Escape after a pick closes the swatches and returns focus to the box', async () => {
      const violet = await openOver(() => undefined);
      await userEvent.click(violet);
      await userEvent.keyboard('{Escape}');
      await waitFor(() => expect(screen.queryByRole('radiogroup')).toBeNull());
      await waitFor(() => expect(document.activeElement).toBe(trigger('Colour for Character: Violet')));
    });

    it('a press outside closes the swatches', async () => {
      const violet = await openOver(() => undefined);
      await userEvent.click(violet);
      await userEvent.click(document.body);
      await waitFor(() => expect(screen.queryByRole('radiogroup')).toBeNull());
      expect(trigger('Colour for Character: Violet')).toBeTruthy();
    });
  });

  it('Tab closes the swatches and returns focus to the box', async () => {
    render(<Palette start="blue" form="popover" />);
    await userEvent.click(trigger('Colour for Character: Blue'));
    await waitFor(() => expect(document.activeElement).toBe(radio('Blue')));
    await userEvent.tab();
    await waitFor(() => expect(screen.queryByRole('radiogroup')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(trigger('Colour for Character: Blue')));
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

  // B4 (#3680): keyboard focus shows the swatch's name as a hint, and the first Escape used to dismiss only the hint.
  it('one Escape closes the swatches while a swatch’s hint is showing, returns focus to the box and keeps what the arrow keys checked', async () => {
    const onChange = vi.fn();
    const onDialogKey = vi.fn();
    render(
      // The listener stands for the dialog the box may sit in: the Escape that closes the swatches must not reach it.
      <div onKeyDown={onDialogKey}>
        <Palette start="green" form="popover" onChange={onChange} />
      </div>,
    );
    await userEvent.click(trigger('Colour for Character: Green'));
    await waitFor(() => expect(document.activeElement).toBe(radio('Green')));
    await userEvent.keyboard('{ArrowRight}');
    expect((await screen.findByRole('tooltip')).textContent).toBe('Blue');
    onDialogKey.mockClear();
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('radiogroup')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(trigger('Colour for Character: Blue')));
    expect(onDialogKey).not.toHaveBeenCalled();
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
  // B12 (#3680, WCAG 2.5.3): the words drawn beside the control are in both names, spelled as drawn.
  it.each([
    ['Tint', 'Tint', 'Tint hex'],
    ['Note color', 'Note color', 'Note color hex'],
    ['Misread marker color', 'Misread marker color', 'Misread marker color hex'],
    ['Décor', 'Décor', 'Décor hex'],
    ['Note colour (this project)', 'Note colour (this project)', 'Note colour (this project) hex'],
  ])('%s names the picker %j and the box %j', (label, picker, hex) => {
    expect(freeNames(label)).toEqual({ picker, hex });
  });
});

type FreeExtras = {
  allowUnset?: boolean;
  onRefused?: (text: string) => void;
  placeholder?: string;
  invalid?: boolean;
  disabled?: boolean;
  describedBy?: string;
  id?: string;
};

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
  const hexBox = () => screen.getByRole<HTMLInputElement>('textbox', { name: 'Note color hex' });
  const picker = () => screen.getByLabelText<HTMLInputElement>('Note color', { selector: 'input[type="color"]' });

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
    // Spoken from here; shown as a hint on the box. Nothing is added to the page flow (errors are a toast, a dialog or a fixed box).
    expect(hint?.className).toContain('sr-only');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  // B5 (#3680): a red edge alone does not say what is wrong.
  it('a refused hex shows the hint', async () => {
    render(<Free start="B5473C" />);
    await userEvent.clear(hexBox());
    await userEvent.type(hexBox(), 'B547');
    await userEvent.tab();
    await userEvent.tab({ shift: true });
    expect(document.activeElement).toBe(hexBox());
    expect((await screen.findByRole('tooltip')).textContent).toBe('Six hex digits, like B5473C');
  });

  it('the hint is absent until a hex is refused', async () => {
    render(<Free start="B5473C" />);
    expect(screen.queryByText('Six hex digits, like B5473C')).toBeNull();
    await userEvent.tab();
    await userEvent.tab();
    expect(document.activeElement).toBe(hexBox());
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.queryByRole('tooltip')).toBeNull();
    expect(screen.queryByText('Six hex digits, like B5473C')).toBeNull();
    expect(hexBox().getAttribute('aria-describedby')).toBeNull();
  });

  it('marks a stored value that is not a colour, and says what one is', () => {
    render(<Free start="4D5E6" />);
    expect(hexBox().value).toBe('4D5E6');
    expect(hexBox().getAttribute('aria-invalid')).toBe('true');
    expect(document.getElementById(hexBox().getAttribute('aria-describedby')!)?.textContent).toBe('Six hex digits, like B5473C');
    expect(picker().value).toBe('#808080');
  });

  // B2, B3 (#3680): a save that is slow to answer, or refused, is sent once.
  function SlowHost({ onChange }: { onChange: (hex: string) => void }) {
    // The host has not answered: the value stays what it was.
    return <ColourField mode="free" label="Note color" value="B5473C" onChange={onChange} />;
  }

  it('held Enter reports once', async () => {
    const onChange = vi.fn();
    render(<SlowHost onChange={onChange} />);
    await userEvent.clear(hexBox());
    await userEvent.type(hexBox(), 'BB0001');
    for (let repeat = 0; repeat < 21; repeat += 1) fireEvent.keyDown(hexBox(), { key: 'Enter', repeat: repeat > 0 });
    await userEvent.tab();
    expect(onChange).toHaveBeenCalledExactlyOnceWith('BB0001');
  });

  it('a refused value is not sent again on blur, and the box shows the stored colour', async () => {
    const onChange = vi.fn();
    render(<SlowHost onChange={onChange} />);
    await userEvent.clear(hexBox());
    await userEvent.type(hexBox(), 'BB0001{Enter}');
    expect(hexBox().value).toBe('B5473C');
    await userEvent.tab();
    await userEvent.tab({ shift: true });
    await userEvent.tab();
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(hexBox().getAttribute('aria-invalid')).toBeNull();
  });

  // R2, R3 (#3680): a caller that saves at once hands back the save, and the box shows the colour sent until it is answered.
  describe('while a save is out', () => {
    /** A caller whose host answers when told to: `kept` true stores the colour, false refuses it. */
    function AnsweredLater({ sent, start = 'B5473C' }: { sent: { hex: string; answer: (kept: boolean) => void }[]; start?: string }) {
      const [value, setValue] = useState(start);
      return (
        <TooltipProvider>
          <ColourField
            mode="free"
            label="Note color"
            value={value}
            onChange={(hex) =>
              new Promise<boolean>((resolve) => {
                sent.push({
                  hex,
                  answer: (kept) => {
                    if (kept) setValue(hex);
                    resolve(kept);
                  },
                });
              })
            }
          />
        </TooltipProvider>
      );
    }
    const answer = (save: { answer: (kept: boolean) => void }, kept: boolean) => act(async () => save.answer(kept));

    it('while a save is out the box shows the code entered, and says it is saving', async () => {
      const sent: { hex: string; answer: (kept: boolean) => void }[] = [];
      render(<AnsweredLater sent={sent} />);
      await userEvent.clear(hexBox());
      await userEvent.type(hexBox(), 'aa0001{Enter}');
      expect(hexBox().value).toBe('AA0001');
      expect(picker().value).toBe('#aa0001');
      expect(hexBox().getAttribute('aria-busy')).toBe('true');
      expect(hexBox().getAttribute('aria-invalid')).toBeNull();
      await answer(sent[0]!, true);
      expect(hexBox().value).toBe('AA0001');
      expect(hexBox().getAttribute('aria-busy')).toBeNull();
    });

    it('a refused save puts the stored colour back in the box and the picker', async () => {
      const sent: { hex: string; answer: (kept: boolean) => void }[] = [];
      render(<AnsweredLater sent={sent} />);
      await userEvent.clear(hexBox());
      await userEvent.type(hexBox(), 'AA0001{Enter}');
      await answer(sent[0]!, false);
      expect(hexBox().value).toBe('B5473C');
      expect(picker().value).toBe('#b5473c');
      expect(hexBox().getAttribute('aria-busy')).toBeNull();
      // The refused colour can be tried again.
      await userEvent.clear(hexBox());
      await userEvent.type(hexBox(), 'AA0001{Enter}');
      expect(sent.map((save) => save.hex)).toEqual(['AA0001', 'AA0001']);
    });

    it('a save that rejects is a refused save', async () => {
      let fail: (why: Error) => void = () => undefined;
      const save = new Promise<never>((_, reject) => {
        fail = reject;
      });
      render(<ColourField mode="free" label="Note color" value="B5473C" onChange={() => save} />);
      await userEvent.clear(hexBox());
      await userEvent.type(hexBox(), 'AA0001{Enter}');
      expect(hexBox().value).toBe('AA0001');
      await act(async () => fail(new Error('The settings file is read-only.')));
      expect(hexBox().value).toBe('B5473C');
    });

    it('the same code entered again while pending is sent once', async () => {
      const sent: { hex: string; answer: (kept: boolean) => void }[] = [];
      render(<AnsweredLater sent={sent} />);
      for (const spelling of ['AA0004', 'aa0004', ' #AA0004 ']) {
        await userEvent.clear(hexBox());
        await userEvent.type(hexBox(), `${spelling}{Enter}`);
      }
      await userEvent.tab();
      act(() => {
        fireEvent.input(picker(), { target: { value: '#aa0004' } });
        picker().dispatchEvent(new Event('change', { bubbles: true }));
      });
      expect(sent.map((save) => save.hex)).toEqual(['AA0004']);
      expect(hexBox().value).toBe('AA0004');
    });

    it('a code typed while the save is out stands when the answer lands, kept or refused', async () => {
      for (const kept of [true, false]) {
        const sent: { hex: string; answer: (kept: boolean) => void }[] = [];
        const { unmount } = render(<AnsweredLater sent={sent} />);
        await userEvent.clear(hexBox());
        await userEvent.type(hexBox(), 'BB0002{Enter}');
        await userEvent.clear(hexBox());
        await userEvent.type(hexBox(), 'CC00');
        await answer(sent[0]!, kept);
        expect(hexBox().value, kept ? 'kept' : 'refused').toBe('CC00');
        await userEvent.type(hexBox(), '03{Enter}');
        expect(sent.map((save) => save.hex)).toEqual(['BB0002', 'CC0003']);
        unmount();
      }
    });

    it('Enter while the save is out submits no form', async () => {
      const onSubmit = vi.fn((event: { preventDefault: () => void }) => event.preventDefault());
      const sent: { hex: string; answer: (kept: boolean) => void }[] = [];
      render(
        <form onSubmit={onSubmit}>
          <AnsweredLater sent={sent} />
        </form>,
      );
      await userEvent.clear(hexBox());
      await userEvent.type(hexBox(), 'AA0001{Enter}{Enter}');
      expect(fireEvent.keyDown(hexBox(), { key: 'Enter' }), 'the key is cancelled').toBe(false);
      await answer(sent[0]!, true);
      expect(fireEvent.keyDown(hexBox(), { key: 'Enter' }), 'the key is left alone').toBe(true);
    });
  });

  // R5 (#3680): Enter in a text box submits the form it is in, and a box that holds no colour has nothing to submit.
  it.each(['zzz', 'B547', '# abcdef', ''])('Enter on %j is cancelled, so no form is submitted with it', async (text) => {
    render(<Free start="B5473C" onRefused={() => undefined} />);
    await userEvent.clear(hexBox());
    if (text) await userEvent.type(hexBox(), text);
    expect(fireEvent.keyDown(hexBox(), { key: 'Enter' })).toBe(false);
    expect(fireEvent.keyDown(hexBox(), { key: 'Enter' })).toBe(false);
  });

  it('Enter on a colour is left to the form', async () => {
    render(<Free start="B5473C" />);
    await userEvent.clear(hexBox());
    await userEvent.type(hexBox(), 'AA0001');
    expect(fireEvent.keyDown(hexBox(), { key: 'Enter' })).toBe(true);
  });

  // R6 (#3680): the hint showed on hover, or on focusing the box again, and not at the refusal.
  it('a hex refused with focus in the box shows the hint', async () => {
    render(
      <TooltipProvider>
        <Free start="B5473C" />
      </TooltipProvider>,
    );
    await userEvent.tab();
    await userEvent.tab();
    expect(document.activeElement).toBe(hexBox());
    await userEvent.clear(hexBox());
    await userEvent.keyboard('B547');
    expect(screen.queryByRole('tooltip')).toBeNull();
    await userEvent.keyboard('{Enter}');
    expect(document.activeElement).toBe(hexBox());
    expect((await screen.findByRole('tooltip')).textContent).toBe('Six hex digits, like B5473C');
  });

  it('the hint goes when the narrator types again, with Escape, and when focus leaves', async () => {
    render(
      <TooltipProvider>
        <Free start="B5473C" />
        <button type="button">Next</button>
      </TooltipProvider>,
    );
    const refuse = async () => {
      await userEvent.clear(hexBox());
      await userEvent.keyboard('B547{Enter}');
      await screen.findByRole('tooltip');
    };
    await userEvent.tab();
    await userEvent.tab();
    await refuse();
    await userEvent.keyboard('3');
    await waitFor(() => expect(screen.queryByRole('tooltip')).toBeNull());
    await refuse();
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('tooltip')).toBeNull());
    expect(hexBox().value).toBe('B5473C');
    await refuse();
    await userEvent.tab();
    await waitFor(() => expect(screen.queryByRole('tooltip')).toBeNull());
    expect(hexBox().getAttribute('aria-invalid')).toBe('true');
  });

  // B7 (#3680): a form that saves later holds refused text as its own unsaved value.
  it('onRefused: hands refused text to the caller, once, tidied as a colour would be', async () => {
    const onChange = vi.fn();
    const onRefused = vi.fn();
    render(<Free start="B5473C" onChange={onChange} onRefused={onRefused} />);
    await userEvent.clear(hexBox());
    await userEvent.type(hexBox(), ' #4d5e6{Enter}');
    await userEvent.tab();
    expect(onRefused).toHaveBeenCalledExactlyOnceWith('4D5E6');
    expect(onChange).not.toHaveBeenCalled();
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
    expect(screen.getByLabelText('Note color', { selector: 'input[type="text"]' })).toBe(hexBox());
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
