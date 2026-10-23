import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, within } from 'storybook/test';
import { recommendation, signal } from './readinessFixtures';
import { ReadinessPanel } from './ReadinessPanel';

const confirmation = { from: 'recording', target: 'editing', basisKey: 'basis-a', at: '2026-09-21T10:00:00Z', evidenceChanged: true } as const;

const meta = {
  title: 'Production/ReadinessPanel',
  component: ReadinessPanel,
  // The slide-over draws on --surface, so axe measures contrast against it.
  decorators: [
    (Story) => (
      <div className="max-w-[20rem] bg-[var(--surface)] p-4">
        <Story />
      </div>
    ),
  ],
  args: { recommendation: recommendation(), phase: 'ready', error: '', isPending: () => false, busy: false, onDecide: fn(), onCheckNow: fn() },
} satisfies Meta<typeof ReadinessPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

// The mock's ReadinessPanel. The host reports no decision history, so there is no Decisions list in any state.
export const Ready: Story = {
  play: async ({ canvasElement, args }) => {
    const panel = within(canvasElement);
    await expect(panel.getByText('Ready to move to Editing')).toBeTruthy();
    (panel.getByRole('button', { name: 'Confirm' }) as HTMLButtonElement).click();
    await expect(args.onDecide).toHaveBeenCalledWith('confirm');
  },
};

export const NotReady: Story = {
  args: { recommendation: recommendation({ verdict: 'not_ready', signals: [signal('recording.text_present', 'not_met', 'Two paragraphs are missing.')] }) },
};

export const Changed: Story = {
  args: {
    recommendation: recommendation({
      verdict: 'none',
      confirmation,
      contradiction: { revertTo: 'recording', signals: [signal('recording.text_present', 'not_met', 'Two paragraphs are missing.')] },
    }),
  },
};

export const Confirmed: Story = {
  args: {
    recommendation: recommendation({
      verdict: 'none',
      confirmation: { ...confirmation, evidenceChanged: false },
      basisKey: undefined,
      target: undefined,
      signals: [],
    }),
  },
};

export const CouldNotCheck: Story = { args: { recommendation: undefined, phase: 'error', error: 'The host did not answer.' } };
