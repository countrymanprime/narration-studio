import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState, type ComponentProps } from 'react';
import { expect, fn, within } from 'storybook/test';
import { Slider } from './Slider';

// Controlled, like every call site: the story feeds the new value back in.
function ControlledSlider(props: ComponentProps<typeof Slider>) {
  const [value, setValue] = useState(props.value);
  return (
    <Slider
      {...props}
      value={value}
      valueText={props.valueText === undefined ? undefined : `${value} px`}
      onValueChange={(next) => {
        setValue(next);
        props.onValueChange(next);
      }}
    />
  );
}

const meta = {
  title: 'Primitives/Slider',
  component: Slider,
  args: { value: 28, min: 12, max: 48, step: 1, label: 'Text size', valueText: '28 px', onValueChange: fn() },
  render: (args) => <ControlledSlider {...args} />,
  decorators: [
    (Story) => (
      <div className="w-72">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Slider>;

export default meta;
type Story = StoryObj<typeof meta>;

// The mock's control: a label on the left, the readout on the right, a 4 px track and an 18 px thumb.
export const WithLabelAndReadout: Story = {
  play: async ({ canvasElement }) => {
    const range = within(canvasElement).getByRole('slider', { name: 'Text size' });
    await expect(range).toHaveAttribute('aria-valuetext', '28 px');
  },
};

// With neither label nor readout no header renders; the page supplies its own and the slider is named by aria-label.
export const WithoutHeader: Story = {
  args: { label: undefined, valueText: undefined, 'aria-label': 'Gap' },
};

export const AtMinimum: Story = { args: { value: 12, valueText: '12 px' } };
export const AtMaximum: Story = { args: { value: 48, valueText: '48 px' } };
export const Disabled: Story = { args: { disabled: true } };

// Arrow, Home, End and Page keys are proved in Slider.test.tsx: Base UI builds a KeyboardEvent that the Storybook jsdom runner's window rejects.
