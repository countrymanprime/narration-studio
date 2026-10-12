import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, within } from 'storybook/test';
import { ConfirmDialog } from '../../../primitives/ConfirmDialog';
import { screen } from '../../../primitives/portalScreen';
import { TakeLines } from '../TakeLines';
import { registerTakeControl } from '../takeControls';
import { measuredPassage, unevenPassage } from '../takeFixtures';
import type { LinePassage } from '../types';
import { HideOthersConfirmBody } from './HideOthersConfirm';
import { PrepConfirmBody } from './PrepConfirm';
import { HideButton, PrepStatus, PrepStepButton, PrepStepDone } from './PrepControls';
import { longPausePassage } from './prepFixtures';
import { STEP_TEXT } from './prepSteps';

const none = () => {};

function Confirm({ title, label, body }: { title: string; label: string; body: React.ReactNode }) {
  return <ConfirmDialog title={title} body={body} confirmLabel={label} confirm={fn()} cancel={fn()} />;
}

/** The takes of a line with its footer: the controls the story registered before the first render. */
function Frame({ passage, narrow = false, kept = null }: { passage: LinePassage; narrow?: boolean; kept?: string | null }) {
  return (
    <div className={`bg-[var(--surface)] p-4 text-[var(--text)] ${narrow ? 'max-w-[360px]' : 'max-w-[760px]'}`}>
      <TakeLines passage={passage} onTake={null} keptId={kept} playingId={null} gate={{ ok: true }} onKeep={none} onPlay={none} />
    </div>
  );
}

const REASON = 'Audacity cannot cut words and audio yet.';

/** Registers static controls in the footer, before the story renders (a passive effect's re-render would come after play() in the browser). */
const footer =
  (...controls: Array<{ id: string; node: React.ReactNode }>) =>
  () => {
    const offs = controls.map((c, i) => registerTakeControl({ id: c.id, order: 10 + i, render: () => c.node }));
    return () => offs.forEach((off) => off());
  };

const meta = { title: 'Editing/Takes/Prep', parameters: { layout: 'padded' } } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

// Hide the other takes asks first: which take stays, that the rest are muted and not deleted, and the one undo step.
export const ConfirmHideOthers: Story = {
  render: () => <Confirm title="Hide the other takes?" label="Hide takes" body={<HideOthersConfirmBody keptLabel="T-8" count={2} dawName="REAPER" />} />,
  play: async () => {
    await expect(await screen.findByText(/muted, not deleted/)).toBeTruthy();
    await expect(screen.getByRole('button', { name: 'Hide takes' })).toBeTruthy();
  },
};

// A trim says what is cut, where the audio goes and how many undo steps it takes in the DAW.
export const ConfirmTrimWhiteSpace: Story = {
  render: () => <Confirm title="Trim white space?" label="Trim white space" body={<PrepConfirmBody step="trim-silence" dawName="REAPER" cuts={3} />} />,
  play: async () => {
    await expect(await screen.findByText(/muted Cuts track/)).toBeTruthy();
    await expect(screen.getByText(/3 undo steps, one per cut/)).toBeTruthy();
  },
};

export const ConfirmTrimBreaths: Story = {
  render: () => <Confirm title="Trim breaths?" label="Trim breaths" body={<PrepConfirmBody step="trim-breaths" dawName="REAPER" cuts={1} />} />,
  play: async () => {
    await expect(await screen.findByText(/one undo step/)).toBeTruthy();
  },
};

// Normalise is the item-gain path: it names the items and the level.
export const ConfirmNormalise: Story = {
  render: () => <Confirm title="Normalise?" label="Normalise" body={<PrepConfirmBody step="normalise" dawName="REAPER" items={4} />} />,
  play: async () => {
    await expect(await screen.findByText(/4 items on this chapter/)).toBeTruthy();
  },
};

// Steps the suggestion would be surer for are offered; none has run.
export const FooterStepsNeeded: Story = {
  beforeEach: footer(
    { id: 'prep-trim-silence', node: <PrepStepButton id="trim-silence" label={STEP_TEXT['trim-silence'].label} onRun={none} /> },
    { id: 'prep-trim-breaths', node: <PrepStepButton id="trim-breaths" label={STEP_TEXT['trim-breaths'].label} onRun={none} /> },
  ),
  render: () => <Frame passage={longPausePassage()} />,
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('button', { name: 'Trim white space' })).toBeEnabled();
    await expect(within(canvasElement).getByRole('button', { name: 'Trim breaths' })).toBeEnabled();
  },
};

// A step that ran shows as done; the figures are being measured again.
export const FooterDoneAndUpdating: Story = {
  beforeEach: footer(
    { id: 'prep-trim-silence', node: <PrepStepDone id="trim-silence" label={STEP_TEXT['trim-silence'].label} /> },
    { id: 'prep-status', node: <PrepStatus state="updating" /> },
  ),
  render: () => <Frame passage={measuredPassage()} narrow />,
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText('Trim white space: done')).toBeTruthy();
    await expect(within(canvasElement).getByRole('status').textContent).toMatch(/Updating the figures/);
  },
};

// The DAW cannot do the step: the control is off and the DAW's own sentence is its reason.
export const FooterStepDisabled: Story = {
  beforeEach: footer({ id: 'prep-normalise', node: <PrepStepButton id="normalise" label={STEP_TEXT.normalise.label} reason={REASON} onRun={none} /> }),
  render: () => <Frame passage={unevenPassage()} />,
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('button', { name: 'Normalise' })).toBeDisabled();
    await expect(within(canvasElement).getByRole('group', { name: REASON })).toBeTruthy();
  },
};

// The figures could not be measured again, so none are shown as current.
export const FooterFiguresStale: Story = {
  beforeEach: footer({ id: 'prep-status', node: <PrepStatus state="stale" /> }),
  render: () => <Frame passage={measuredPassage()} narrow />,
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('status').textContent).toMatch(/could not be measured again/);
  },
};

// Hide the other takes is off until one is kept; then it is offered, and with them hidden the narrator can look at them again.
export const FooterHide: Story = {
  beforeEach: footer(
    { id: 'hide-others', node: <HideButton id="a" label="Hide the other 2 takes" reason="Keep a take first." onPress={none} /> },
    { id: 'look-at-hidden', node: <HideButton id="b" label="Look at 2 hidden takes" onPress={none} /> },
  ),
  render: () => <Frame passage={measuredPassage()} />,
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('button', { name: 'Hide the other 2 takes' })).toBeDisabled();
    await expect(within(canvasElement).getByRole('button', { name: 'Look at 2 hidden takes' })).toBeEnabled();
  },
};
