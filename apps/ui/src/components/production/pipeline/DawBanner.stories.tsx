import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, within } from 'storybook/test';
import { DawBanner } from './DawBanner';

const meta = {
  title: 'Production/DawBanner',
  component: DawBanner,
  args: { reachable: false, daw: 'REAPER', onRetry: fn(), onUseBuiltIn: fn() },
} satisfies Meta<typeof DawBanner>;

export default meta;
type Story = StoryObj<typeof meta>;

// DQ-5: the wording names the DAW the capability reports.
export const DawDown: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('status').textContent).toContain('REAPER is not running.');
    canvas.getByRole('button', { name: 'Retry' }).click();
    await expect(args.onRetry).toHaveBeenCalledTimes(1);
  },
};
