import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState, type ComponentProps } from 'react';
import { expect, fn, userEvent, within } from 'storybook/test';
import { ToggleGroup } from './ToggleGroup';

const OPTIONS = [
  { value: 'tiny', label: 'Tiny', title: 'Fastest, least accurate' },
  { value: 'small', label: 'Small' },
  { value: 'large', label: 'Large', disabled: true, title: 'Not available for this machine' },
];

function ControlledGroup(props: ComponentProps<typeof ToggleGroup>) {
  const [value, setValue] = useState(props.value);
  return (
    <ToggleGroup
      {...props}
      className="gap-1.5"
      value={value}
      onChange={(next) => {
        setValue(next);
        props.onChange(next);
      }}
    />
  );
}

const meta = {
  title: 'Primitives/ToggleGroup',
  component: ToggleGroup,
  args: { label: 'Whisper model', value: 'tiny', options: OPTIONS, onChange: fn() },
  render: (args) => <ControlledGroup {...args} />,
} satisfies Meta<typeof ToggleGroup>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const SecondChosen: Story = { args: { value: 'small' } };

// The group has a name, exactly one chip is pressed, and pressing another reports its value and moves the press.
export const ChoosingMovesThePress: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const group = canvas.getByRole('group', { name: 'Whisper model' });
    await expect(within(group).getByRole('button', { name: 'Tiny' })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(within(group).getByRole('button', { name: 'Small' }));
    await expect(args.onChange).toHaveBeenLastCalledWith('small');
    await expect(within(group).getByRole('button', { name: 'Small' })).toHaveAttribute('aria-pressed', 'true');
    await expect(within(group).getByRole('button', { name: 'Tiny' })).toHaveAttribute('aria-pressed', 'false');
  },
};

// A chip the caller has turned off cannot be pressed.
export const DisabledChipIsNotChosen: Story = {
  play: async ({ args, canvasElement }) => {
    const large = within(canvasElement).getByRole('button', { name: 'Large' });
    await expect(large).toBeDisabled();
    large.click();
    await expect(args.onChange).not.toHaveBeenCalled();
  },
};

// The segmented look (the Master platform switch): one bordered
// container, the chosen segment filled `--accent`, the label in its own case (title case here, not uppercase).
export const Segmented: Story = {
  args: {
    label: 'Platform',
    look: 'segmented',
    value: 'acx',
    options: [
      { value: 'acx', label: 'ACX' },
      { value: 'inaudio', label: 'iNaudio' },
      { value: 'google-play', label: 'Google Play' },
      { value: 'apple', label: 'Apple (M4B)' },
      { value: 'kobo', label: 'Kobo' },
    ],
  },
};

export const SegmentedMeasuredShapes: Story = {
  render: (args) => <ControlledGroup {...args} />,
  args: Segmented.args,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const group = canvas.getByRole('group', { name: 'Platform' });
    const chosen = within(group).getByRole('button', { name: 'ACX' });
    const rest = within(group).getByRole('button', { name: 'Kobo' });
    // Measured in the atlas's browser; jsdom (stories.test.tsx) lays nothing out and loads no stylesheet, so there the
    // classes are what ToggleGroup.test.tsx pins.
    const height = group.getBoundingClientRect().height;
    if (height === 0) return;
    // The control height (36 px) on one row, so it lines up with a search box or select beside it; the mock's 33 px left it short of them
    // (alignment audit XSE1-19, #2472). In a container too narrow for the options (390 px) the group wraps onto a second row and grows, and
    // no option is clipped by its edge (#2642).
    const buttons = within(group).getAllByRole('button');
    const oneRow = new Set(buttons.map((button) => button.offsetTop)).size === 1;
    if (oneRow) await expect(height).toBeCloseTo(36, 0);
    else await expect(height).toBeGreaterThan(36);
    const edge = group.getBoundingClientRect().right;
    for (const button of buttons) await expect(button.getBoundingClientRect().right).toBeLessThanOrEqual(edge + 0.5);
    await expect(getComputedStyle(chosen).textTransform).not.toBe('uppercase');
    await expect(getComputedStyle(chosen).backgroundColor).not.toBe(getComputedStyle(rest).backgroundColor);
  },
};
