import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import { ThreadsPanel } from './ThreadsPanel';
import { lineOf, NO_ACTIONS, NOTE, OPEN_QUERY, RESOLVED_QUERY, TYPES } from './threadFixtures';

// The Notes tab (the mock's `pages/script/ThreadsTab.tsx`): a card per mark, every mark being a thread on a passage.
const meta = {
  title: 'Script/ThreadsPanel',
  component: ThreadsPanel,
  args: {
    marks: [NOTE],
    types: TYPES,
    selectedId: null,
    editing: null,
    lineOf,
    actions: NO_ACTIONS,
  },
  render: (args) => (
    <div className="max-w-[22rem] bg-[var(--bg)] p-3">
      <ThreadsPanel {...args} />
    </div>
  ),
} satisfies Meta<typeof ThreadsPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Note: Story = {};
export const NoteSelected: Story = { args: { selectedId: NOTE.id } };
export const AskingMarkWithThread: Story = { args: { marks: [NOTE, OPEN_QUERY, RESOLVED_QUERY] } };
export const AskingMarkSelected: Story = { args: { marks: [OPEN_QUERY, RESOLVED_QUERY], selectedId: RESOLVED_QUERY.id } };
export const EditingAMessage: Story = { args: { marks: [OPEN_QUERY], editing: `${OPEN_QUERY.id}:0` } };
export const EmptyNotes: Story = { args: { marks: [] } };
// Reopen is the resolved mark's only way back; it goes out through the actions.
export const ReopenResolved: Story = {
  args: { marks: [RESOLVED_QUERY], actions: { ...NO_ACTIONS, onReopen: fn() } },
  play: async ({ canvasElement, args }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Reopen' }));
    await expect(args.actions.onReopen).toHaveBeenCalledWith(RESOLVED_QUERY.id);
  },
};
