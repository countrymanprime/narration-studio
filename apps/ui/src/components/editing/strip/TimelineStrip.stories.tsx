import type { Meta, StoryObj } from '@storybook/react-vite';
import { useEffect, type ReactNode } from 'react';
import { expect, waitFor, within } from 'storybook/test';
import { ApiProvider } from '../../../api/ApiContext';
import type { WorkspacePeaks } from '../../../api/contracts/workspace';
import { createMockApi } from '../../../api/mockApi';
import { EditingPageProvider, useEditingPage } from '../script/EditingPageState';
import { marksDoc } from '../script/scriptFixtures';
import type { LinePassage, LineTake } from '../takes/types';
import { StripRoot, TimelineStrip } from './TimelineStrip';

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

const take = (id: string, label: string, active = false): LineTake => ({
  id,
  label,
  active,
  usable: true,
  sourceFile: `${id}.wav`,
  sourceStart: 2,
  sourceLength: 4,
});
const passage = (...takes: LineTake[]): LinePassage => ({ id: 'ps-1', chapterId: '5', firstToken: 0, lastToken: 5, script: 'Alice was tired', takes });
const one = passage(take('t-1', 'A', true));
const three = passage(take('t-1', 'A'), take('t-2', 'B', true), take('t-3', 'C'));

const doc = marksDoc();
const api = (withPeaks: boolean) => ({
  ...createMockApi(),
  workspacePeaks: async (chapterId: string) => ({
    chapterId,
    items: [{ index: 0, ...(withPeaks ? { peaks: peaksOf(30) } : { reason: 'No waveform: the source is not a WAV.' }) }],
  }),
});

function Seed({ select, playT }: { select?: [string, string]; playT?: number }) {
  const { dispatch } = useEditingPage();
  useEffect(() => {
    dispatch({ type: 'place', key: 'p-1:1' });
    if (select) dispatch({ type: 'select', anchor: select[0], head: select[1] });
    if (playT != null) dispatch({ type: 'play', t: playT });
  }, [dispatch, select, playT]);
  return null;
}

/** `width` stands for the page root's width: the strip is offered at 1360 and wider and absent below it. */
function frame(width: number, node: ReactNode, seed: { select?: [string, string]; playT?: number } = {}, withPeaks = true) {
  return (
    <div style={{ width }} className="bg-[var(--surface)] text-[var(--text)]">
      <ApiProvider api={api(withPeaks)}>
        <EditingPageProvider doc={doc}>
          <Seed {...seed} />
          <StripRoot>{node}</StripRoot>
        </EditingPageProvider>
      </ApiProvider>
    </div>
  );
}

const strip = (p: LinePassage | null, playingId: string | null = null) => (
  <TimelineStrip passage={p} playingId={playingId} onPlay={() => undefined} chapterId="5" />
);

const meta = { title: 'Editing/TimelineStrip', component: TimelineStrip, parameters: { layout: 'fullscreen' } } satisfies Meta<typeof TimelineStrip>;
export default meta;
type Story = StoryObj<typeof meta>;

// One take: the audio and one lane.
export const OneTake: Story = {
  args: { passage: one, playingId: null, onPlay: () => undefined, chapterId: '5' },
  render: () => frame(1440, strip(one)),
  play: async ({ canvasElement }) => {
    await waitFor(() => expect(within(canvasElement).getByRole('button', { name: 'Play take A' })).toBeTruthy());
  },
};

// Three takes of the line, each in a lane of its own on the one axis.
export const ThreeTakes: Story = {
  args: { passage: three, playingId: null, onPlay: () => undefined, chapterId: '5' },
  render: () => frame(1440, strip(three)),
  play: async ({ canvasElement }) => {
    await waitFor(() => expect(canvasElement.querySelectorAll('[data-lane]')).toHaveLength(4));
  },
};

// A stacked passage: its takes start at the same time.
export const Stacked: Story = {
  args: { passage: three, playingId: null, onPlay: () => undefined, chapterId: '5' },
  render: () => frame(1440, strip(three)),
  play: async ({ canvasElement }) => {
    // The lanes are drawn once the peaks have been read.
    await waitFor(() => {
      const lefts = [...canvasElement.querySelectorAll('[data-lane^="t-"] span.absolute')].map((e) => (e as HTMLElement).style.left);
      expect(lefts.length).toBeGreaterThan(0);
      expect(new Set(lefts).size).toBe(1);
    });
  },
};

// Words selected: the band on the audio and on the active take, with its length.
export const Selection: Story = {
  args: { passage: three, playingId: null, onPlay: () => undefined, chapterId: '5' },
  render: () => frame(1440, strip(three), { select: ['p-1:1', 'p-1:3'] }),
  play: async ({ canvasElement }) => {
    await waitFor(() => expect(canvasElement.querySelector('[data-selband]')).toBeTruthy());
  },
};

// The playing moment as one line across the audio and every lane.
export const Playing: Story = {
  args: { passage: three, playingId: 't-2', onPlay: () => undefined, chapterId: '5' },
  render: () => frame(1440, strip(three, 't-2'), { playT: (doc.paras[0].start as number) + 1 }),
  play: async ({ canvasElement }) => {
    await waitFor(() => expect(canvasElement.querySelectorAll('[data-now]')).toHaveLength(3));
  },
};

// No peaks: the audio lane says so.
export const NoAudio: Story = {
  args: { passage: null, playingId: null, onPlay: () => undefined, chapterId: '5' },
  render: () => frame(1440, strip(null), {}, false),
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByText(/No audio to draw/)).toBeTruthy();
  },
};

// Below 1360 the strip is not offered.
export const Narrow: Story = {
  args: { passage: three, playingId: null, onPlay: () => undefined, chapterId: '5' },
  render: () => frame(1100, strip(three)),
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('#timeline')?.className).toContain('hidden');
  },
};
