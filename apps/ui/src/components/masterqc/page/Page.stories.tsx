import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, within } from 'storybook/test';
import { MasterPage } from './MasterPage';
import { ALL_PASS, PageHost, TWO_FAIL, acx, apiOf, jobOf } from './testPage';

// Master & QC's page body (docs/research/mockups/studio-next/src/pages/Master.tsx): files, consistency and the package checks beside
// the kept panels. No route yet; SN-M5 mounts it.
const meta = {
  title: 'Master & QC/Page',
  component: MasterPage,
  args: { onOpenDelivery: fn(), openSettings: fn() },
  render: (args, { parameters }) => (
    <PageHost api={apiOf(jobOf(parameters.files ?? []), acx)}>
      <div className="bg-[var(--bg)] p-4">
        <MasterPage {...args} />
      </div>
    </PageHost>
  ),
} satisfies Meta<typeof MasterPage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Measured: Story = {
  parameters: { files: TWO_FAIL.filter((file) => file.status === 'measured') },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText(/Spread \d+\.\d dB across 3 files/)).toBeTruthy();
    await expect(canvas.getByText('Chapter 04.wav fails 2 checks')).toBeTruthy();
  },
};

export const PartlyWaiting: Story = {
  parameters: { files: TWO_FAIL },
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByText('1 chapter not ready')).toBeTruthy();
  },
};

export const AllPassing: Story = {
  parameters: { files: ALL_PASS },
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByText('0 failing and 0 not ready.')).toBeTruthy();
  },
};

export const NothingMeasured: Story = {
  parameters: { files: [] },
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByText(/Nothing measured yet/)).toBeTruthy();
  },
};
