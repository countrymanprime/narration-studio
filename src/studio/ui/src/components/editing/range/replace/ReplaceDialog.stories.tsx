import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, waitFor, within } from 'storybook/test';
import type { DawResult } from '../../../../api/contracts/daw';
import type { Narrator, ReplacePlan, Replacement } from '../../../../api/contracts/replace';
import { Dialog } from '../../../primitives/Dialog';
import { screen } from '../../../primitives/portalScreen';
import { ReplaceDialog, replaceTitle, type ReplaceDialogProps } from './ReplaceDialog';
import { ReplacementMark } from './ReplacementMark';
import { ReplacementMarksContext } from './replacementMarks';

const planOk: DawResult = { ok: true, changed: false, message: '', undoSteps: 0 };
const leach: Narrator = {
  id: 'n-1',
  name: 'Eric Leach',
  addedAt: '2026-10-25T00:00:00Z',
  files: [{ id: 'f-1', name: 'Eric Leach - Chapter 1.wav', size: 1, length: 796.5, daw: 'REAPER', addedAt: '', state: 'ok' }],
};

/** A host for the dialog with the project's narrators and the plan it answers; the dialog's own Replace audio host calls, never the app's. */
function hostOf(narrators: Narrator[], plan: Partial<ReplacePlan> = {}): ReplaceDialogProps['api'] {
  return {
    replaceNarrators: async () => ({ narrators }),
    replaceNarratorAdd: async (name) => ({ narrators: [...narrators, { id: 'n-9', name, addedAt: '', files: [] }], changed: ['n-9'] }),
    replaceAddFile: async () => ({
      result: { ok: false, changed: false, message: 'Cancelled.', undoSteps: 0, refused: 'Cancelled.' },
      fileId: '',
      narrators: { narrators },
    }),
    replaceFilePeaks: async (fileId) => ({ fileId, length: 796.5, reason: 'no waveform' }),
    replacePlan: async (_c, first, last, _f, sourceStart, sourceEnd) => ({
      result: planOk,
      narrator: 'Eric Leach',
      words: last - first + 1,
      start: 12,
      end: 14.1,
      sourceStart,
      sourceEnd,
      shift: sourceEnd - sourceStart - 2.1,
      measuredLufs: -23.4,
      targetLufs: -20,
      gainDb: 3.4,
      clamped: false,
      loudnessNote: '',
      ...plan,
    }),
  };
}

/** The question as the overlay draws it: the Dialog primitive with the dialog's own body and buttons. */
function Question({ api }: { api: ReplaceDialogProps['api'] }) {
  return (
    <Dialog dismissOnOutsidePress={false} title={replaceTitle(3)} onClose={fn()} actions={null}>
      <ReplaceDialog
        api={api}
        chapterId="c-1"
        firstToken={4}
        lastToken={6}
        text="the Queen shouted."
        words={3}
        start={12}
        end={14.1}
        dawName="REAPER"
        onCancel={fn()}
        onConfirm={fn()}
      />
    </Dialog>
  );
}

const meta = { title: 'Editing/ReplaceDialog', parameters: { layout: 'fullscreen' } } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

// The first time in a project: no other narrator is named yet, so the question asks for one (#2251: the project names its co-narrators once).
export const FirstNarrator: Story = {
  render: () => <Question api={hostOf([])} />,
  play: async () => {
    const dialog = await screen.findByRole('dialog', { name: replaceTitle(3) });
    await waitFor(() => expect(within(dialog).getByText(/Name the other narrator once for this project/)).toBeTruthy());
    await expect(document.activeElement).toBe(within(dialog).getByRole('button', { name: 'Cancel' }));
  },
};

// Their file chosen and a stretch set: the host's plan with the loudness against the project's target and how far the later audio moves.
export const Planned: Story = {
  render: () => <Question api={hostOf([leach])} />,
  play: async () => {
    const dialog = await screen.findByRole('dialog', { name: replaceTitle(3) });
    await waitFor(() => expect(within(dialog).getByText(/target -20 LUFS/)).toBeTruthy());
  },
};

// The host refuses the plan (the words are already replaced): the reason is shown and Replace stays off.
export const Refused: Story = {
  render: () => (
    <Question
      api={hostOf([leach], {
        result: { ok: false, changed: false, message: '', undoSteps: 0, refused: 'Some of these words are already replaced. Put your audio back first.' },
      })}
    />
  ),
};

// Their file is gone from where it was added: the question says so and Replace stays off.
export const FileMissing: Story = {
  render: () => <Question api={hostOf([{ ...leach, files: leach.files.map((f) => ({ ...f, state: 'missing' as const })) }])} />,
};

const replacement: Replacement = {
  id: 'r-0001',
  chapterId: 'c-1',
  keys: ['p-1:4', 'p-1:5', 'p-1:6'],
  words: ['the', 'Queen', 'shouted.'],
  start: 12,
  end: 14.1,
  narratorId: 'n-1',
  narratorName: 'Eric Leach',
  fileId: 'f-1',
  sourceStart: 164.2,
  sourceEnd: 167.2,
  gainDb: 3.4,
  measuredLufs: -23.4,
  targetLufs: -20,
  fadeMs: 10,
  shift: 0.9,
  daw: 'REAPER',
  undoSteps: 1,
  at: '2026-10-25T00:00:00Z',
  restoredAt: null,
  active: true,
  paragraph: 0,
  stale: false,
};

/** The name chip after a replaced stretch, in a line of script text, current and with words changed since. */
function Marks() {
  const marks = (r: Replacement) => ({ at: new Map([['p-1:6', r]]), keysOf: new Set(r.keys), restore: fn() });
  return (
    <div className="flex flex-col gap-4 bg-[var(--surface)] p-6 font-serif text-lg">
      <p className="m-0">
        “Off with her head!” the Queen shouted.
        <ReplacementMarksContext.Provider value={marks(replacement)}>
          <ReplacementMark wordKey="p-1:6" />
        </ReplacementMarksContext.Provider>{' '}
        Nobody moved.
      </p>
      <p className="m-0">
        “Off with her head!” the Queen cried.
        <ReplacementMarksContext.Provider value={marks({ ...replacement, stale: true })}>
          <ReplacementMark wordKey="p-1:6" />
        </ReplacementMarksContext.Provider>{' '}
        Nobody moved.
      </p>
    </div>
  );
}

// The mark naming whose audio plays for the words before it (#2251), and the dashed one for a replacement whose words changed since.
export const NarratorMark: Story = { render: () => <Marks /> };
