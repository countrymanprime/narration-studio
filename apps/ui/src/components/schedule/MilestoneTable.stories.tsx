import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, within } from 'storybook/test';
import { Panel } from '../primitives/Panel';
import { MilestoneTable } from './MilestoneTable';
import { STORY_CHAPTERS, STORY_MILESTONES, STORY_TODAY } from './scheduleFixtures';

const meta = {
  title: 'Schedule/MilestoneTable',
  component: MilestoneTable,
  args: {
    milestones: STORY_MILESTONES,
    chapters: STORY_CHAPTERS,
    today: STORY_TODAY,
    due: '2026-10-31',
    onToggleDone: fn(),
    onEdit: fn(),
    onRemove: fn(),
    onDueChange: fn(),
  },
  // The table sits in the Milestones panel, so its contrast is measured on the panel's surface.
  render: (args) => (
    <Panel title="Milestones" flush>
      <MilestoneTable {...args} />
    </Panel>
  ),
} satisfies Meta<typeof MilestoneTable>;

export default meta;
type Story = StoryObj<typeof meta>;

// The mock's Schedule table: read-only rows, the measure written as its value, a status cell that says late, at risk, on track, done or
// not estimated in words as well as colour, and a done toggle that carries `aria-pressed`.
export const LateAtRiskAndDone: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('img', { name: 'Done' })).toBeTruthy();
    await expect(canvas.getByRole('img', { name: /^Late by \d+ d/ })).toBeTruthy();
    await expect(canvas.getByRole('img', { name: 'Not estimated' })).toBeTruthy();
    await expect(canvas.getByRole('button', { name: 'Mark Contract signed complete' }).getAttribute('aria-pressed')).toBe('true');
    canvas.getByRole('button', { name: 'Mark All recorded complete' }).click();
    await expect(args.onToggleDone).toHaveBeenCalledTimes(1);
  },
};

export const Empty: Story = { args: { milestones: [] } };
export const NoDueDate: Story = { args: { due: null } };
