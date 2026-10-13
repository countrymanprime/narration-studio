import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { Dialog } from '../../../primitives/Dialog';
import { screen } from '../../../primitives/portalScreen';
import { marksDoc } from '../../script/scriptFixtures';
import type { RangePlan } from '../common/rangePlan';
import { DeleteButton, MuteButton, RestoreButton } from './CutButtons';
import { CutDialog, cutTitle } from './CutDialog';
import { locator } from './cutFixtures';

type Acting = Exclude<RangePlan, { kind: 'refused' }>;

const doc = marksDoc();
const keys = ['p-1:3', 'p-1:4'];
const snap = (at: number) => Promise.resolve({ time: at + 0.0012, moved: 0.0012 });

/** The question as the overlay draws it: the Dialog primitive with the dialog's own body and buttons. */
function Question({ plan, mute = false }: { plan: Acting; mute?: boolean }) {
  return (
    <Dialog dismissOnOutsidePress={false} title={cutTitle(2, mute)} onClose={fn()} actions={null}>
      <CutDialog
        doc={doc}
        keys={keys}
        cuts={[]}
        mute={mute}
        plan={plan}
        chapterName="Chapter 1"
        locator={locator}
        snap={snap}
        onCancel={fn()}
        onConfirm={fn()}
      />
    </Dialog>
  );
}

const meta = { title: 'Editing/CutDialog', parameters: { layout: 'fullscreen' } } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

// Delete in REAPER: the words, the audio before and after, the snapped range, the choices and REAPER's undo step. Cancel has the focus.
export const Delete: Story = {
  render: () => <Question plan={{ kind: 'daw', dawName: 'REAPER' }} />,
  play: async () => {
    const dialog = await screen.findByRole('dialog', { name: 'Delete 2 words and their audio?' });
    await waitFor(() => expect(within(dialog).getByText(/moved 1\.2 ms to a zero crossing/)).toBeTruthy());
    await expect(document.activeElement).toBe(within(dialog).getByRole('button', { name: 'Cancel' }));
    await expect(within(dialog).getByText(/one undo step in REAPER/)).toBeTruthy();
  },
};

// A pad and room tone chosen: the audio kept at each edge shortens the range, and the gap keeps its length.
export const PadAndRoomTone: Story = {
  render: () => <Question plan={{ kind: 'daw', dawName: 'REAPER' }} />,
  play: async () => {
    const dialog = await screen.findByRole('dialog', { name: 'Delete 2 words and their audio?' });
    await waitFor(() => expect(within(dialog).getByText(/moved 1\.2 ms to a zero crossing/)).toBeTruthy());
    await userEvent.selectOptions(within(dialog).getByRole('combobox', { name: 'Keep audio at each edge of the cut' }), '100');
    await userEvent.click(within(dialog).getByRole('radio', { name: /of room tone/ }));
    await waitFor(() => expect(within(dialog).getByText(/does not move; room tone fills/)).toBeTruthy());
  },
};

// Mute: the same question worded for muting, with no choice about the gap.
export const Mute: Story = {
  render: () => <Question plan={{ kind: 'daw', dawName: 'REAPER' }} mute />,
  play: async () => {
    const dialog = await screen.findByRole('dialog', { name: 'Mute 2 words and keep their audio?' });
    await expect(within(dialog).queryByRole('radio')).toBeNull();
  },
};

// A DAW that changes the audio itself: the backup is required and the DAW's two undo steps are named.
export const Audacity: Story = {
  render: () => <Question plan={{ kind: 'backup-then-daw', dawName: 'Audacity', steps: 2 }} />,
  play: async () => {
    const dialog = await screen.findByRole('dialog');
    await expect(within(dialog).getByText('Back up the track around the cut (required)')).toBeTruthy();
  },
};

// The built-in recorder: the app makes the change itself and Undo here takes it back.
export const Recorder: Story = {
  render: () => <Question plan={{ kind: 'recorder', dawName: 'the built-in recorder' }} />,
  play: async () => {
    const dialog = await screen.findByRole('dialog');
    await expect(within(dialog).getByText(/The app makes this change itself/)).toBeTruthy();
  },
};

const OFF = 'REAPER is not answering. Check that REAPER is open and the Narration Utils action is running, then try again.';

// The DAW cannot cut now: Mute and Delete stay, disabled, with its own sentence; Restore shows on struck words.
export const Refused: Story = {
  render: () => (
    <div className="flex gap-2 bg-[var(--surface)] p-3 text-[var(--text)]">
      <MuteButton reason={OFF} onClick={fn()} />
      <DeleteButton reason={OFF} onClick={fn()} />
      <RestoreButton onClick={fn()} />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const del = within(canvasElement).getByRole('button', { name: 'Delete words and audio' });
    await expect(del.getAttribute('aria-description')).toBe(`Delete words and audio (Del) — ${OFF}`);
  },
};
