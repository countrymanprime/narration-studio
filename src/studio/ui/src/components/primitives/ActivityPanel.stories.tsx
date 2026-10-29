import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import { ActivityPanel } from './ActivityPanel';

const figures = [
  {
    key: 'chunks',
    icon: 'chunksTranscribed' as const,
    label: 'Chunks',
    value: '40 of 112',
    hint: 'Pieces of audio transcribed; a short recording is one piece.',
  },
  { key: 'workers', icon: 'transcriptionsAtOnce' as const, label: 'Workers', value: '3 of 4 busy', hint: 'Automatic runs 4 at once on this computer.' },
  {
    key: 'recheck',
    icon: 'largerModelRecheck' as const,
    label: 'Re-check',
    value: '3 of 7+',
    hint: 'large-v3-turbo re-checks passages the first model was unsure of.',
  },
];

const meta = {
  title: 'Primitives/ActivityPanel',
  component: ActivityPanel,
  args: { label: 'Check activity', percent: 42, running: true, phase: 'First pass', detail: 'small → large-v3-turbo', time: '2:41', figures },
  decorators: [
    (Story) => (
      <div className="max-w-xl p-4">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ActivityPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Running: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('progressbar', { name: 'Overall progress' })).toBeTruthy();
    await expect(canvas.getByLabelText(/^Workers: 3 of 4 busy\./)).toBeTruthy();
  },
};
export const NothingReportedYet: Story = {
  args: {
    percent: 0,
    phase: 'Starting',
    detail: undefined,
    time: '0:00',
    figures: figures.map((figure) => ({ ...figure, value: '–', hint: 'The check has not reported yet.' })),
  },
};
export const Done: Story = { args: { percent: 100, running: false, phase: 'Done', phaseTone: 'success' } };
export const LongValues: Story = {
  args: {
    figures: figures.map((figure) => ({ ...figure, value: '1,234,567 of 9,999,999 busy and then some more' })),
    detail: 'a-very-long-model-name → another-very-long-model-name',
  },
};
