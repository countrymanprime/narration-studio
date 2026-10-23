import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import { InThisChapter } from './InThisChapter';

// The shared "In this chapter" list the Script rail's Words and Story Bible tabs both draw: name, kind, and a play button where there is a
// pronunciation. No status column, and nothing about who speaks.
const meta = {
  title: 'Script/InThisChapter',
  component: InThisChapter,
  args: { label: 'In this chapter', empty: 'No Story Bible entries in this chapter.', rows: [] },
  render: (args) => (
    <div className="max-w-[22rem] bg-[var(--bg)] p-3">
      <InThisChapter {...args} />
    </div>
  ),
} satisfies Meta<typeof InThisChapter>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {};

export const People: Story = {
  args: {
    rows: [
      { id: 'a', name: 'Alice', kind: { label: 'Character', colour: 'character' }, detail: 'first Chapter 1', hear: true },
      { id: 'q', name: 'The Queen of Hearts', kind: { label: 'Character', colour: 'character' }, detail: 'first Chapter 8', hear: false },
      { id: 'w', name: 'Wonderland', kind: { label: 'Place', colour: 'place' }, detail: 'first Chapter 1', hear: true },
    ],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('button', { name: 'Hear Alice' })).toBeVisible();
    await expect(canvas.queryByRole('button', { name: 'Hear The Queen of Hearts' })).toBeNull();
  },
};

// A selected, selectable row; a long, emoji and right-to-left name.
export const SelectedAndLongNames: Story = {
  args: {
    rows: [
      { id: 'a', name: 'Alice', hear: true, selected: true, onActivate: fn() },
      {
        id: 'l',
        name: 'The Lord High Chamberlain of the Duchy of Very Long Names and Titles 👑',
        kind: { label: 'Character', colour: 'character' },
        hear: true,
      },
      { id: 'r', name: 'أليس في بلاد العجائب', hear: false },
    ],
  },
  play: async ({ canvasElement, args }) => {
    await userEvent.click(within(canvasElement).getByText('Alice'));
    await expect(args.rows[0]?.onActivate).toHaveBeenCalled();
  },
};
