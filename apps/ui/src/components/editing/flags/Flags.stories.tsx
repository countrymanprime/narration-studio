import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import { flagged, type ChapterDoc } from '../model';
import { marksDoc } from '../script/scriptFixtures';
import { FlagCard } from './FlagCard';
import { Legend } from './Legend';

const doc: ChapterDoc = marksDoc();
const dup: ChapterDoc = marksDoc();
dup.paras[1].items.slice(0, 2).forEach((i) => {
  i.dup = true;
});

const noop = (): void => {};
const card = (flag: string, d: ChapterDoc = doc, hear: ((a: number, b: number) => void) | null = noop) => {
  const dp = flag.startsWith('dup:') ? d.paras[1] : (d.paras.find((p) => p.items.some((i) => i.key === flag)) ?? d.paras[0]);
  return (
    <div className="bg-[var(--surface)] p-3 text-[var(--text)]">
      <FlagCard doc={d} dp={dp} flag={flag} score={{ conf: 0.62 }} hear={hear} accept={noop} onClose={noop} />
    </div>
  );
};
const first = (kind: 'extra' | 'miss' | 'mis' | 'low'): string => flagged(doc, kind)[0].key;

const meta = { title: 'Editing/Flags', parameters: { layout: 'padded' } } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

export const Misread: Story = {
  render: () => card(first('mis')),
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('note')).toBeTruthy();
  },
};
export const NotRead: Story = { render: () => card(first('miss')) };
export const LowConfidence: Story = { render: () => card(first('low')) };
export const NotInTheScript: Story = { render: () => card(first('extra')) };
export const ReadTwice: Story = { render: () => card('dup:p-2', dup) };
export const NoAudio: Story = { render: () => card(first('mis'), doc, null) };
export const NotScored: Story = {
  render: () => (
    <div className="bg-[var(--surface)] p-3 text-[var(--text)]">
      <FlagCard doc={doc} dp={doc.paras[0]} flag={first('mis')} score={{ conf: null, reason: 'no_word_scores' }} hear={noop} accept={noop} onClose={noop} />
    </div>
  ),
};
export const LegendWide: Story = {
  render: () => (
    <div className="bg-[var(--surface)] p-3">
      <Legend doc={doc} compact={false} />
    </div>
  ),
};
export const LegendNarrow: Story = {
  render: () => (
    <div className="bg-[var(--surface)] p-3">
      <Legend doc={doc} compact />
    </div>
  ),
};
export const LegendNotTranscribed: Story = {
  render: () => (
    <div className="bg-[var(--surface)] p-3">
      <Legend doc={{ ...doc, aligned: false }} compact={false} />
    </div>
  ),
};
