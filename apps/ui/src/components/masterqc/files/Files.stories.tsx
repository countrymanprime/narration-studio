import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import { ALL_PASS, FilesDemo, Host, TWO_FAIL, failingTwo, passing } from './testFiles';

// Master & QC's per-file checks (docs/research/mockups/studio-next/src/pages/Master.tsx): the table and the detail under it. No route
// yet; the Master page (SN-M43) composes them and SN-M5 mounts it.
const meta = {
  title: 'Master & QC/Files',
  component: FilesDemo,
  args: { files: ALL_PASS },
  decorators: [
    (Story) => (
      <Host>
        <div className="max-w-[72rem] bg-[var(--bg)] p-4">
          <Story />
        </div>
      </Host>
    ),
  ],
} satisfies Meta<typeof FilesDemo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const AllPass: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('row', { name: /Chapter 01/ }).getAttribute('aria-selected')).toBe('true');
    await expect(canvas.getAllByText('Pass').length).toBeGreaterThan(0);
  },
};

export const TwoFail: Story = {
  args: { files: [passing('Chapter 01.wav'), failingTwo('Chapter 04.wav')] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('grid', { name: 'Per-file checks' })).toBeTruthy();
    await expect(canvas.getByRole('row', { name: /Chapter 04/ }).getAttribute('aria-selected')).toBe('true');
    await expect(await canvas.findByText(/· Why it fails/)).toBeTruthy();
  },
};

export const WaitingRow: Story = {
  args: { files: TWO_FAIL, initial: TWO_FAIL[2]!.path },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Waiting to be measured · not mastered')).toBeTruthy();
    await expect(canvas.getByText(/· Not mastered/)).toBeTruthy();
  },
};

export const NoFileForTheChapter: Story = {
  args: { files: ALL_PASS, initial: 'C:/Renders/none.wav' },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText('Not mastered yet.')).toBeTruthy();
  },
};
