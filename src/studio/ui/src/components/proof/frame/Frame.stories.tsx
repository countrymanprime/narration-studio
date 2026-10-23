import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import { useState } from 'react';
import { ChapterStrip, type StripChapter } from './ChapterStrip';
import { ProofHeader } from './ProofHeader';
import { WaveformWindow } from './WaveformWindow';
import type { PeaksSegment } from './peaksJoin';
import type { Pin } from './pins';
import type { TimeWindow } from './windowMath';

// The frame of the Studio Next Proof page: the header with the counters, the all-chapters strip and the windowed waveform with its pins (D98).
const meta = { title: 'Proof/Frame', parameters: { layout: 'padded' } } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

const chapters = (n: number): StripChapter[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `c${i}`,
    name: `Chapter ${i}`,
    number: i === 0 || i === n - 1 ? null : i,
    total: i % 7 === 3 ? 0 : 4,
    open: i % 3 === 0 ? 0 : 2,
  }));

export const Header: Story = {
  render: () => (
    <ProofHeader
      progress={{ cleared: 14, total: 22, decided: 18, open: 8, percent: 64 }}
      chapterBar={<span className="text-sm text-[var(--text-muted)]">All chapters</span>}
    />
  ),
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText('· 18 decided')).toBeTruthy();
  },
};

export const HeaderWithoutNotes: Story = {
  render: () => (
    <ProofHeader
      progress={{ cleared: 0, total: 0, decided: 0, open: 0, percent: 0 }}
      chapterBar={<span className="text-sm text-[var(--text-muted)]">Chapter 1</span>}
    />
  ),
};

export const StripSparse: Story = { render: () => <ChapterStrip chapters={chapters(9)} current="c2" onChooseChapter={() => {}} /> };

export const StripDense: Story = { render: () => <ChapterStrip chapters={chapters(30)} current="c12" onChooseChapter={() => {}} /> };

const PINS: Pin[] = [
  { id: 'a', sec: 14, colour: 'var(--review)', done: false, label: 'Misread at 00:14' },
  { id: 'b', sec: 15, colour: 'var(--info)', done: true, label: 'Pause at 00:15' },
  { id: 'c', sec: 70, colour: 'var(--warn)', done: false, label: 'Mouth click at 01:10' },
  { id: 'd', sec: 400, colour: 'var(--ok)', done: true, label: 'Breath at 06:40' },
];

// 760 s in three items: one with peaks, one without audio.
const peaks = btoa(String.fromCharCode(...Array.from({ length: 128 }, (_, i) => (i % 2 === 0 ? 256 - (20 + ((i * 7) % 80)) : 20 + ((i * 11) % 90)))));
const SEGMENTS: PeaksSegment[] = [
  {
    itemGuid: 'i1',
    start: 0,
    end: 380,
    entry: { index: 0, peaks: { startSeconds: 0, bucketsPerSecond: 0.17, buckets: 64, minMax: peaks, sampleRate: 48000, channels: 1 } },
  },
  { itemGuid: 'i2', start: 380, end: 560, entry: { index: 1, reason: 'no waveform' } },
  { itemGuid: 'i3', start: 560, end: 760 },
];

function Waveform({ initial = { start: 0, len: 60 }, selected = null, pins = PINS }: { initial?: TimeWindow; selected?: string | null; pins?: Pin[] }) {
  const [win, setWin] = useState(initial);
  const [sel, setSel] = useState<string | null>(selected);
  return (
    <WaveformWindow
      total={760}
      window={win}
      onWindowChange={setWin}
      segments={SEGMENTS}
      pins={pins}
      bands={[{ id: 'take', start: 60, end: 90, label: 'Take 2 · Kept', tone: 'ok' }]}
      playhead={30}
      selectedId={sel}
      onPin={setSel}
      noteCount={pins.length}
    />
  );
}

export const ChapterAt30Seconds: Story = { render: () => <Waveform /> };
export const ChapterAt2Minutes: Story = { render: () => <Waveform initial={{ start: 0, len: 120 }} /> };
export const WholeChapter: Story = { render: () => <Waveform initial={{ start: 0, len: 760 }} /> };
export const PinsMerged: Story = {
  render: () => <Waveform />,
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('button', { name: '2 notes' })).toBeTruthy();
  },
};
export const SelectedPin: Story = { render: () => <Waveform selected="a" /> };
export const ItemWithNoPeaks: Story = { render: () => <Waveform initial={{ start: 380, len: 120 }} pins={[]} /> };
