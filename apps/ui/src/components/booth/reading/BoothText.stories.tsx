import { useRef, useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import { BoothText } from './BoothText';
import { sampleColour, sampleDecorations, sampleNotes, sampleParagraphs, sampleSpeakers } from './fixture';
import type { ReadingPosition } from './readingPosition';
import type { BrowseView } from './useBrowseView';

// The Studio Next Booth's teleprompter text (docs/research/mockups/studio-next/src/pages/booth/Teleprompter.tsx): the sentence being
// read is lit, the ones read are dimmed, the word being read is marked, and a quoted phrase carries its speaker's chip.
function Stage(args: Parameters<typeof BoothText>[0]) {
  const [position, setPosition] = useState<ReadingPosition | undefined>(args.position);
  const [browse, setBrowse] = useState(args.browse);
  const view = useRef<BrowseView>(null);
  return (
    <div className="flex h-[32rem] flex-col bg-[var(--reading-bg)]">
      <div className="min-h-0 flex-1">
        <BoothText
          {...args}
          position={position}
          browse={browse}
          viewRef={view}
          onBrowse={(on) => {
            setBrowse(on);
            args.onBrowse(on);
          }}
          onSeek={(paragraphId, word) => {
            setPosition({ paragraphId, word });
            args.onSeek(paragraphId, word);
          }}
        />
      </div>
    </div>
  );
}

const meta = {
  title: 'Booth/BoothText',
  component: BoothText,
  args: {
    paragraphs: sampleParagraphs,
    position: { paragraphId: 'p2', word: 5 },
    browse: false,
    onBrowse: fn(),
    onSeek: fn(),
    speakers: sampleSpeakers,
    speakerColour: sampleColour,
    onSetSpeaker: fn(),
    decorations: sampleDecorations,
    notes: sampleNotes,
    size: 32,
  },
  render: (args) => <Stage {...args} />,
} satisfies Meta<typeof BoothText>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Reading: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvasElement.querySelectorAll('[data-current]')).toHaveLength(1);
    await userEvent.click(canvas.getByText('walked'));
    await expect(args.onSeek).toHaveBeenCalledWith('p3', 3);
  },
};

export const Browsing: Story = { args: { browse: true, position: { paragraphId: 'p1', word: 1 } } };

export const SuggestedSpeaker: Story = {
  args: { position: { paragraphId: 'p2', word: 0 } },
  play: async ({ canvasElement }) => {
    const chip = canvasElement.querySelector<HTMLElement>('[data-speaker-chip][data-suggested]');
    await expect(chip).not.toBeNull();
  },
};

export const NoText: Story = { args: { paragraphs: [], position: undefined, notes: [], decorations: [] } };
