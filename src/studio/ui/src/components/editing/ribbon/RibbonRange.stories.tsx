import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, within } from 'storybook/test';
import type { WorkspacePeaks } from '../../../api/contracts/workspace';
import { SPEECH_PEAKS_MINMAX, SPEECH_PEAKS_PER_SECOND } from '../../../api/fixtures/speechPeaks';
import type { ChapterDoc } from '../model';
import { marksDoc } from '../script/scriptFixtures';
import { wordsCovered, type Span } from './rangeMath';
import { rangeDoc } from './rangeFixtures';
import { shiftPeaks } from './docClock';
import { RibbonView } from './Ribbon';
import { ribbonLayout } from './ribbonLayout';

/** Sixty seconds of a real narrator's peaks (`api/fixtures/speechPeaks.ts`), so the bars in the atlas look like speech and read the same on every run. */
function peaksOf(seconds: number): WorkspacePeaks {
  const n = Math.min(Math.round(seconds * SPEECH_PEAKS_PER_SECOND), atob(SPEECH_PEAKS_MINMAX).length / 2);
  return { startSeconds: 0, bucketsPerSecond: SPEECH_PEAKS_PER_SECOND, buckets: n, minMax: SPEECH_PEAKS_MINMAX, sampleRate: 48000, channels: 1 };
}
const peaks = [shiftPeaks(peaksOf(30), 0)];

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

// No range yet: nothing is written under the waveform, and the "?" above the waveform says how to make one.
export const NoRange: Story = {
  args: { doc },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('button', { name: 'Waveform gestures' })).toBeTruthy();
    await expect(within(canvasElement).queryByRole('slider', { name: 'Start of range' })).toBeNull();
  },
};

// A range with a handle on each edge, ending inside two words: drawn on the waveform, with its time and words in a tooltip and no text under it.
export const Range: Story = {
  args: { doc, range: { start: 5.54, end: 6.3 } },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await expect(c.getByRole('slider', { name: 'Start of range' })).toBeTruthy();
    await expect(c.getByRole('slider', { name: 'End of range' })).toBeTruthy();
    await expect(canvasElement.querySelector('[data-range-body]')?.getAttribute('title')).toMatch(/^0:05\.5/);
    await expect(canvasElement.textContent).not.toMatch(/Sub-word edge/);
  },
};

// Zoomed to the closest view, one second: the peaks are 20 ms bars, with an arrow at each end that pages the view (no scrollbar).
export const ZoomedIn: Story = {
  args: { doc, range: { start: 6.1, end: 6.4 }, view: { start: 0.85, len: 1 } },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await expect(c.getByRole('button', { name: 'Scroll the waveform back a window' })).toBeTruthy();
    await expect(c.queryByRole('slider', { name: 'Visible part' })).toBeNull();
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
    await expect(within(canvasElement).getByRole('group', { name: /^Range / })).toBeTruthy();
  },
};
