import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState, type ComponentProps } from 'react';
import { expect, fn, userEvent, within } from 'storybook/test';
import { DateField } from './DateField';

function ControlledDateField(props: ComponentProps<typeof DateField>) {
  const [value, setValue] = useState(props.value);
  return (
    <div className="max-w-60">
      <DateField
        {...props}
        value={value}
        onChange={(next) => {
          setValue(next);
          props.onChange(next);
        }}
      />
    </div>
  );
}

const meta = {
  title: 'Primitives/DateField',
  component: DateField,
  args: { label: 'Due', value: '2026-10-14', onChange: fn() },
  render: (args) => <ControlledDateField {...args} />,
} satisfies Meta<typeof DateField>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Filled: Story = {};
export const Empty: Story = { args: { value: '' } };
export const Disabled: Story = { args: { disabled: true } };
// A caller's `w-` class sets the width instead of the full-width default (the Schedule's Final delivery row is a 152 px column).
export const WithWidthClass: Story = { args: { className: 'w-40' } };

// The value is the browser's own "YYYY-MM-DD", and a change reports it in that form.
export const ReportsTheIsoDate: Story = {
  play: async ({ args, canvasElement }) => {
    const field = within(canvasElement).getByLabelText('Due');
    await expect(field).toHaveValue('2026-10-14');
    await userEvent.clear(field);
    await expect(args.onChange).toHaveBeenLastCalledWith('');
  },
};

export const DisabledTakesNoInput: Story = {
  args: { disabled: true },
  play: async ({ args, canvasElement }) => {
    await expect(within(canvasElement).getByLabelText('Due')).toBeDisabled();
    await expect(args.onChange).not.toHaveBeenCalled();
  },
};
