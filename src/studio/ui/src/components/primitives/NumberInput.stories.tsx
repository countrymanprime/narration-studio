import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState, type ComponentProps } from 'react';
import { expect, fn, userEvent, within } from 'storybook/test';
import { NumberInput } from './NumberInput';

type NumberInputProps = ComponentProps<typeof NumberInput>;

function ControlledNumberInput(props: NumberInputProps) {
  const [value, setValue] = useState<number | null>(props.value);
  const onValueChange = (next: number | null) => {
    setValue(next);
    // `null` only arrives under `allowEmpty`, where the story's handler takes it.
    (props.onValueChange as (value: number | null) => void)(next);
  };
  // A spread cannot rebuild the `allowEmpty` union; the props are the story's own, with the value fed back in.
  const controlled = { ...props, value, onValueChange } as NumberInputProps;
  return (
    <div className="max-w-40">
      <NumberInput {...controlled} />
    </div>
  );
}

const meta = {
  title: 'Primitives/NumberInput',
  component: NumberInput,
  args: { label: 'Count', value: 3, min: 1, max: 12, step: 1, onValueChange: fn() },
  render: (args) => <ControlledNumberInput {...args} />,
} satisfies Meta<typeof NumberInput>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const AtMinimum: Story = { args: { value: 1 } };
export const AtMaximum: Story = { args: { value: 12 } };
export const Invalid: Story = { args: { invalid: true } };
export const Disabled: Story = { args: { disabled: true } };

// A valid number is applied at once; an out-of-range one is clamped when focus leaves.
export const ClampsOnBlur: Story = {
  play: async ({ args, canvasElement }) => {
    const field = within(canvasElement).getByRole('textbox', { name: 'Count' });
    await userEvent.clear(field);
    await userEvent.type(field, '99');
    // "9" is in range and applied; "99" is not, and waits for focus to leave.
    await expect(args.onValueChange).toHaveBeenCalledTimes(1);
    await userEvent.tab();
    await expect(args.onValueChange).toHaveBeenLastCalledWith(12);
    await expect(field).toHaveValue('12');
  },
};

export const ArrowKeysStep: Story = {
  play: async ({ args, canvasElement }) => {
    const field = within(canvasElement).getByRole('textbox', { name: 'Count' });
    await userEvent.click(field);
    await userEvent.keyboard('{ArrowUp}');
    await expect(args.onValueChange).toHaveBeenLastCalledWith(4);
  },
};

// `allowEmpty`: an unset value is an empty box with its placeholder, never 0.
export const EmptyIsNotSet: Story = { args: { allowEmpty: true, value: null, placeholder: 'Not set' } };

// `allowEmpty`: emptying the box reports `null` and the box stays empty when focus leaves.
export const EmptiedReportsNull: Story = {
  args: { allowEmpty: true },
  play: async ({ args, canvasElement }) => {
    const field = within(canvasElement).getByRole('textbox', { name: 'Count' });
    await userEvent.clear(field);
    await expect(args.onValueChange).toHaveBeenLastCalledWith(null);
    await userEvent.tab();
    await expect(field).toHaveValue('');
  },
};

// `commit="settle"`, for a box that saves what it reports: nothing while typing, one clamped value on Enter, and Escape drops a draft.
export const SettleReportsOnEnter: Story = {
  args: { commit: 'settle' },
  play: async ({ args, canvasElement }) => {
    const field = within(canvasElement).getByRole('textbox', { name: 'Count' });
    await userEvent.clear(field);
    await userEvent.type(field, '99');
    await expect(args.onValueChange).not.toHaveBeenCalled();
    await userEvent.keyboard('{Enter}');
    await expect(args.onValueChange).toHaveBeenCalledTimes(1);
    await expect(args.onValueChange).toHaveBeenLastCalledWith(12);
    await userEvent.clear(field);
    await userEvent.type(field, '5{Escape}');
    await expect(field).toHaveValue('12');
    await expect(args.onValueChange).toHaveBeenCalledTimes(1);
  },
};

// `stepFrom`: the steps are counted from it, so an arrow from a value between two steps lands on the next step, not one step past the value.
export const ArrowLandsOnTheNextStep: Story = {
  args: { value: 2.5, min: 0, max: 12, step: 1, stepFrom: 0 },
  play: async ({ args, canvasElement }) => {
    const field = within(canvasElement).getByRole('textbox', { name: 'Count' });
    await userEvent.click(field);
    await userEvent.keyboard('{ArrowUp}');
    await expect(args.onValueChange).toHaveBeenLastCalledWith(3);
    await userEvent.keyboard('{ArrowUp}');
    await expect(args.onValueChange).toHaveBeenLastCalledWith(4);
  },
};
