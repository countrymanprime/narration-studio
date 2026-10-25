import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import type { VoiceSample } from '../../../api/contracts/voiceSamples';
import { PASSAGE_MOVED_NOTICE, VoiceSampleRow } from './VoiceSampleRow';

// One row of the Story Bible's Voice samples (the approved mock's "Character entry", docs/research/mockups/voice-samples/), from props only: the section
// that reads the host and draws the list has its own tests. Each story is a state of the PRD's States table.
const SAMPLE: VoiceSample = {
  id: 'a'.repeat(32),
  characterId: 'queen-of-hearts',
  label: 'Furious, to the court',
  note: 'Pitch up, clipped, no breaths.',
  primary: true,
  createdAt: '2026-10-18T09:30:00Z',
  durationMs: 7400,
  bytes: 1_331_280,
  clipState: 'ok',
  source: { chapterId: 'chapter-8', chapterTitle: 'Chapter 8', text: 'Off with his head!', startKey: 'p-4:0', endKey: 'p-4:3', state: 'ok' },
};

const meta = {
  title: 'Story Bible/VoiceSampleRow',
  component: VoiceSampleRow,
  args: {
    sample: SAMPLE,
    characterName: 'The Queen of Hearts',
    status: 'idle',
    progress: 0,
    canManage: false,
    onPlay: fn(),
    onStop: fn(),
    onRename: fn(),
    onMakePrimary: fn(),
    onMove: fn(),
    onDelete: fn(),
    onOpenEditing: fn(),
    onNotice: fn(),
  },
  decorators: [
    (Story) => (
      <ul className="m-0 w-[min(40rem,100%)] list-none bg-[var(--bg)] p-4">
        <Story />
      </ul>
    ),
  ],
} satisfies Meta<typeof VoiceSampleRow>;

export default meta;
type Story = StoryObj<typeof meta>;

// The primary: a star, its length, where it came from with a way into Editing, and the note.
export const Primary: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Primary')).toBeInTheDocument();
    await expect(canvas.getByText('0:07')).toBeInTheDocument();
    await userEvent.click(canvas.getByRole('button', { name: 'Play voice sample: Furious, to the court, 7.4 seconds' }));
    await expect(args.onPlay).toHaveBeenCalledTimes(1);
    await userEvent.click(canvas.getByRole('button', { name: 'Open in Editing' }));
    await expect(args.onOpenEditing).toHaveBeenCalledTimes(1);
    await expect(args.onNotice).not.toHaveBeenCalled();
  },
};

// While it plays: Stop, the real progress and a Playing badge.
export const Playing: Story = {
  args: { status: 'playing', progress: 0.4, sample: { ...SAMPLE, primary: false, label: 'Sulking', note: '' } },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('progressbar', { name: 'Voice sample: Sulking' })).toHaveAttribute('aria-valuenow', '40');
    await userEvent.click(canvas.getByRole('button', { name: 'Stop' }));
    await expect(args.onStop).toHaveBeenCalledTimes(1);
  },
};

// The words changed since the sample was marked: it still plays, and the way into Editing says the words may have moved.
export const PassageChanged: Story = {
  args: { sample: { ...SAMPLE, primary: false, label: 'Whispering', source: { ...SAMPLE.source, state: 'text_changed' } } },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Passage changed')).toBeInTheDocument();
    await userEvent.click(canvas.getByRole('button', { name: 'Open in Editing' }));
    await expect(args.onNotice).toHaveBeenCalledWith(PASSAGE_MOVED_NOTICE);
  },
};

// The chapter left the manuscript: the sample plays, and there is nowhere to open.
export const ChapterRemoved: Story = {
  args: { sample: { ...SAMPLE, primary: false, source: { ...SAMPLE.source, chapterTitle: '', state: 'chapter_missing' } } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Chapter removed')).toBeInTheDocument();
    await expect(canvas.queryByRole('button', { name: 'Open in Editing' })).toBeNull();
  },
};

// The clip file is missing: it cannot play, the card is red, and a read-only entry sends the narrator to Voice data to delete it (a locked entry has no Edit).
export const AudioFileMissing: Story = {
  args: { sample: { ...SAMPLE, primary: false, label: 'Laughing', note: '', clipState: 'missing' } },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Audio file missing')).toBeInTheDocument();
    await expect(canvas.getByText(/or delete it in Voice data/)).toBeInTheDocument();
    await userEvent.click(canvas.getByRole('button', { name: /^Play voice sample: Laughing/ }));
    await expect(args.onPlay).not.toHaveBeenCalled();
  },
};

// The same on an entry being edited: Delete is the narrator's to do.
export const AudioFileMissingWhileEditing: Story = {
  args: { ...AudioFileMissing.args, canManage: true },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText(/or delete it\./)).toBeInTheDocument();
  },
};

// A clip that is not the file that was saved.
export const AudioFileChanged: Story = {
  args: { sample: { ...SAMPLE, primary: false, label: 'Shouting', note: '', clipState: 'hash_changed' } },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText('Audio file changed')).toBeInTheDocument();
  },
};

// A long label with emoji and a right-to-left note: the label is cut with the whole text in the hint, each is given in its own direction.
export const LongRightToLeftAndEmoji: Story = {
  args: {
    sample: {
      ...SAMPLE,
      label: `${'🦎'.repeat(15)} ${'غاضبة، تخاطب المحكمة '.repeat(1)}and a very long way of saying it`,
      note: 'غاضبة، تخاطب المحكمة بصوت عال',
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('غاضبة، تخاطب المحكمة بصوت عال')).toHaveAttribute('dir', 'auto');
  },
};

// The menu of a read-only entry: Rename and Make primary, never Move or Delete.
export const MenuReadOnly: Story = {
  args: { sample: { ...SAMPLE, primary: false } },
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'More about Furious, to the court' }));
    const items = await within(document.body).findAllByRole('menuitem');
    await expect(items.map((item) => item.textContent)).toEqual(['Rename…', 'Make primary']);
    await userEvent.keyboard('{Escape}');
  },
};

// The menu of an entry being edited adds Move and Delete.
export const MenuWhileEditing: Story = {
  args: { sample: { ...SAMPLE, primary: false }, canManage: true },
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'More about Furious, to the court' }));
    const items = await within(document.body).findAllByRole('menuitem');
    await expect(items.map((item) => item.textContent)).toEqual(['Rename…', 'Make primary', 'Move to a character…', 'Delete…']);
    await userEvent.keyboard('{Escape}');
  },
};
