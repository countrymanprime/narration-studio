import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import { DawIndicator } from './DawIndicator';

const meta = {
  title: 'Production/DawIndicator',
  component: DawIndicator,
  args: { daw: 'REAPER', onOpen: fn() },
} satisfies Meta<typeof DawIndicator>;

export default meta;
type Story = StoryObj<typeof meta>;

// DQ-5: the wording names the DAW the capability reports.
export const NotConnected: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: /REAPER not connected/ }));
    await expect(args.onOpen).toHaveBeenCalledTimes(1);
  },
};

export const Connecting: Story = {
  args: { settling: true },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('status').textContent).toBe('Connecting to REAPER…');
  },
};
