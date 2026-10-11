import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import { KeyHints } from './KeyHints';

const meta = {
  title: 'Primitives/KeyHints',
  component: KeyHints,
  args: {
    hints: [
      { keys: ['↑', '↓'], label: 'Notes' },
      { keys: ['←', '→'], label: 'Chapters' },
      { keys: ['Ctrl', 'Z'], label: 'Undo' },
      { keys: ['Space'], label: 'Play' },
      { keys: ['Enter'], label: 'Keep the take' },
      { keys: ['Esc'], label: 'Close' },
      { keys: ['Right-click'], label: 'Menu' },
    ],
  },
} satisfies Meta<typeof KeyHints>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const FewHints: Story = { args: { hints: [{ keys: ['P', 'E', 'W', 'D'], label: 'Pickup, edit, waive, defer' }] } };

export const IsANoteRegion: Story = {
  play: async ({ canvasElement }) => {
    const foot = within(canvasElement).getByRole('note', { name: 'Keyboard shortcuts' });
    await expect(within(foot).getByText('Notes')).toBeVisible();
  },
};
