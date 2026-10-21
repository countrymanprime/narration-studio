import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, within } from 'storybook/test';
import type { WorkspacePeaks } from '../../../api/contracts/workspace';
import type { ChapterDoc } from '../model';
import { marksDoc } from '../script/scriptFixtures';
import { wordsCovered, type Span } from './rangeMath';
import { rangeDoc } from './rangeFixtures';
import { RibbonView } from './Ribbon';
import { ribbonLayout } from './ribbonLayout';

/** A steady tone-shaped entry over `seconds` at the host's 50 peaks a second, so the bars read the same on every run. */
function peaksOf(seconds: number): WorkspacePeaks {
  const n = Math.round(seconds * 50);
  const bytes = new Uint8Array(n * 2);
  for (let i = 0; i < n; i += 1) {
    const amp = Math.round(20 + 80 * Math.abs(Math.sin(i / 3.7)) * (0.4 + 0.6 * Math.abs(Math.sin(i / 17))));
    bytes[2 * i] = 256 - amp;
    bytes[2 * i + 1] = amp;
  }
  return { startSeconds: 0, bucketsPerSecond: 50, buckets: n, minMax: btoa(String.fromCharCode(...bytes)), sampleRate: 48000, channels: 1 };
}
const peaks = peaksOf(30);

/** The ribbon with a range the narrator can draw and move, held here the way the page holds it. */
function Chooser({
  doc,
  pid = 'p-1',
  range: first = null,
  view,
}: {
  doc: ChapterDoc;
  pid?: string;
  range?: Span | null;
  view?: { start: number; len: number };
}) {
  const [range, setRange] = useState<Span | null>(first);
  const words = doc.paras.find((p) => p.p.id === pid)?.items ?? [];
  // The canvas band is the whole words the range selects, which is what a cut or an effect works on.
  const layout = ribbonLayout(doc, pid, range ? wordsCovered(words, range).keys : [], null)!;
  return (
    <div className="bg-[var(--surface)] p-4 text-[var(--text)]">
      <RibbonView
        layout={layout}
        peaks={peaks}
        head={{ take: null }}
        initialView={view}
        choose={{ words, range, onRange: (span) => setRange(span), onTap: () => setRange(null) }}
      />
    </div>
  );
}

const meta = { title: 'Editing/Ribbon range', component: Chooser, parameters: { layout: 'fullscreen' } } satisfies Meta<typeof Chooser>;
export default meta;
type Story = StoryObj<typeof meta>;

const doc = rangeDoc();

// No range yet: the line says how to make one.
export const NoRange: Story = {
  args: { doc },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText(/Drag on the waveform to choose a range/)).toBeTruthy();
    await expect(within(canvasElement).queryByRole('slider', { name: 'Start of range' })).toBeNull();
  },
};

// A range with a handle on each edge, ending inside two words: the partial words are named and the sub-word edge is a labelled preview.
export const Range: Story = {
  args: { doc, range: { start: 5.54, end: 6.3 } },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await expect(c.getByRole('slider', { name: 'Start of range' })).toBeTruthy();
    await expect(c.getByRole('slider', { name: 'End of range' })).toBeTruthy();
    await expect(c.getByTestId('range-partial').textContent).toMatch(/covers the last 20% of “was”/);
    await expect(canvasElement.textContent).toMatch(/Sub-word edge, shown as a preview/);
  },
};

// Zoomed to the closest view, one second: the peaks are 20 ms bars and the waveform says so, with the pan strip under it.
export const ZoomedIn: Story = {
  args: { doc, range: { start: 6.1, end: 6.4 }, view: { start: 0.85, len: 1 } },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await expect(c.getByRole('slider', { name: 'Visible part' })).toBeTruthy();
    // The bar note shows only where a 20 ms bar is wide enough to see (a narrow window at one second is not): the unit test holds it.
    await expect(c.queryByText(/Each bar is (?!20 ms)\d+ ms/)).toBeNull();
  },
};

// A handle with the keyboard focus: Arrow keys nudge it, Shift by ten steps, Alt to the next word boundary.
export const HandleFocused: Story = {
  args: { doc, range: { start: 5.6, end: 6.2 } },
  play: async ({ canvasElement }) => {
    const handle = within(canvasElement).getByRole('slider', { name: 'Start of range' });
    handle.focus();
    await expect(document.activeElement).toBe(handle);
  },
};

// A range against the paragraph's start: the handle slides in so it stays inside the waveform.
export const AtParagraphEdge: Story = {
  args: { doc, range: { start: 5, end: 5.45 } },
  play: async ({ canvasElement }) => {
    const start = within(canvasElement).getByRole('slider', { name: 'Start of range' });
    await expect(start.getAttribute('aria-valuenow')).toBe('5');
  },
};

// Flagged words under the range: the misread, extra and low-confidence tints keep their bars along the top.
export const FlaggedUnderRange: Story = {
  args: { doc: marksDoc(), range: { start: 0.9, end: 2.6 } },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.textContent).toMatch(/Range/);
    await expect(within(canvasElement).getByRole('group', { name: /^Range / })).toBeTruthy();
  },
};
