import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState, type ComponentProps } from 'react';
import { expect, fn, userEvent, within } from 'storybook/test';
import { NumberInput } from './NumberInput';

function ControlledNumberInput(props: ComponentProps<typeof NumberInput>) {
  const [value, setValue] = useState(props.value);
  return (
    <div className="max-w-40">
      <NumberInput
        {...props}
        value={value}
        onValueChange={(next) => {
          setValue(next);
          props.onValueChange(next);
        }}
      />
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
