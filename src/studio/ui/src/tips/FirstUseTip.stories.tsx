import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import { ApiProvider } from '../api/ApiContext';
import { createMockApi } from '../api/mockApi';
import { FirstUseTip } from './FirstUseTip';

// The first-use tip over a page: a card near the top of the nearest positioned ancestor, with Got it. The mock host starts with no tip
// dismissed, so each story sees it; Got it saves the dismissal to the mock's settings and hides it.
const meta = {
  title: 'Tips/FirstUseTip',
  component: FirstUseTip,
  args: { id: 'script.select-text' },
  render: (args) => (
    <ApiProvider api={createMockApi()}>
      <div className="relative h-60 w-[30rem] max-w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
        <p className="m-0">The page the tip floats over.</p>
        <FirstUseTip {...args} />
      </div>
    </ApiProvider>
  ),
} satisfies Meta<typeof FirstUseTip>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Shown: Story = {
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByRole('complementary', { name: 'Tip' })).toBeVisible();
  },
};

export const DismissedWithGotIt: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole('button', { name: 'Got it' }));
    await expect(canvas.queryByRole('complementary', { name: 'Tip' })).toBeNull();
  },
};

// The narrator already did what the tip explains: it never shows.
export const UsedAlready: Story = {
  args: { used: true },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).queryByRole('complementary', { name: 'Tip' })).toBeNull();
  },
};
