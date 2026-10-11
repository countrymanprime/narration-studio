import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, within } from 'storybook/test';
import { recommendation, signal } from './readinessFixtures';
import { ReadinessChip } from './ReadinessChip';

const confirmation = { from: 'recording', target: 'editing', basisKey: 'basis-a', at: '2026-09-21T10:00:00Z', evidenceChanged: false } as const;

const meta = {
  title: 'Production/ReadinessChip',
  component: ReadinessChip,
  args: { recommendation: recommendation(), onOpen: fn() },
} satisfies Meta<typeof ReadinessChip>;

export default meta;
type Story = StoryObj<typeof meta>;

// The mock's `rchip`: one chip per verdict, named "Stage readiness: <verdict>, <stage>", opening a dialog and never the stage page.
export const Ready: Story = {
  play: async ({ canvasElement, args }) => {
    const chip = within(canvasElement).getByRole('button', { name: 'Stage readiness: Ready, Recording' });
    await expect(chip.getAttribute('aria-haspopup')).toBe('dialog');
    chip.click();
    await expect(args.onOpen).toHaveBeenCalledTimes(1);
  },
};
export const NotReady: Story = { args: { recommendation: recommendation({ verdict: 'not_ready', signals: [signal('recording.text_present', 'not_met')] }) } };
export const NotChecked: Story = { args: { recommendation: recommendation({ verdict: 'unknown', causes: ['never_analyzed'] }) } };
export const InProgress: Story = { args: { recommendation: recommendation({ verdict: 'unknown', causes: ['analysis_running'] }) } };
export const EvidenceChanged: Story = {
  args: {
    recommendation: recommendation({
      verdict: 'none',
      confirmation,
      contradiction: { revertTo: 'recording', signals: [signal('recording.text_present', 'not_met')] },
    }),
  },
};
export const Confirmed: Story = {
  args: { recommendation: recommendation({ verdict: 'none', confirmation, basisKey: undefined, target: undefined, signals: [] }) },
};
