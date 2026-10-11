import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import { BiblePanel } from './BiblePanel';
import { ALICE, GARDEN, SOURCES } from './bibleFixtures';
import { BIBLE_KINDS } from './kinds';

// The mock's Story Bible tab (`pages/script/BibleTab.tsx`): the chapter's entries and one entry read-only. Editing stays on the Story Bible page.
const meta = {
  title: 'Script/BiblePanel',
  component: BiblePanel,
  args: {
    entry: ALICE,
    missing: null,
    kinds: BIBLE_KINDS,
    entries: [ALICE, GARDEN],
    sources: SOURCES,
    onPick: fn(),
    onFind: fn(),
    onAddNote: fn(),
    onOpenStoryBible: fn(),
    onCreate: fn(),
  },
  render: (args) => (
    <div className="max-w-[22rem] bg-[var(--bg)] p-3">
      <BiblePanel {...args} />
    </div>
  ),
} satisfies Meta<typeof BiblePanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const CharacterEntry: Story = {};
export const PlaceEntry: Story = { args: { entry: GARDEN } };
export const NoEntrySelected: Story = { args: { entry: undefined } };
export const UnknownText: Story = { args: { entry: undefined, missing: 'Zzyzxa' } };
export const EmptyChapter: Story = { args: { entry: undefined, entries: [] } };
// Both links go out through the props: Find with the name, Story Bible with the id.
export const LinksGoWhereTheySay: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Find in the manuscript' }));
    await expect(args.onFind).toHaveBeenCalledWith('Alice');
    await userEvent.click(canvas.getByRole('button', { name: 'Open in Story Bible' }));
    await expect(args.onOpenStoryBible).toHaveBeenCalledWith('alice');
  },
};
