import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, within } from 'storybook/test';
import type { Bookmark } from '../../../api/contracts/bookmarks';
import { BoothText } from '../reading/BoothText';
import { boothUnits } from '../reading/boothUnits';
import { sampleColour, sampleParagraphs, sampleSpeakers } from '../reading/fixture';
import { BookmarkRibbons } from './BookmarkRibbons';

// The Studio Next mock's Booth ribbons (`pages/booth/Teleprompter.tsx`, `Ribbons`): a ribbon per bookmark in the margin to the right of
// the text, level with the line of its word, away from the speaker chips. A bookmark whose line changed (ADR 0820) is a warning
// shape at the head of the margin and is never put on a guessed word. The page mounts the margin inside the text column; here it sits
// beside the real Booth text.
const mark = (over: Partial<Bookmark>): Bookmark => ({
  id: 'b1',
  chapterId: 'c1',
  paragraphId: 'p1',
  paragraph: 0,
  offset: 22,
  label: '',
  note: '',
  createdAt: '2026-10-11T10:00:00Z',
  stale: false,
  ...over,
});

const THREE = [
  mark({}),
  mark({ id: 'b2', paragraphId: 'p2', paragraph: 1, offset: 29, label: 'Retake', note: 'Retake this: the Queen is too soft.' }),
  mark({ id: 'b3', paragraphId: 'p3', paragraph: 2, offset: 4, note: 'Slow down' }),
];
const STALE = mark({ id: 's1', paragraphId: 'gone', paragraph: null, offset: 12, stale: true, staleReason: 'paragraph_missing' });

const units = boothUnits(sampleParagraphs);

const meta = {
  title: 'Booth/BookmarkRibbons',
  component: BookmarkRibbons,
  args: { chapterId: 'c1', bookmarks: [], paragraphs: sampleParagraphs, units, flashId: null, onUpdate: fn(), onRemove: fn() },
  render: (args) => (
    <div className="h-[32rem] pr-10">
      <div className="relative h-full bg-[var(--reading-bg)]">
        <BoothText
          paragraphs={sampleParagraphs}
          position={{ paragraphId: 'p2', word: 5 }}
          browse={false}
          onBrowse={fn()}
          onSeek={fn()}
          speakers={sampleSpeakers}
          speakerColour={sampleColour}
          onSetSpeaker={fn()}
          size={28}
        />
        <BookmarkRibbons {...args} />
      </div>
    </div>
  ),
} satisfies Meta<typeof BookmarkRibbons>;

export default meta;
type Story = StoryObj<typeof meta>;

export const None: Story = {
  play: ({ canvasElement }) => expect(canvasElement.querySelectorAll('[data-bm]')).toHaveLength(0),
};

export const Three: Story = {
  args: { bookmarks: THREE },
  play: ({ canvasElement }) => {
    expect(within(canvasElement).getAllByRole('button', { name: /^Bookmark:/ })).toHaveLength(3);
    expect(canvasElement.querySelectorAll('[data-note-dot]')).toHaveLength(2);
  },
};

export const WithAStaleOne: Story = {
  args: { bookmarks: [STALE, ...THREE.slice(0, 2)] },
  play: ({ canvasElement }) => {
    const stale = canvasElement.querySelector('[data-stale]');
    expect(stale?.querySelector('[data-warning-shape]')).not.toBeNull();
    expect(within(canvasElement).getAllByRole('button', { name: /^Bookmark:/ })).toHaveLength(3);
  },
};

export const FlashingAfterAJump: Story = { args: { bookmarks: THREE, flashId: 'b2' } };
