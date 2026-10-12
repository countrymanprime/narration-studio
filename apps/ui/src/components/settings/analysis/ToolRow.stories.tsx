import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, within } from 'storybook/test';
import { ANALYSIS_TOOLS } from './fixtures';
import { ToolRow, type ToolRowProps } from './ToolRow';

const [gliner, small, large, local] = ANALYSIS_TOOLS;

const actions = { download: fn(), cancel: fn(), retry: fn(), dismiss: fn(), remove: fn() };

// Settings draws the section on the panel surface; axe measures the pill tints and the muted facts against it.
function Section({ rows }: { rows: ToolRowProps[] }) {
  return (
    <div className="max-w-[860px] rounded-lg bg-[var(--surface)] p-4 text-sm">
      <ul className="m-0 flex list-none flex-col p-0">
        {rows.map((row, index) => (
          <ToolRow key={`${row.tool.id}-${index}`} {...row} />
        ))}
      </ul>
    </div>
  );
}

const meta = {
  title: 'Settings/AnalysisTools',
  component: Section,
  args: { rows: [] },
} satisfies Meta<typeof Section>;

export default meta;
type Story = StoryObj<typeof meta>;

// The section as Settings first shows it (docs/research/mockups/studio-next/src/pages/settings/AnalysisTools.tsx): three tools to
// download, and the local model with the host's reason and no button.
export const NotInstalled: Story = {
  args: {
    rows: [
      { tool: gliner, status: 'not-installed', ...actions },
      { tool: small, status: 'not-installed', ...actions },
      { tool: large, status: 'not-installed', ...actions },
      { tool: local, status: 'unavailable', ...actions },
    ],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('button', { name: 'Download GLiNER…' })).toBeTruthy();
    await expect(canvas.getByText('Not available yet')).toBeTruthy();
  },
};

// Every status the pill can say, each with the one action it allows: the host's real percent while downloading, Cancel while the files
// are checked, the host's sentence and Try again after a failure, Remove once installed.
export const EveryStatus: Story = {
  args: {
    rows: [
      { tool: { ...gliner, installState: 'installed' }, status: 'installed', ...actions },
      { tool: small, status: 'downloading', job: { percent: 40 }, ...actions },
      { tool: large, status: 'verifying', job: { percent: 99 }, ...actions },
      { tool: gliner, status: 'failed', failure: 'Could not reach huggingface.co.', ...actions },
      { tool: small, status: 'not-installed', ...actions },
      { tool: local, status: 'unavailable', ...actions },
    ],
  },
};
