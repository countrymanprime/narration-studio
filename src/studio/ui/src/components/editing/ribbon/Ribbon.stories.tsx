import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import type { WorkspacePeaks } from '../../../api/contracts/workspace';
import { SPEECH_PEAKS_MINMAX, SPEECH_PEAKS_PER_SECOND } from '../../../api/fixtures/speechPeaks';
import { marksDoc } from '../script/scriptFixtures';
import { shiftPeaks } from './docClock';
import { RibbonView } from './Ribbon';
import { ribbonLayout } from './ribbonLayout';

/** Sixty seconds of a real narrator's peaks (`api/fixtures/speechPeaks.ts`), so the bars in the atlas look like speech and read the same on every run. */
function peaksOf(seconds: number): WorkspacePeaks {
  const n = Math.min(Math.round(seconds * SPEECH_PEAKS_PER_SECOND), atob(SPEECH_PEAKS_MINMAX).length / 2);
  return { startSeconds: 0, bucketsPerSecond: SPEECH_PEAKS_PER_SECOND, buckets: n, minMax: SPEECH_PEAKS_MINMAX, sampleRate: 48000, channels: 1 };
}

const doc = marksDoc();
const frame = (node: React.ReactNode) => <div className="bg-[var(--surface)] p-4 text-[var(--text)]">{node}</div>;
const peaks = [shiftPeaks(peaksOf(30), 0)];

// Light and dark: the atlas renders every story in both themes, so the bars, the played split and the overlays are checked against each.
const base = ribbonLayout(doc, 'p-1', null)!;

const meta = { title: 'Editing/Ribbon', component: RibbonView, parameters: { layout: 'fullscreen' } } satisfies Meta<typeof RibbonView>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { layout: base, peaks },
  render: () => frame(<RibbonView layout={base} peaks={peaks} />),
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('img', { name: 'Audio of the active line' })).toBeTruthy();
  },
};

// Words selected: the waveform draws nothing for them; the range the narrator drew is the one selection on it.
export const Selection: Story = {
  args: { layout: base, peaks },
  render: () => frame(<RibbonView layout={ribbonLayout(doc, 'p-1', null)!} peaks={peaks} />),
  play: async ({ canvasElement }) => {
    await expect(canvasElement.textContent).not.toMatch(/Selection from/);
  },
};

// The playing moment: the bars already played in the accent, the rest in the neutral. The atlas freezes motion, so this is the still look; the
// swell runs over the bars on the frame loop only while a line plays (waveSwell.ts, Ribbon.test.tsx).
export const Playing: Story = {
  args: { layout: base, peaks },
  render: () => frame(<RibbonView layout={ribbonLayout(doc, 'p-1', (base.t0 + base.t1) / 2)!} peaks={peaks} />),
  play: async ({ canvasElement }) => {
    await expect(canvasElement.textContent).toMatch(/Playing at/);
  },
};

// The same line near its start, middle and end, to see the played share grow left to right.
export const PlayingAtSeveralPositions: Story = {
  args: { layout: base, peaks },
  render: () =>
    frame(
      <>
        {[0.1, 0.5, 0.9].map((share) => (
          <RibbonView key={share} layout={ribbonLayout(doc, 'p-1', base.t0 + share * (base.t1 - base.t0))!} peaks={peaks} />
        ))}
      </>,
    ),
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getAllByRole('img', { name: 'Audio of the active line' })).toHaveLength(3);
  },
};

// Flagged words and a cut under a playing line: the tints, the hatching and the played split stay readable together.
export const FlaggedAndCutWhilePlaying: Story = {
  args: { layout: base, peaks },
  render: () => {
    const cutDoc = marksDoc({ cuts: [{ id: 'c1', a: 4.2, b: 4.3, mode: 'gap', keys: ['p-2:1'], off0: 0, off1: 0.1 }] });
    const line = ribbonLayout(cutDoc, 'p-2', null)!;
    const l = ribbonLayout(cutDoc, 'p-2', line.t0 + 0.6 * (line.t1 - line.t0))!;
    return frame(<RibbonView layout={l} peaks={peaks} />);
  },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.textContent).toMatch(/Playing at/);
    await expect(canvasElement.textContent).toMatch(/cut span/);
  },
};

// The extra, misread and low-confidence words tinted, each with a bar along the top; a cut drawn as a hatched gap.
export const Flagged: Story = {
  args: { layout: base, peaks },
  render: () => {
    const cutDoc = marksDoc({ cuts: [{ id: 'c1', a: 6, b: 6.2, mode: 'gap', keys: ['p-1:3'], off0: 0, off1: 0.2 }] });
    return frame(<RibbonView layout={ribbonLayout(cutDoc, 'p-1', null)!} peaks={peaks} />);
  },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.textContent).toMatch(/flagged words/);
  },
};

// The swell held still (`swellPhase`), so the atlas sees one frame of it, the same on every run: its crest on the playhead, the bars under it up
// to 1.5 times their own height, a longer rise ahead of it than the settle behind, and the far ones at rest.
export const SwellWhilePlaying: Story = {
  args: { layout: base, peaks },
  render: () => frame(<RibbonView layout={ribbonLayout(doc, 'p-1', base.t0 + 0.5 * (base.t1 - base.t0))!} peaks={peaks} swellPhase={0.5} />),
};

// While the peaks are read: a flat row of placeholder bars, the lane its usual height, with the looping swell held mid-pass over them.
export const ReadingTheWaveform: Story = {
  args: { layout: base, loading: true },
  render: () => frame(<RibbonView layout={base} loading reason="Reading the waveform." swellPhase={0.5} />),
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('img', { name: 'Reading the waveform' })).toBeTruthy();
  },
};

export const NoAudio: Story = {
  args: { layout: base },
  render: () => frame(<RibbonView layout={base} reason="No waveform: the source is not a WAV." />),
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText(/No audio to draw/)).toBeTruthy();
  },
};
