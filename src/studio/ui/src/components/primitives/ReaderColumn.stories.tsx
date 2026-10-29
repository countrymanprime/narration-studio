import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import { ReaderColumn } from './ReaderColumn';

const TEXT = 'Alice was beginning to get very tired of sitting by her sister on the bank, and of having nothing to do. '.repeat(4);

const meta = {
  title: 'Primitives/ReaderColumn',
  component: ReaderColumn,
  args: { width: 'min(64ch, 64%)', children: TEXT },
  decorators: [
    (Story) => (
      <div className="w-[48rem] max-w-full border border-dashed border-[var(--border)] p-4">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ReaderColumn>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Medium: Story = {};
export const Narrow: Story = { args: { width: 'min(48ch, 48%)' } };
export const Full: Story = {
  args: { width: 'min(100ch, 100%)' },
  play: async ({ canvasElement }) => {
    const column = canvasElement.querySelector<HTMLElement>('[data-reader-column]')!;
    const box = column.parentElement!.getBoundingClientRect();
    const rect = column.getBoundingClientRect();
    // Centred: equal room each side.
    await expect(Math.abs(rect.left - box.left - (box.right - rect.right))).toBeLessThanOrEqual(1);
    await expect(within(canvasElement).getByText(/Alice was beginning/)).toBeTruthy();
  },
};
