import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, within } from 'storybook/test';
import type { MarkType } from '../../../api/contracts/marks';
import { MarksView } from './MarksPanel';

// The host's default mark types; the second set has one that asks, whose pill says it tracks a reply.
const DEFAULT_TYPES: MarkType[] = [
  { key: 'pickup', name: 'Pickup', colour: 'warn', style: 'highlight', asks: false },
  { key: 'pronunciation', name: 'Pronunciation', colour: 'info', style: 'underline', asks: false },
  { key: 'note', name: 'Note', colour: 'copper', style: 'dotted', asks: false },
];
const WITH_REPLY: MarkType[] = [...DEFAULT_TYPES, { key: 'query', name: 'Query', colour: 'violet', style: 'wavy', asks: true }];

const meta = {
  title: 'Settings/Page/MarksPanel',
  component: MarksView,
  args: { types: DEFAULT_TYPES, onEdit: fn() },
} satisfies Meta<typeof MarksView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const DefaultTypes: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getAllByRole('listitem')).toHaveLength(3);
    await expect(canvas.getByRole('button', { name: 'Edit marks…' })).toBeEnabled();
  },
};

export const TracksAReply: Story = {
  args: { types: WITH_REPLY },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText('Query · tracks a reply')).toBeVisible();
  },
};
