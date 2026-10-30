import type { CSSProperties, ReactElement } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';
import { ReaderText } from './ReaderText';
import type { ReaderRow } from './readerModel';

// The Booth's speaker gutter (mock 03): each attributed paragraph has its speaker's tag beside the paragraph's first line. The tag is
// centred on that line at every Booth text size (alignment rule A8, `tests/visual/lib/layoutScan.ts`): the cell is one line of the
// paragraph's own type tall (`1lh`), so the tag follows the font-size setting without an offset tuned for one size.
const paragraph = (key: string, start: number, text: string): ReaderRow => {
  const words = text.split(' ');
  return { key, kind: 'paragraph', start, words, gaps: words.map((_, i) => (i === words.length - 1 ? '' : ' ')), text };
};
const rows = [
  paragraph(
    'p1',
    0,
    'Alice was beginning to get very tired of sitting by her sister on the bank, and of having nothing to do: once or twice she had peeped into the book.',
  ),
  paragraph('p2', 30, 'Oh dear! Oh dear! I shall be late! she heard the Rabbit say to itself as it hurried by.'),
];
const speakers = new Map([
  ['p1', 'Narrator'],
  ['p2', 'White Rabbit'],
]);

const isLaidOut = (element: HTMLElement) => element.getBoundingClientRect().width > 0;

/** Each speaker tag against the first line of the paragraph beside it. Where the tag sits above its paragraph (below `lg`) there is no line to match. */
async function expectCentredOnFirstLine(canvasElement: HTMLElement) {
  if (!isLaidOut(canvasElement)) return;
  for (const tag of canvasElement.querySelectorAll<HTMLElement>('[data-speaker-tag]')) {
    const paragraph = tag.closest('div[class*="grid"]')!.querySelector('p')!;
    const box = paragraph.getBoundingClientRect();
    const tagBox = tag.getBoundingClientRect();
    if (tagBox.bottom <= box.top + 1) continue;
    const line = parseFloat(getComputedStyle(paragraph).lineHeight);
    await expect(Math.abs(tagBox.top + tagBox.height / 2 - (box.top + line / 2))).toBeLessThanOrEqual(1.5);
  }
}

const sized = (px: number) => (Story: () => ReactElement) => (
  <div style={{ '--font-size-booth-script': `${px}px` } as CSSProperties} className="max-w-3xl bg-[var(--reading-bg)] p-4 text-[var(--text)]">
    <Story />
  </div>
);

const meta = {
  title: 'Booth/ReaderText',
  component: ReaderText,
  args: { rows, cursor: 4, skipped: [], follow: false, speakers, large: true },
  play: ({ canvasElement }) => expectCentredOnFirstLine(canvasElement),
} satisfies Meta<typeof ReaderText>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SpeakerGutter: Story = { decorators: [sized(26)] };
export const SpeakerGutterSmallText: Story = { decorators: [sized(18)] };
export const SpeakerGutterLargeText: Story = { decorators: [sized(40)] };
export const SpeakerGutterHugeText: Story = { decorators: [sized(72)] };
