import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import { ANALYSIS_TOOLS } from './fixtures';
import { ToolRow, type ToolRowProps } from './ToolRow';

const [gliner, small, large] = ANALYSIS_TOOLS;
// A row whose files are not all pinned yet: the host's sentence instead of a Download button.
const pending = {
  ...large,
  unavailableReason: 'BookNLP (large) is not yet available: its download is still being checked, and it will be offered once every file is pinned.',
};

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
// download. The mock's fourth row, the local model, is not built (docs/guides/using-the-app/settings.md).
export const NotInstalled: Story = {
  args: {
    rows: [
      { tool: gliner, status: 'not-installed', ...actions },
      { tool: small, status: 'not-installed', ...actions },
      { tool: large, status: 'not-installed', ...actions },
    ],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('button', { name: 'Download GLiNER…' })).toBeTruthy();
    await expect(canvas.queryByText('Not available yet')).toBeNull();
  },
};

// Every status the pill can say, each with the one action it allows: the host's real percent while downloading, Cancel while the files
// are checked, the host's sentence and Retry after a failure, Remove once installed.
export const EveryStatus: Story = {
  args: {
    rows: [
      { tool: { ...gliner, installState: 'installed' }, status: 'installed', ...actions },
      { tool: small, status: 'downloading', job: { percent: 40 }, ...actions },
      { tool: large, status: 'verifying', job: { percent: 99 }, ...actions },
      { tool: gliner, status: 'failed', failure: 'Could not reach huggingface.co.', ...actions },
      { tool: small, status: 'not-installed', ...actions },
      { tool: pending, status: 'unavailable', ...actions },
    ],
  },
};

// A failure after the download (#2251): the host's sentence, and its step, file and cause behind Details, closed until asked for and
// opened here so the atlas measures the text.
export const FailedWithDetails: Story = {
  args: {
    rows: [
      {
        tool: small,
        status: 'failed',
        failure: 'The downloaded analysis tool matched the approved file but could not be saved on this computer, so it was not installed.',
        failureDetail: 'Unpacking torch-2.14.1-cp312-cp312-win_amd64.whl: open: Access is denied.',
        ...actions,
      },
    ],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByText('Details'));
    await expect(canvas.getByText('Unpacking torch-2.14.1-cp312-cp312-win_amd64.whl: open: Access is denied.')).toBeVisible();
  },
};
