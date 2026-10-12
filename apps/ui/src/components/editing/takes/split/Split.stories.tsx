import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, within } from 'storybook/test';
import { ConfirmDialog } from '../../../primitives/ConfirmDialog';
import { screen } from '../../../primitives/portalScreen';
import { FlagCard } from '../../flags/FlagCard';
import { registerFlagAction } from '../../flags/flagActions';
import type { ChapterDoc } from '../../model';
import { marksDoc } from '../../script/scriptFixtures';
import { SplitButton } from './SplitButton';
import { SplitConfirmBody } from './SplitConfirm';
import { target } from './splitFixtures';
import type { SplitPlan } from './splitPlan';

type Cutting = Exclude<SplitPlan, { kind: 'refused' }>;

function Confirm({ plan }: { plan: Cutting }) {
  return (
    <ConfirmDialog title="Split this take?" body={<SplitConfirmBody plan={plan} target={target} />} confirmLabel="Split take" confirm={fn()} cancel={fn()} />
  );
}

const doc: ChapterDoc = marksDoc();
doc.paras[1].items.slice(0, 2).forEach((i) => {
  i.dup = true;
});

/** The Read twice card; the story registers the split before it renders, as the page has it: all three answers are live. */
function ReadTwiceCard() {
  return (
    <div className="bg-[var(--surface)] p-3 text-[var(--text)]">
      <FlagCard doc={doc} dp={doc.paras[1]} flag="dup:p-2" hear={null} accept={fn()} onClose={fn()} />
    </div>
  );
}

const meta = { title: 'Editing/Split', parameters: { layout: 'padded' } } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

// The confirmation names the time, who cuts and how it is undone. Nothing is cut until it is accepted.
export const ConfirmDaw: Story = {
  render: () => <Confirm plan={{ kind: 'daw', dawName: 'REAPER' }} />,
  play: async () => {
    await expect(await screen.findByText(/one undo step in REAPER/)).toBeTruthy();
    await expect(screen.getByRole('button', { name: 'Split take' })).toBeTruthy();
  },
};

// A DAW that replaces audio when it cuts: the backup comes first, and the confirmation says so.
export const ConfirmWithBackup: Story = {
  render: () => <Confirm plan={{ kind: 'backup-then-daw', dawName: 'Audacity' }} />,
  play: async () => {
    await expect(await screen.findByText(/backed up first/)).toBeTruthy();
  },
};

// The built-in recorder cuts its own take; Undo is its own.
export const ConfirmRecorder: Story = {
  render: () => <Confirm plan={{ kind: 'recorder', dawName: 'the built-in recorder' }} />,
  play: async () => {
    await expect(await screen.findByText(/Undo here puts the take back whole/)).toBeTruthy();
  },
};

export const CardWithSplit: Story = {
  // Registered before the first render, not in an effect: the browser runs play() before a passive effect's re-render
  // commits, so the buttons were still “Not available yet” there (the atlas), though jsdom's act() hid it.
  beforeEach: () => {
    const offs = [registerFlagAction('stackAsTakes', fn()), registerFlagAction('deleteWords', fn())];
    return () => offs.forEach((off) => off());
  },
  render: () => <ReadTwiceCard />,
  play: async ({ canvasElement }) => {
    const note = within(canvasElement).getByRole('note');
    await expect(within(note).getByRole('button', { name: 'Stack as 2 takes' })).toBeEnabled();
    await expect(within(note).getByRole('button', { name: 'Leave in place' })).toBeEnabled();
    await expect(within(note).getByRole('button', { name: 'Delete second read…' })).toBeEnabled();
  },
};

export const ButtonReady: Story = { render: () => <SplitButton onSplit={fn()} /> };

// The DAW cannot cut now: the capability's own sentence is the button's hint.
export const ButtonRefused: Story = {
  render: () => (
    <SplitButton reason="REAPER is not answering. Check that REAPER is open and the Narration Utils action is running, then try again." onSplit={fn()} />
  ),
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('button', { name: 'Split into takes' })).toBeDisabled();
  },
};
