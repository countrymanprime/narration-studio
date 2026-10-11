import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import { IconButton } from '../../../primitives/IconButton';
import { bookmark, NOTED } from './bookmarkFixtures';
import { BookmarkEditor } from './BookmarkEditor';

// The mock's editor popover: the words, a delete icon, a label (60) and a note (500). The popover opens on a press of its trigger.
const meta = {
  title: 'Script/BookmarkEditor',
  component: BookmarkEditor,
  args: {
    bookmark: bookmark(),
    snippet: 'rose-tree stood against the wall, and the gardeners were busily…',
    trigger: <IconButton action="editBookmark" label="Edit bookmark" />,
    onUpdate: fn(),
    onRemove: fn(),
  },
  render: (args) => (
    <div className="h-72">
      <BookmarkEditor {...args} />
    </div>
  ),
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Edit bookmark' }));
    await expect(within(document.body).findByRole('dialog', { name: 'Edit bookmark' })).resolves.toBeTruthy();
  },
} satisfies Meta<typeof BookmarkEditor>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {};
export const WithText: Story = { args: { bookmark: NOTED } };
// From 80% of a limit the count shows beside the field (label 60, note 500).
export const NearTheLimits: Story = { args: { bookmark: bookmark({ label: 'x'.repeat(52), note: 'y'.repeat(430) }) } };
export const StaleLine: Story = { args: { bookmark: bookmark({ stale: true, paragraph: null }), snippet: '' } };
