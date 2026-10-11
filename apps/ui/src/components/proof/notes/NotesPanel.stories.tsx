import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import { useState, type ComponentProps } from 'react';
import { NotesPanel } from './NotesPanel';
import type { NoteSort } from './noteRows';
import { notesFixture } from './testNotes';

// The queue panel of the Studio Next Proof page: heading, filter chips with counts, the sort, find in notes, the Sources line and
// the grouped table (D98). The host owns the sort, so the story only keeps the choice.
function Panel(props: ComponentProps<typeof NotesPanel>) {
  const [sort, setSort] = useState<NoteSort>(props.sort);
  const [selected, setSelected] = useState<string | null>(props.selectedId);
  return (
    <div className="h-[28rem] bg-[var(--bg)] p-3">
      <NotesPanel {...props} sort={sort} onSortChange={setSort} selectedId={selected} onSelect={setSelected} />
    </div>
  );
}

const meta = {
  title: 'Proof/NotesPanel',
  component: NotesPanel,
  args: { findings: notesFixture(), allChapters: true, sort: 'time', onSortChange: () => {}, selectedId: null, onSelect: () => {} },
  render: (args) => <Panel {...args} />,
} satisfies Meta<typeof NotesPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

const chapter = notesFixture().filter((f) => f.manuscript?.chapter_id === 'ch1');

export const AllChapters: Story = { args: { allChapters: true } };

export const OneChapter: Story = { args: { allChapters: false, findings: chapter, window: { start: 10, len: 100, total: 760 } } };

export const FilteredToNothing: Story = {
  args: { findings: chapter.filter((f) => f.id === 'a') },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    canvas.getByRole('button', { name: /^Pickups/ }).click();
    await expect(await canvas.findByRole('heading', { name: 'No notes match' })).toBeTruthy();
  },
};

export const NoNotes: Story = { args: { findings: [], allChapters: false } };

export const OneRowSelected: Story = { args: { selectedId: 'b' } };
