import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, fn, screen, userEvent, waitFor, within } from 'storybook/test';
import { ColourField, type ColourChoice } from './ColourField';

// The Story Bible's entry-type colours: names are the caller's, tokens are the kind hues (docs/design/design-system.md#primitive-components).
const TYPE_COLOURS: readonly ColourChoice<string>[] = [
  { value: 'green', token: 'character', name: 'Green' },
  { value: 'blue', token: 'place', name: 'Blue' },
  { value: 'violet', token: 'org', name: 'Violet' },
  { value: 'amber', token: 'lore', name: 'Amber' },
  { value: 'teal', token: 'item', name: 'Teal' },
  { value: 'rose', token: 'event', name: 'Rose' },
];

// The two modes' props in one flat shape, so a story's args can name any of them; `Controlled` hands each mode its own.
type DemoProps = {
  mode: 'palette' | 'free';
  label: string;
  value: string | null;
  onChange: (value: string | null) => void;
  disabled?: boolean;
  className?: string;
  automatic?: { resolvesTo: string };
  form?: 'row' | 'popover';
  pending?: boolean;
  allowUnset?: boolean;
  placeholder?: string;
  hexClassName?: string;
};

// Controlled, like every call site: the story feeds the new value back in.
function Controlled({
  mode,
  label,
  value: initial,
  onChange,
  disabled,
  className,
  automatic,
  form,
  pending,
  allowUnset,
  placeholder,
  hexClassName,
}: DemoProps) {
  const [value, setValue] = useState(initial);
  const change = (next: string | null) => {
    setValue(next);
    onChange(next);
  };
  if (mode === 'free') {
    return (
      <ColourField
        mode="free"
        label={label}
        value={value ?? ''}
        onChange={change}
        disabled={disabled}
        className={className}
        allowUnset={allowUnset}
        placeholder={placeholder}
        hexClassName={hexClassName}
      />
    );
  }
  return (
    <ColourField
      mode="palette"
      label={label}
      choices={TYPE_COLOURS}
      value={value}
      onChange={change}
      disabled={disabled}
      className={className}
      automatic={automatic}
      form={form}
      pending={pending}
    />
  );
}

const meta = {
  title: 'Primitives/ColourField',
  component: Controlled,
  args: { mode: 'palette', label: 'Colour for Character', value: 'blue', onChange: fn() },
} satisfies Meta<typeof Controlled>;

export default meta;
type Story = StoryObj<typeof meta>;

const FREE = { mode: 'free', label: 'Note color', value: 'B5473C', hexClassName: 'w-28' } as const;

// A radio group of 28 px swatch buttons; the chosen one has a ring in the text colour and a check, so it is told by shape (CS-C4).
export const PaletteRow: Story = {};

// The speaker colour's first choice: "Auto" beside the hue the app would pick, named "Automatic (Violet)".
export const PaletteWithAutomatic: Story = { args: { automatic: { resolvesTo: 'violet' } } };
export const PaletteAutomaticChosen: Story = { args: { value: null, automatic: { resolvesTo: 'violet' } } };

// A save is running: the row looks the same and keeps focus, says it is busy, and a pick does nothing.
export const PalettePendingIsBusyAndFocusable: Story = {
  args: { pending: true },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('radiogroup', { name: 'Colour for Character' })).toHaveAttribute('aria-busy', 'true');
    const chosen = canvas.getByRole('radio', { name: 'Blue' });
    chosen.focus();
    await expect(chosen).toHaveFocus();
    await userEvent.keyboard('{ArrowRight}');
    await expect(args.onChange).not.toHaveBeenCalled();
    await expect(chosen).toHaveAttribute('aria-checked', 'true');
  },
};

export const PaletteDisabled: Story = { args: { disabled: true } };

// At 390 px a row wider than its column wraps onto a second line and never scrolls sideways.
export const PaletteRowWrapsInANarrowColumn: Story = {
  args: { automatic: { resolvesTo: 'green' }, className: 'max-w-[9rem]' },
};

// The select-like box for a table cell, at the 130 px the Entry types row gives it: the swatch, the name and the caret at the control height.
export const PalettePopoverClosed: Story = { args: { form: 'popover', className: 'w-[130px]' } };

// A narrower box has no room for the name and draws the swatch alone; the name is the box's hint and part of its accessible name.
export const PalettePopoverNarrow: Story = { args: { form: 'popover', className: 'w-[100px]', value: null, automatic: { resolvesTo: 'violet' } } };

export const PalettePopoverPicksStaysOpenAndEscapeReturnsFocus: Story = {
  args: { form: 'popover', className: 'w-[130px]' },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Colour for Character: Blue' }));
    const row = await screen.findByRole('radiogroup', { name: 'Colour for Character' });
    await waitFor(() => expect(within(row).getByRole('radio', { name: 'Blue' })).toHaveFocus());
    // An arrow key checks the next swatch and leaves the row open.
    await userEvent.keyboard('{ArrowRight}');
    await expect(args.onChange).toHaveBeenLastCalledWith('violet');
    await expect(row).toBeVisible();
    // A pointer press picks and leaves the row open too: nothing closes under the pointer for a second press to fall through.
    await userEvent.click(within(row).getByRole('radio', { name: 'Teal' }));
    await expect(args.onChange).toHaveBeenLastCalledWith('teal');
    await expect(row).toBeVisible();
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('radiogroup')).toBeNull());
    await waitFor(() => expect(canvas.getByRole('button', { name: 'Colour for Character: Teal' })).toHaveFocus());
  },
};

// The open row, left open for the atlas to draw and for axe to read.
export const PalettePopoverOpen: Story = {
  args: { form: 'popover', className: 'w-[130px]' },
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Colour for Character: Blue' }));
    await expect(await screen.findByRole('radiogroup', { name: 'Colour for Character' })).toBeVisible();
  },
};

// The browser's picker as a square at the control height, and six hex digits in the code face beside it, 8 px apart.
export const Free: Story = { args: FREE };

// No colour stored: the picker shows mid grey and the box its placeholder.
export const FreeUnset: Story = { args: { ...FREE, value: '', allowUnset: true, placeholder: 'Not set' } };

// What is not six hex digits stays in the box with the danger border and is never reported; no text is added to the page.
// The atlas presses the first key within a frame of mounting, which is what holds `useSettledDraft` to reading its draft during render: a draft
// copied in by a mount effect lost that key (jsdom runs the effect first and cannot show it).
export const FreeInvalidStaysInTheBox: Story = {
  args: FREE,
  play: async ({ args, canvasElement }) => {
    const box = within(canvasElement).getByRole('textbox', { name: 'Note color hex' });
    await userEvent.clear(box);
    await userEvent.type(box, 'zzz');
    await userEvent.tab();
    await expect(box).toHaveAttribute('aria-invalid', 'true');
    await expect(box).toHaveValue('zzz');
    await expect(args.onChange).not.toHaveBeenCalled();
  },
};

export const FreeSettlesOnEnter: Story = {
  args: FREE,
  play: async ({ args, canvasElement }) => {
    const box = within(canvasElement).getByRole('textbox', { name: 'Note color hex' });
    await userEvent.clear(box);
    await userEvent.type(box, '#3c7a5c');
    await expect(args.onChange).not.toHaveBeenCalled();
    await userEvent.keyboard('{Enter}');
    await expect(args.onChange).toHaveBeenLastCalledWith('3C7A5C');
    await expect(box).toHaveValue('3C7A5C');
  },
};

export const FreeDisabled: Story = { args: { ...FREE, disabled: true } };
