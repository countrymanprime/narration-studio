import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import type { WorkspacePeaks } from '../../../api/contracts/workspace';
import { marksDoc } from '../script/scriptFixtures';
import { shiftPeaks } from './docClock';
import { RibbonView } from './Ribbon';
import { ribbonLayout } from './ribbonLayout';

/** A steady tone-shaped entry over `seconds`, so the bars read the same on every run. */
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

const doc = marksDoc();
const frame = (node: React.ReactNode) => <div className="bg-[var(--surface)] p-4 text-[var(--text)]">{node}</div>;
const peaks = [shiftPeaks(peaksOf(30), 0)];

// Light and dark: the atlas renders every story in both themes, so the bars, the played split and the overlays are checked against each.
const base = ribbonLayout(doc, 'p-1', [], null)!;

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

// Words selected: the blue band over their span.
export const Selection: Story = {
  args: { layout: base, peaks },
  render: () => frame(<RibbonView layout={ribbonLayout(doc, 'p-1', ['p-1:1', 'p-1:2', 'p-1:3'], null)!} peaks={peaks} />),
  play: async ({ canvasElement }) => {
    await expect(canvasElement.textContent).toMatch(/Selection from/);
  },
};

// The playing moment: the bars already played in the accent, the rest in the neutral, and the bars at the playhead taller. The atlas freezes motion,
// so this is the still look; the pulse is drawn by the frame loop only while a line plays (ribbonBars.ts, Ribbon.test.tsx).
export const Playing: Story = {
  args: { layout: base, peaks },
  render: () => frame(<RibbonView layout={ribbonLayout(doc, 'p-1', [], (base.t0 + base.t1) / 2)!} peaks={peaks} />),
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
          <RibbonView key={share} layout={ribbonLayout(doc, 'p-1', [], base.t0 + share * (base.t1 - base.t0))!} peaks={peaks} />
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
    const line = ribbonLayout(cutDoc, 'p-2', [], null)!;
    const l = ribbonLayout(cutDoc, 'p-2', ['p-2:0'], line.t0 + 0.6 * (line.t1 - line.t0))!;
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
    return frame(<RibbonView layout={ribbonLayout(cutDoc, 'p-1', [], null)!} peaks={peaks} />);
  },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.textContent).toMatch(/flagged words/);
  },
};

export const NoAudio: Story = {
  args: { layout: base },
  render: () => frame(<RibbonView layout={base} reason="No waveform: the source is not a WAV." />),
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText(/No audio to draw/)).toBeTruthy();
  },
};
