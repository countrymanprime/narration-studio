import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import { bookmark, CHAPTERS, lineText, NOTED, SEVERAL, STALE } from './bookmarkFixtures';
import { BookmarksTab } from './BookmarksTab';

// The mock's Bookmarks tab: the book's bookmarks by chapter, a row per bookmark with its title, note and words, edit and delete.
const meta = {
  title: 'Script/BookmarksTab',
  component: BookmarksTab,
  args: { bookmarks: SEVERAL, chapters: CHAPTERS, lineText, currentId: null, onGoTo: fn(), onUpdate: fn(), onRemove: fn() },
  render: (args) => (
    <div className="max-w-[22rem] bg-[var(--surface)] p-3">
      <BookmarksTab {...args} />
    </div>
  ),
} satisfies Meta<typeof BookmarksTab>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = { args: { bookmarks: [] } };
export const SeveralChapters: Story = {
  play: async ({ canvasElement, args }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: /Roses/ }));
    await expect(args.onGoTo).toHaveBeenCalledWith(NOTED);
  },
};
// The bookmark last gone to is outlined and `aria-current`.
export const CurrentBookmark: Story = { args: { currentId: NOTED.id } };
export const StaleOne: Story = { args: { bookmarks: [bookmark(), STALE] } };
