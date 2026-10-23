import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import { VOICE_SAMPLE_SENTENCES } from '../../../api/contracts/voiceSamples';
import { VoiceSampleDialog } from './VoiceSampleDialog';

// The Voice sample dialog of the approved mock (docs/research/mockups/voice-samples/), from props only: the hook that fills it
// (useVoiceSample) has its own tests. Each story is a state of the PRD's States table.
const CHOICES = [
  { id: 'e-queen', name: 'The Queen of Hearts', group: 'In this chapter' as const },
  { id: 'e-alice', name: 'Alice', group: 'In this chapter' as const },
  { id: 'e-hatter', name: 'The Hatter', group: 'All characters' as const },
  { id: 'narration', name: 'Narration' },
];

type Saved = { ok: true } | { ok: false; message: string };
const saves = async (): Promise<Saved> => ({ ok: true });
const refuses = (message: string) => async (): Promise<Saved> => ({ ok: false, message });

const meta = {
  title: 'Editing/VoiceSampleDialog',
  component: VoiceSampleDialog,
  args: {
    words: 'Off with his head! Off with it at once, I say',
    seconds: 6.8,
    audition: { sourceFile: 'chapter-3.wav', start: 63.2, end: 70, mediaUrl: (file: string) => `/media?path=${file}` },
    choices: CHOICES,
    counts: { 'e-queen': 2, 'e-alice': 5 },
    limit: 20,
    initialCharacterId: 'e-queen',
    onSave: fn(saves),
    onCancel: fn(),
  },
  decorators: [
    (Story) => (
      <div className="w-[min(30rem,100%)] bg-[var(--surface)] p-4">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof VoiceSampleDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

// Ready to save: the speaker of the first word is chosen, the count says where the character stands, and Enter or Save sample saves.
export const ReadyToSave: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('combobox', { name: 'Character' })).toHaveValue('e-queen');
    await expect(canvas.getByText('2 of 20 samples')).toBeInTheDocument();
    await userEvent.type(canvas.getByRole('textbox', { name: /Label/ }), 'Furious, to the court');
    await userEvent.click(canvas.getByRole('button', { name: 'Save sample' }));
    await expect(args.onSave).toHaveBeenCalledWith({ characterId: 'e-queen', label: 'Furious, to the court', note: '', makePrimary: false });
  },
};

// A character with no sample yet: Make primary is on.
export const FirstSampleOfACharacter: Story = {
  args: { initialCharacterId: 'e-hatter' },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('checkbox', { name: 'Make primary for The Hatter' })).toBeChecked();
  },
};

// 19 of 20 still saves; 20 says so and Save sample is off.
export const AtTheLimit: Story = {
  args: { counts: { 'e-queen': 20 } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('The Queen of Hearts has 20 samples. Delete one first.')).toBeInTheDocument();
    await expect(canvas.getByRole('button', { name: 'Save sample' })).toBeDisabled();
  },
};

// The words cannot be a sample: the page says why before asking, and Save sample stays off. Play range has nothing to play.
export const Refused: Story = {
  args: { words: 'and the whole court fell silent. Nobody moved.', seconds: undefined, audition: undefined, refusal: VOICE_SAMPLE_SENTENCES.spans_takes },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('alert')).toHaveTextContent('Choose words inside one take.');
    await expect(canvas.getByRole('button', { name: 'Save sample' })).toBeDisabled();
    await expect(canvas.getByRole('button', { name: 'Play range' })).toHaveAttribute('aria-disabled', 'true');
  },
};

// The host refused when Save sample was pressed: its sentence stays in the dialog, and Save sample can be pressed again.
export const RefusedByTheHost: Story = {
  args: { onSave: fn(refuses(VOICE_SAMPLE_SENTENCES.spans_cut)) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Save sample' }));
    await expect(await canvas.findByRole('alert')).toHaveTextContent(VOICE_SAMPLE_SENTENCES.spans_cut);
    await expect(canvas.getByRole('button', { name: 'Save sample' })).toBeEnabled();
  },
};

// A read that failed while the dialog opened is a note; the dialog still works and Narration is always there.
export const WithANoticeAndOnlyNarration: Story = {
  args: {
    choices: [{ id: 'narration', name: 'Narration' }],
    counts: {},
    initialCharacterId: 'narration',
    notice: "Couldn't read the Story Bible's characters, so the list may be incomplete.",
  },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('status')).toHaveTextContent("Couldn't read the Story Bible's characters");
  },
};

// Right-to-left words, an emoji in a name and a long character name stay in one column.
export const RightToLeftAndLongNames: Story = {
  args: {
    words: 'שלום 🦎 اليوم, أيها الملك',
    choices: [
      { id: 'long', name: 'The Right Honourable Lizard of the Eastern Marches and Keeper of the Great Seal 🦎', group: 'In this chapter' as const },
      ...CHOICES,
    ],
    initialCharacterId: 'long',
    counts: {},
  },
};
