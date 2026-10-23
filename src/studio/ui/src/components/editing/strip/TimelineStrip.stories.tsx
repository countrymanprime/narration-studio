import type { Meta, StoryObj } from '@storybook/react-vite';
import { useEffect, type ReactNode } from 'react';
import { expect, waitFor, within } from 'storybook/test';
import { ApiProvider } from '../../../api/ApiContext';
import { createMockApi } from '../../../api/mockApi';
import { EditingPageProvider, useEditingPage } from '../script/EditingPageState';
import { marksDoc } from '../script/scriptFixtures';
import type { LinePassage, LineTake } from '../takes/types';
import { TimelineStrip } from './TimelineStrip';

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
const api = createMockApi();

function Seed({ select, playT }: { select?: [string, string]; playT?: number }) {
  const { dispatch } = useEditingPage();
  useEffect(() => {
    dispatch({ type: 'place', key: 'p-1:1' });
    if (select) dispatch({ type: 'select', anchor: select[0], head: select[1] });
    if (playT != null) dispatch({ type: 'play', t: playT });
  }, [dispatch, select, playT]);
  return null;
}

/** `width` is the frame's width; the page decides whether the strip is offered (from a 1360 px window). */
function frame(width: number, node: ReactNode, seed: { select?: [string, string]; playT?: number } = {}) {
  return (
    <div style={{ width }} className="bg-[var(--surface)] text-[var(--text)]">
      <ApiProvider api={api}>
        <EditingPageProvider doc={doc}>
          <Seed {...seed} />
          {node}
        </EditingPageProvider>
      </ApiProvider>
    </div>
  );
}

const strip = (p: LinePassage | null, playingId: string | null = null) => <TimelineStrip passage={p} playingId={playingId} onPlay={() => undefined} />;

const meta = { title: 'Editing/TimelineStrip', component: TimelineStrip, parameters: { layout: 'fullscreen' } } satisfies Meta<typeof TimelineStrip>;
export default meta;
type Story = StoryObj<typeof meta>;

// One take: one lane. The line's audio is the page's one waveform, docked above the transport, not a lane here.
export const OneTake: Story = {
  args: { passage: one, playingId: null, onPlay: () => undefined },
  render: () => frame(1440, strip(one)),
  play: async ({ canvasElement }) => {
    await waitFor(() => expect(within(canvasElement).getByRole('button', { name: 'Play take A' })).toBeTruthy());
  },
};

// Three takes of the line, each in a lane of its own on the one axis.
export const ThreeTakes: Story = {
  args: { passage: three, playingId: null, onPlay: () => undefined },
  render: () => frame(1440, strip(three)),
  play: async ({ canvasElement }) => {
    await waitFor(() => expect(canvasElement.querySelectorAll('[data-lane]')).toHaveLength(3));
  },
};

// A stacked passage: its takes start at the same time.
export const Stacked: Story = {
  args: { passage: three, playingId: null, onPlay: () => undefined },
  render: () => frame(1440, strip(three)),
  play: async ({ canvasElement }) => {
    await waitFor(() => {
      const lefts = [...canvasElement.querySelectorAll('[data-lane^="t-"] span.absolute')].map((e) => (e as HTMLElement).style.left);
      expect(lefts.length).toBeGreaterThan(0);
      expect(new Set(lefts).size).toBe(1);
    });
  },
};

// Words selected: the band on the active take, with its length.
export const Selection: Story = {
  args: { passage: three, playingId: null, onPlay: () => undefined },
  render: () => frame(1440, strip(three), { select: ['p-1:1', 'p-1:3'] }),
  play: async ({ canvasElement }) => {
    await waitFor(() => expect(canvasElement.querySelector('[data-selband]')).toBeTruthy());
  },
};

// The playing moment as one line across every lane.
export const Playing: Story = {
  args: { passage: three, playingId: 't-2', onPlay: () => undefined },
  render: () => frame(1440, strip(three, 't-2'), { playT: (doc.paras[0].start as number) + 1 }),
  play: async ({ canvasElement }) => {
    await waitFor(() => expect(canvasElement.querySelectorAll('[data-now]')).toHaveLength(3));
  },
};

// A line with no takes: the axis and no lanes.
export const NoTakes: Story = {
  args: { passage: null, playingId: null, onPlay: () => undefined },
  render: () => frame(1440, strip(null)),
  play: async ({ canvasElement }) => {
    await waitFor(() => expect(canvasElement.querySelector('#timeline')).toBeTruthy());
    await expect(canvasElement.querySelectorAll('[data-lane]')).toHaveLength(0);
  },
};

// Below a 1360 px window the page offers the strip in the drawer's Timeline tab instead; drawn in a narrow frame it still lays out.
export const Narrow: Story = {
  args: { passage: three, playingId: null, onPlay: () => undefined },
  render: () => frame(1100, strip(three)),
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('#timeline')?.className).not.toContain('hidden');
  },
};
