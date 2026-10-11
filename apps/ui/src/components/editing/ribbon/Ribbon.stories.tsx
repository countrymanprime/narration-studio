import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import type { WorkspacePeaks } from '../../../api/contracts/workspace';
import { marksDoc } from '../script/scriptFixtures';
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
const peaks = peaksOf(30);
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

// The playing moment as a line.
export const Playing: Story = {
  args: { layout: base, peaks },
  render: () => frame(<RibbonView layout={ribbonLayout(doc, 'p-1', [], (base.t0 + base.t1) / 2)!} peaks={peaks} />),
  play: async ({ canvasElement }) => {
    await expect(canvasElement.textContent).toMatch(/Playing at/);
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
