import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, waitFor, within } from 'storybook/test';
import { ApiProvider } from '../../../api/ApiContext';
import { createMockApi } from '../../../api/mockApi';
import { PortOverrides } from '../../../ports/usePort';
import { Dialog } from '../../primitives/Dialog';
import { screen } from '../../primitives/portalScreen';
import { stackPlanOf } from '../model/stacking';
import { RetryBar } from './RetryBar';
import { StackDialog, stackTitle, type StackDirection } from './StackDialog';
import { chapterLines, fakeStackLog } from './stackFixtures';
import { planStack, type StackActing } from './stackPlan';
import { stepsCaps, recorderCaps } from './stackFixtures';
import { DAW_SETUPS } from '../../../fixtures/daw';

const lines = chapterLines();
const byId = new Map(lines.map((l) => [l.id, l]));

/** The question as the overlay draws it: the Dialog primitive with the dialog's own body and buttons. */
function Question({ how, direction = 'stack' }: { how: StackActing; direction?: StackDirection }) {
  const plan = stackPlanOf(
    lines.filter((l) => l.takes.length > 1),
    'stack',
  );
  return (
    <Dialog title={stackTitle(direction)} onClose={fn()} actions={null}>
      <StackDialog direction={direction} plan={plan} lines={byId} how={how} onCancel={fn()} onConfirm={fn()} />
    </Dialog>
  );
}

/** The bar over the Editing records port, with the chapter's choice as given. */
function Bar({ mode, reason }: { mode: 'stack' | 'leave'; reason?: string }) {
  const log = fakeStackLog();
  log.modes.set('c:chapter-1', mode);
  return (
    <ApiProvider api={Object.assign(createMockApi(), log)}>
      <PortOverrides clients={{}}>
        <div className="max-w-[760px] bg-[var(--surface)] p-4 text-[var(--text)]">
          <RetryBar level="chapter" chapterId="chapter-1" count={3} reason={reason} onStack={fn()} />
        </div>
      </PortOverrides>
    </ApiProvider>
  );
}

const meta = { title: 'Editing/Stack', parameters: { layout: 'fullscreen' } } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

const acting = (caps: Parameters<typeof planStack>[0]): StackActing => planStack(caps) as StackActing;

// REAPER stacks as one action: the plan first, then one undo step. Cancel has the focus.
export const Reaper: Story = {
  render: () => <Question how={acting(DAW_SETUPS.reaper)} />,
  play: async () => {
    const dialog = await screen.findByRole('dialog', { name: 'Stack retries as takes' });
    await expect(within(dialog).getByText(/one undo step/)).toBeTruthy();
    await expect(document.activeElement).toBe(within(dialog).getByRole('button', { name: 'Cancel' }));
  },
};

// Audacity with backups lists its five edits and the backup taken first.
export const AudacityWithBackups: Story = {
  render: () => <Question how={acting(stepsCaps(true))} />,
  play: async () => {
    const dialog = await screen.findByRole('dialog', { name: 'Stack retries as takes' });
    await expect(within(dialog).getAllByRole('listitem')).toHaveLength(5);
    await expect(within(dialog).getByText(/Backup first/)).toBeTruthy();
  },
};

// The recorder: the app makes the change itself and no DAW is asked.
export const Recorder: Story = {
  render: () => <Question how={acting(recorderCaps())} />,
};

// Un-stack names the positions the takes go back to.
export const Unstack: Story = {
  render: () => <Question how={acting(DAW_SETUPS.reaper)} direction="unstack" />,
};

// Refused: Audacity without backups cannot stack, so no dialog opens; the bar shows the capability's reason on the control.
export const Refused: Story = {
  render: () => <Bar mode="stack" reason="Audacity keeps backups only when you turn them on." />,
  play: async ({ canvasElement }) => {
    await waitFor(() => expect(within(canvasElement).getByLabelText('Audacity keeps backups only when you turn them on.')).toBeTruthy());
  },
};

// Stack: the count and the one action show (ADR 0858, DQ-7).
export const RetryBarStack: Story = {
  render: () => <Bar mode="stack" />,
  play: async ({ canvasElement }) => {
    await waitFor(() => expect(within(canvasElement).getByText('3 retries can be stacked')).toBeTruthy());
  },
};

// Leave: neither the count nor the action.
export const RetryBarLeave: Story = {
  render: () => <Bar mode="leave" />,
  play: async ({ canvasElement }) => {
    await waitFor(() => expect(within(canvasElement).getByRole('button', { name: 'Leave' }).getAttribute('aria-pressed')).toBe('true'));
    await expect(within(canvasElement).queryByText(/can be stacked/)).toBeNull();
  },
};
