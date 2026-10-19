import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import type { VoiceSample } from '../../../api/contracts/voiceSamples';
import type { SamplePlayer } from '../../voicesamples/useSamplePlayer';
import { SampleMark } from './SampleMark';
import { sampleMarks } from './sampleMarks';
import { SampleMarksContext, SamplePlayerContext } from './sampleMarksContext';

// The dot after the last word of a marked range in Editing (the approved mock, docs/research/mockups/voice-samples/ section 1b), from props only: the
// hook that reads the host and the script that draws the words have their own tests. Each story is a state of the mock's frames; the popover opens in
// the ones that are about what it shows, because the dot alone says little.
const sample = (id: string, over: Partial<VoiceSample> & { state?: VoiceSample['source']['state'] } = {}): VoiceSample => ({
  id: id.repeat(32).slice(0, 32),
  characterId: over.characterId ?? 'queen',
  label: over.label ?? 'Furious, to the court',
  note: over.note ?? '',
  primary: over.primary ?? false,
  createdAt: '2026-10-18T09:30:00Z',
  durationMs: over.durationMs ?? 6800,
  bytes: 1_000_000,
  clipState: over.clipState ?? 'ok',
  source: { chapterId: 'c1', chapterTitle: 'Chapter 8', text: 'Off with his head', startKey: 'p-4:0', endKey: 'p-4:3', state: over.state ?? 'ok' },
});

const NAMES: Record<string, string> = { queen: 'The Queen of Hearts', alice: 'Alice' };
const idle: SamplePlayer = { status: 'idle', id: null, progress: 0, announcement: '', play: () => true, stop: () => {}, isActive: () => false };

function Stage({ samples, player = idle, onOpenStoryBible }: { samples: VoiceSample[]; player?: SamplePlayer; onOpenStoryBible?: (id: string) => void }) {
  const marks = sampleMarks({ samples, totals: { count: samples.length, bytes: 0 }, limits: {} as never }, 'c1', () => true);
  return (
    <SampleMarksContext.Provider
      value={{ marks, nameOf: (id) => (id === 'narration' ? 'Narration' : NAMES[id]), ...(onOpenStoryBible ? { onOpenStoryBible } : {}) }}
    >
      <SamplePlayerContext.Provider value={player}>
        <p className="m-0 max-w-[32rem] text-[24px] leading-[1.5] text-[var(--text)]">
          “Off with his head!” cried the Queen
          <SampleMark samples={samples} /> and the whole court fell silent.
        </p>
      </SamplePlayerContext.Provider>
    </SampleMarksContext.Provider>
  );
}

const meta = {
  title: 'Editing/SampleMark',
  component: Stage,
  args: { samples: [sample('a')], onOpenStoryBible: fn() },
  decorators: [
    (Story) => (
      <div className="min-h-[22rem] bg-[var(--surface)] p-4">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Stage>;

export default meta;
type Story = StoryObj<typeof meta>;

/** One sample: a dot in the character's colour, named for a screen reader by the character and the label. */
export const Resting: Story = {
  play: async ({ canvasElement }) => {
    const dot = within(canvasElement).getByRole('button', { name: /^Voice sample: The Queen of Hearts, Furious, to the court/ });
    await expect(dot).toBeTruthy();
  },
};

/** Opened: the character, the label and length, a play control and the way into the Story Bible. */
export const Opened: Story = {
  args: { samples: [sample('a', { primary: true, note: 'Pitch up, clipped, no breaths.' })] },
  play: async ({ canvasElement, args }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: /^Voice sample: / }));
    const popup = within(await within(document.body).findByRole('dialog', { name: /^Voice sample: / }));
    await expect(popup.getByText('Pitch up, clipped, no breaths.')).toBeTruthy();
    await userEvent.click(popup.getByRole('button', { name: 'Open in Story Bible' }));
    await expect(args.onOpenStoryBible).toHaveBeenCalledWith('queen');
  },
};

/** While it plays: Stop, the progress bar and a Playing badge. */
export const Playing: Story = {
  args: { player: { ...idle, status: 'playing', id: 'a'.repeat(32), progress: 0.4, isActive: (id: string) => id === 'a'.repeat(32) } },
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: /^Voice sample: / }));
    const popup = within(await within(document.body).findByRole('dialog', { name: /^Voice sample: / }));
    await expect(popup.getByRole('button', { name: 'Stop' })).toBeTruthy();
    await expect(popup.getByText('Playing')).toBeTruthy();
  },
};

/** The words changed since it was marked: a hollow ring, and the sample still plays. */
export const PassageChanged: Story = {
  args: { samples: [sample('a', { state: 'text_changed' })] },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('button', { name: /The words changed since it was marked/ })).toBeTruthy();
  },
};

/** The audio file is missing or changed: a dashed ring, and play is off with the reason. */
export const AudioMissing: Story = {
  args: { samples: [sample('a', { clipState: 'missing' })] },
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: /The audio file is missing/ }));
    const popup = within(await within(document.body).findByRole('dialog', { name: /^Voice sample: / }));
    await expect(popup.getByText('Audio file missing')).toBeTruthy();
    await expect(popup.getByRole('button', { name: /^Play voice sample/ }).getAttribute('aria-disabled')).toBe('true');
  },
};

/** Two samples end on this word: a numbered dot and a row for each. */
export const Several: Story = {
  args: { samples: [sample('a'), sample('b', { characterId: 'alice', label: 'Wondering', durationMs: 3100 })] },
};

/** Narration's dot is grey and has no Story Bible entry to open. */
export const Narration: Story = {
  args: { samples: [sample('a', { characterId: 'narration', label: 'Closing line' })] },
};

/** A label in any script is shown as written and truncated, not wrapped over the row. */
export const LongRightToLeftEmojiLabel: Story = {
  args: { samples: [sample('a', { label: 'مرحبا 🎭 — Cheshire, quietly, with a very long way of saying so, to nobody' })] },
};
