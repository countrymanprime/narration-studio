import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import { LoadingRegion, Skeleton } from './Skeleton';

const meta = {
  title: 'Primitives/Skeleton',
  component: Skeleton,
  decorators: [
    (Story) => (
      <div className="w-72">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Skeleton>;

export default meta;
type Story = StoryObj<typeof meta>;

// The mock's 20 px block (`.skeleton`); it is decoration, so it is not in the accessibility tree.
export const Line: Story = {};

// The mock's 64 px block (`.skeleton.tall`), a settings row.
export const Tall: Story = { args: { tall: true } };

// A page's loading state: one busy, named group with one polite status; the blocks inside say nothing.
export const Region: Story = {
  render: () => (
    <LoadingRegion label="Loading the Booth" status="Reading the chapters…" className="flex flex-col gap-3">
      <Skeleton tall />
      <Skeleton tall />
      <Skeleton className="w-2/3" />
    </LoadingRegion>
  ),
  play: async ({ canvasElement }) => {
    const region = within(canvasElement).getByRole('group', { name: 'Loading the Booth' });
    await expect(region).toHaveAttribute('aria-busy', 'true');
    await expect(within(canvasElement).getAllByRole('status')).toHaveLength(1);
  },
};
