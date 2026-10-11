import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, within } from 'storybook/test';
import { MilestoneDialog } from './MilestoneDialog';
import { STORY_MILESTONES } from './scheduleFixtures';

const meta = {
  title: 'Schedule/MilestoneDialog',
  component: MilestoneDialog,
  args: { profileId: 'acx', bounds: { chapters: 12, minutes: 600 }, onSave: fn(async (): Promise<string | undefined> => undefined), onCancel: fn() },
  // A dialog draws on the surface, so axe measures contrast against it and not the page background.
  render: (args) => (
    <div className="max-w-md rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] p-4">
      <MilestoneDialog {...args} />
    </div>
  ),
} satisfies Meta<typeof MilestoneDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Add: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    canvas.getByRole('button', { name: 'Cancel' }).click();
    await expect(args.onCancel).toHaveBeenCalledTimes(1);
  },
};
export const EditWithChapterCount: Story = {
  args: { existing: { ...STORY_MILESTONES[1], measure: 'ch4', note: 'Proofer wants the sample first', done: true } },
};
// The checkpoint is a stored measure here, so it stays an option although the neutral profile does not offer it.
export const StoredMeasureTheProfileDoesNotOffer: Story = { args: { profileId: 'none', existing: STORY_MILESTONES[2] } };
export const Refused: Story = {
  args: { onSave: fn(async (): Promise<string | undefined> => 'Give the milestone a name and a date.') },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    canvas.getByRole('button', { name: 'Add milestone' }).click();
    await expect(await canvas.findByRole('alert')).toBeTruthy();
  },
};
