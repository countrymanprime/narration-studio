import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, within } from 'storybook/test';
import type { ManuscriptParagraph } from '../../../../api/contracts/manuscript';
import { Reader } from './Reader';
import { chapter, cue, entry, flaggedWord, mark, paragraph, TYPES } from './readerFixtures';

// The Studio Next mock's continuous reader (`pages/script/Reader.tsx`): all chapters in one scroll under a sticky header that
// names the chapter in view and the paragraph. It takes its data as props; the page that assembles it reads the host.
const chapters = [chapter('c1', 0), chapter('c2', 1), chapter('c3', 2)];
const LINE = 'Mina said, "Come along," and left the harbour with the quiet of someone who had already decided.';
const at = (needle: string) => ({ start: LINE.indexOf(needle), end: LINE.indexOf(needle) + needle.length });
const body = (chapterId: string, count: number): ManuscriptParagraph[] =>
  Array.from({ length: count }, (_, i) => paragraph(`${chapterId}-p${i}`, chapterId, LINE, i));
const paragraphs: Record<string, ManuscriptParagraph[]> = { c1: body('c1', 4), c2: body('c2', 4), c3: body('c3', 4) };

const sources = {
  markTypes: TYPES,
  marks: [mark('m1', 'c1-p0', at('left'), 'note'), mark('m2', 'c1-p1', at('harbour'), 'ask')],
  words: [flaggedWord('harbour', 'c1-p0', at('harbour'))],
  entries: [entry('e1', 'Mina', 'Character', 3)],
  cues: [
    cue('q1', 'c1-p0', 'c1', at('"Come along,"'), 'e1', 'correction'),
    cue('q2', 'c1-p1', 'c1', at('"Come along,"'), 'e1', 'tag'),
    cue('q3', 'c1-p2', 'c1', at('"Come along,"'), null, 'unknown'),
  ],
};

const meta = {
  title: 'Script/Reader',
  component: Reader,
  args: {
    chapters,
    paragraphsOf: (id: string) => paragraphs[id],
    sources,
    find: { matches: [{ paragraphId: 'c1-p3', ...at('quiet') }], current: 0 },
    onPickSpeaker: fn(),
    onShowAnnotation: fn(),
    onShowEntry: fn(),
    onStepPrep: fn(),
  },
  render: (args) => (
    <div className="h-[28rem] w-full">
      <Reader {...args} />
    </div>
  ),
} satisfies Meta<typeof Reader>;

export default meta;
type Story = StoryObj<typeof meta>;

// The key state: marks, speaker chips (confirmed, suggested, unknown), a flagged word, a name and a find match in one reader.
export const MarksChipsAndAFindMatch: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('region', { name: /Script reader/ })).toBeTruthy();
    await expect(canvas.getAllByRole('heading', { level: 2 })).toHaveLength(3);
  },
};

export const WithoutLayers: Story = { args: { sources: { ...sources, marks: [], words: [], entries: [], cues: [] }, find: null } };
