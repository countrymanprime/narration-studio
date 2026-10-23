import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import { ApiProvider } from '../../../api/ApiContext';
import type { ProductionPlan, ProductionReportInclude, ProductionReportPreview } from '../../../api/contracts/production';
import { createMockApi } from '../../../api/mockApi';
import { ReportDialog } from './ReportDialog';

const PLAN: ProductionPlan = { deadline: '2026-11-01', contractedAmount: 250, payment: 'per_finished_hour', milestones: [] };
const previewOf = (include: ProductionReportInclude): ProductionReportPreview => ({
  html: `<!doctype html><html><body style="font-family:sans-serif"><h1>Production status</h1><dl><dt>Hours logged</dt><dd>41.5</dd><dt>Book PFH</dt><dd>5.20</dd>${
    include.money ? '<dt>Contracted amount</dt><dd>250.00</dd><dt>Effective rate</dt><dd>31.25</dd>' : ''
  }</dl></body></html>`,
  json: `${JSON.stringify({ hoursLogged: 41.5, bookPfh: 5.2, ...(include.money ? { contractedAmount: 250, effectiveRate: 31.25 } : {}) }, null, 2)}\n`,
  folder: 'narration-studio/production/reports',
  stem: 'production-status-20260921-100000Z',
  contractedAmountIncluded: include.money,
  include,
});
const host = (plan: ProductionPlan = PLAN, refused?: string) =>
  createMockApi({
    productionPlan: async () => plan,
    productionStatusReportPreview: async (include) => {
      if (refused) throw new Error(refused);
      return previewOf(include);
    },
  });

const meta = {
  title: 'Production/ReportDialog',
  component: ReportDialog,
  args: { projectName: 'The Salt Road', asOf: '21 Sep 2026', onClose: () => undefined },
  parameters: { api: host() },
  // A dialog draws on the surface, so axe measures contrast against it and not the page background.
  decorators: [
    (Story, { parameters }) => (
      <ApiProvider api={parameters.api}>
        <div className="max-w-5xl rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] p-4">
          <Story />
        </div>
      </ApiProvider>
    ),
  ],
} satisfies Meta<typeof ReportDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const HtmlPreview: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect((await canvas.findByTitle('Preview of the report')).getAttribute('sandbox')).toBe('');
  },
};
export const JsonPreview: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByTitle('Preview of the report');
    await userEvent.click(canvas.getByRole('button', { name: 'JSON' }));
    await expect(canvasElement.querySelector('pre')?.textContent).toContain('hoursLogged');
  },
};
export const WithAmount: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole('checkbox', { name: 'Contracted amount and effective rate' }));
    await userEvent.click(canvas.getByRole('button', { name: 'JSON' }));
    await expect(await within(canvasElement).findByText(/effectiveRate/)).toBeTruthy();
  },
};
export const RoyaltyShare: Story = {
  parameters: { api: host({ ...PLAN, payment: 'royalty_share', contractedAmount: null }) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByTitle('Preview of the report');
    await expect(canvas.queryByRole('checkbox', { name: /contracted amount/i })).toBeNull();
  },
};
export const PreviewRefused: Story = {
  parameters: { api: host(PLAN, 'Open a project first.') },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect((await canvas.findByRole('alert')).textContent).toContain('Open a project first.');
    await expect((canvas.getByRole('button', { name: 'Export' }) as HTMLButtonElement).disabled).toBe(true);
  },
};
