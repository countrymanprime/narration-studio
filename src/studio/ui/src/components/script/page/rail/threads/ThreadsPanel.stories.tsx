import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import { ThreadsPanel } from './ThreadsPanel';
import { lineOf, NO_ACTIONS, NOTE, OPEN_QUERY, RESOLVED_QUERY, TYPES } from './threadFixtures';

// The mock's Notes and Queries tabs (`pages/script/ThreadsTab.tsx`): a card per mark, a note and a query being the same thread on a passage.
const meta = {
  title: 'Script/ThreadsPanel',
  component: ThreadsPanel,
  args: {
    kind: 'notes',
    marks: [NOTE],
    types: TYPES,
    filter: 'open',
    onFilter: fn(),
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
export const OpenQueryWithThread: Story = { args: { kind: 'queries', marks: [OPEN_QUERY, RESOLVED_QUERY] } };
export const ResolvedQueries: Story = { args: { kind: 'queries', marks: [OPEN_QUERY, RESOLVED_QUERY], filter: 'resolved' } };
export const AllQueries: Story = { args: { kind: 'queries', marks: [OPEN_QUERY, RESOLVED_QUERY], filter: 'all', selectedId: RESOLVED_QUERY.id } };
export const EditingAMessage: Story = { args: { kind: 'queries', marks: [OPEN_QUERY], editing: `${OPEN_QUERY.id}:0` } };
export const EmptyNotes: Story = { args: { marks: [] } };
export const EmptyQueries: Story = { args: { kind: 'queries', marks: [] } };
// Reopen is the resolved query's only way back; it goes out through the actions.
export const ReopenResolved: Story = {
  args: { kind: 'queries', marks: [RESOLVED_QUERY], filter: 'resolved', actions: { ...NO_ACTIONS, onReopen: fn() } },
  play: async ({ canvasElement, args }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Reopen' }));
    await expect(args.actions.onReopen).toHaveBeenCalledWith(RESOLVED_QUERY.id);
  },
};
