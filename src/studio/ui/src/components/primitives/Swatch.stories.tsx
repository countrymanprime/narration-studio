import type { Meta, StoryObj } from '@storybook/react-vite';
import { Swatch, SWATCH_COLOURS } from './Swatch';

const meta = {
  title: 'Primitives/Swatch',
  component: Swatch,
  args: { colour: 'accent' },
} satisfies Meta<typeof Swatch>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Sized: Story = { args: { colour: 'place', size: 18 } };

// Every hue the repo has for entity kinds and speakers, each beside the label that names it.
export const Hues: Story = {
  render: () => (
    <ul className="m-0 flex list-none flex-wrap gap-x-5 gap-y-2 p-0 text-[var(--text)]">
      {SWATCH_COLOURS.map((colour) => (
        <li key={colour} className="flex items-center gap-1.5">
          <Swatch colour={colour} />
          <span>{colour}</span>
        </li>
      ))}
    </ul>
  ),
};
