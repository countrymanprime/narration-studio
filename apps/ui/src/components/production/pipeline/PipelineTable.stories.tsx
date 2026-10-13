import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, within } from 'storybook/test';
import { Panel } from '../../primitives/Panel';
import { PipelineTable } from './PipelineTable';
import { buildPipelineRows } from './pipelineRows';
import { pipelineChapters } from './pipelineChapters';
import { FINISHED, LONG_NAME, MID_BOOK, MID_BOOK_RECOMMENDATIONS, MID_BOOK_SOURCES, NOTHING_RECORDED } from './pipelineFixtures';

const meta = {
  title: 'Production/PipelineTable',
  component: PipelineTable,
  args: {
    rows: buildPipelineRows(MID_BOOK, MID_BOOK_SOURCES),
    recommendations: MID_BOOK_RECOMMENDATIONS,
    onGo: fn(),
    notify: fn(),
    onStatus: fn(),
  },
  // The table sits in the Chapter pipeline panel, so its contrast is measured on the panel's surface.
  render: (args) => (
    <Panel title="Chapter pipeline" flush>
      <PipelineTable {...args} />
    </Panel>
  ),
} satisfies Meta<typeof PipelineTable>;

export default meta;
type Story = StoryObj<typeof meta>;

// The mock's pipeline: one format for every stage (a tick, the percent, a dash), the readiness chip on the corner of the cell the
// chapter is in, and a cell that is a button naming the chapter, the stage and its state.
export const MidBook: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('button', { name: 'Chapter 2: Proof 6 of 9 notes cleared' })).toBeTruthy();
    canvas.getByRole('button', { name: 'Chapter 3: Edit in progress' }).click();
    await expect(args.onGo).toHaveBeenCalledWith('editing', 'c3');
  },
};

export const Finished: Story = { args: { rows: buildPipelineRows(FINISHED), recommendations: new Map() } };
export const NothingRecorded: Story = { args: { rows: buildPipelineRows(NOTHING_RECORDED), recommendations: new Map() } };
// A long name wraps in its own column; the stage columns keep their width and the table scrolls inside the panel.
export const LongChapterName: Story = { args: { rows: buildPipelineRows(LONG_NAME), recommendations: new Map() } };

// The opening credits before chapter 1 and the closing credits after the last, in the one pipeline format (a dash where nothing measures the cell).
export const WithCredits: Story = {
  args: {
    rows: buildPipelineRows(
      pipelineChapters(MID_BOOK, {
        opening: { kind: 'opening', id: 'credits-opening', name: 'Opening credits', prep: 'prepped', status: 'finalized', words: 40, recordedSeconds: 31 },
        closing: { kind: 'closing', id: 'credits-closing', name: 'Closing credits', prep: 'none', status: 'not_started', words: 30 },
      }),
      { ...MID_BOOK_SOURCES, prep: { 'credits-opening': 'prepped', 'credits-closing': 'none' } },
    ),
  },
  play: async ({ canvasElement }) => {
    const rows = within(canvasElement).getAllByRole('row').slice(1);
    await expect(rows[0]?.textContent).toContain('Opening credits');
    await expect(rows.at(-1)?.textContent).toContain('Closing credits');
  },
};
