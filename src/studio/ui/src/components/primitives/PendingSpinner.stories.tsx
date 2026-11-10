import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import { PendingSpinner } from './PendingSpinner';

const meta = { title: 'Primitives/PendingSpinner', component: PendingSpinner } satisfies Meta<typeof PendingSpinner>;

export default meta;
type Story = StoryObj<typeof meta>;

// The one mark a pending control draws; hidden from a screen reader (the control says `aria-busy`).
export const Default: Story = {
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).queryByRole('img')).toBeNull();
    await expect(canvasElement.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
  },
};
