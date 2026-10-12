import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import { buildLayerIndex, paragraphLayers, type LayerSources } from './layers';
import { Para } from './Para';
import { cue, entry, flaggedWord, mark, paragraph, TYPES } from './readerFixtures';

// The Studio Next mock's paragraph (`pages/script/Para.tsx`): the paragraph's own text with marks, flagged words, Story Bible names,
// speaker chips and Find matches drawn over it. The text never changes; each layer only wraps part of it.
const TEXT = 'Mina said, "Come along," and left the harbour. Wren asked, "Where to?" Nobody answered the third voice, "Not yet."';
const at = (needle: string) => ({ start: TEXT.indexOf(needle), end: TEXT.indexOf(needle) + needle.length });
const para = paragraph('p1', 'c1', TEXT);
const empty: LayerSources = { marks: [], markTypes: TYPES, words: [], entries: [], cues: [] };
const layers = (sources: Partial<LayerSources>) => paragraphLayers(buildLayerIndex({ ...empty, ...sources }), para);

const people = [entry('e1', 'Mina', 'Character', 4), entry('e2', 'Wren', 'Character'), entry('e3', 'harbour', 'Place')];

const meta = {
  title: 'Script/Reader/Para',
  component: Para,
  args: { paragraph: para, layers: [], onPickSpeaker: fn() },
  render: (args) => (
    <div className="max-w-2xl bg-[var(--surface)] p-6 text-[var(--text)]" style={{ fontFamily: 'Georgia, serif', fontSize: 18, lineHeight: 1.7 }}>
      <Para {...args} />
    </div>
  ),
} satisfies Meta<typeof Para>;

export default meta;
type Story = StoryObj<typeof meta>;

export const PlainText: Story = {};

// One mark of each of the six colours and six line styles of the mock, each from its mark type.
export const MarksOfEachStyle: Story = {
  args: {
    layers: layers({
      marks: [
        mark('m1', 'p1', at('Mina'), 'note'),
        mark('m2', 'p1', at('said'), 'ask'),
        mark('m3', 'p1', at('Come'), 'stress'),
        mark('m4', 'p1', at('along'), 'pause'),
        mark('m5', 'p1', at('left'), 'breath'),
        mark('m6', 'p1', at('harbour'), 'redo'),
      ],
    }),
  },
};

export const OverlappingMarks: Story = {
  args: { layers: layers({ marks: [mark('long', 'p1', at('said, "Come along,"'), 'note'), mark('short', 'p1', at('Come'), 'stress')] }) },
};

export const FlaggedWords: Story = {
  args: { layers: layers({ words: [flaggedWord('harbour', 'p1', at('harbour')), flaggedWord('wren', 'p1', at('Wren'), 'set')] }) },
};

export const NameMentions: Story = { args: { layers: layers({ entries: people }) } };

export const SpeakerChips: Story = {
  args: {
    layers: layers({
      entries: people,
      cues: [
        cue('q1', 'p1', 'c1', at('"Come along,"'), 'e1', 'correction'),
        cue('q2', 'p1', 'c1', at('"Where to?"'), 'e2', 'tag'),
        cue('q3', 'p1', 'c1', at('"Not yet."'), null, 'unknown'),
      ],
    }),
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('button', { name: 'Speaker: Mina, confirmed. Change speaker' })).toBeTruthy();
    await expect(canvas.getByRole('button', { name: 'Speaker: Wren, suggested. Change speaker' })).toBeTruthy();
    await userEvent.click(canvas.getByRole('button', { name: 'Speaker: speaker unknown. Change speaker' }));
    await expect(args.onPickSpeaker).toHaveBeenCalledWith('q3', expect.anything());
  },
};

export const FindMatches: Story = { args: { find: [at('along'), at('left'), at('answered')], findCurrent: 1 } };

// Everything at once: the text stays the paragraph's own.
export const AllLayers: Story = {
  args: {
    layers: layers({
      entries: people,
      marks: [mark('m1', 'p1', at('said, "Come'), 'note')],
      words: [flaggedWord('harbour', 'p1', at('harbour'))],
      cues: [cue('q1', 'p1', 'c1', at('"Come along,"'), 'e1', 'correction')],
    }),
    find: [at('along')],
    findCurrent: 0,
  },
};
