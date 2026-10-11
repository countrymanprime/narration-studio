import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import { bookmark, lineText, NOTED, STALE } from './bookmarkFixtures';
import { BookmarkRibbon } from './BookmarkRibbon';

// The Studio Next mock's gutter ribbon (`BookmarkEditor.tsx`): a bookmark icon in the margin, a dot when the bookmark has a note, and a
// click that opens its editor. The margin is the caller's, so the stories draw one.
const meta = {
  title: 'Script/BookmarkRibbon',
  component: BookmarkRibbon,
  args: { bookmark: bookmark(), lineText, top: 8, onUpdate: fn(), onRemove: fn() },
  render: (args) => (
    <div className="relative ml-8 h-24 w-64 border-l border-[var(--line)] text-sm text-[var(--text)]">
      <BookmarkRibbon {...args} />
      <p className="m-0 pl-3">A line of the manuscript beside its ribbon.</p>
    </div>
  ),
} satisfies Meta<typeof BookmarkRibbon>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithoutNote: Story = {};
export const WithNote: Story = { args: { bookmark: NOTED } };
// After a jump the ribbon pulses once (a still render under reduced motion).
export const FlashingAfterAJump: Story = { args: { bookmark: NOTED, flash: true } };
// A stale bookmark has no line to sit beside, so the margin is empty.
export const StaleDrawsNothing: Story = {
  args: { bookmark: STALE },
  play: ({ canvasElement }) => expect(within(canvasElement).queryByRole('button')).toBeNull(),
};

export const OpensItsEditor: Story = {
  args: { bookmark: NOTED },
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Bookmark: Roses: Painting scene' }));
    await expect(within(document.body).findByRole('dialog', { name: 'Edit bookmark' })).resolves.toBeTruthy();
  },
};
