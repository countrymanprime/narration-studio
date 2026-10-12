import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import { ApiProvider } from '../../../api/ApiContext';
import { createMockApi } from '../../../api/mockApi';
import type { ExportJob, ManuscriptChapter, MeasureFileResult, MeasureJob, PackageJob } from '../../../types';
import { failingTwo, passing, profile, waiting } from '../../masterqc/files/testFiles';
import { DeliveryPage } from './DeliveryPage';

// The Delivery page body (docs/research/mockups/studio-next/src/pages/Delivery.tsx): the profile card, Output and "Before you build", mounted at
// `/delivery`.
const chapters = [1, 2, 3, 4].map(
  (index) => ({ id: `c${index}`, title: `Chapter 0${index}`, index, wordCount: 100, status: 'ready' }) as unknown as ManuscriptChapter,
);
const measured = (files: MeasureFileResult[]) => ({ phase: 'success', files, profile, bookRules: [] }) as unknown as MeasureJob;
const encoded = { phase: 'success', files: [{ status: 'done', kind: 'chapter', title: 'Chapter 01', encodedPath: 'C:/enc/01.mp3' }] } as unknown as ExportJob;
const idle = { id: null, kind: 'render_package', phase: 'idle', message: '', profile: '', outputDir: '', files: [], checklist: [], elapsed: 0 } as PackageJob;
const builtJob: PackageJob = {
  ...idle,
  id: 'p1',
  phase: 'success',
  message: 'Built',
  outputDir: 'C:/Deliver/ACX',
  files: chapters.map((c) => ({ kind: 'chapter', name: `${c.title}.mp3`, destPath: `C:/Deliver/ACX/${c.title}.mp3`, tagged: true })),
};
const all = ['01', '02', '03', '04'].map((n) => passing(`Chapter ${n}.wav`));

const host = (files: MeasureFileResult[], job: PackageJob = idle) =>
  createMockApi({
    manuscriptChapters: async () => chapters,
    measureState: async () => measured(files),
    exportState: async () => encoded,
    packageState: async () => job,
  });

const meta = {
  title: 'Delivery/Page',
  component: DeliveryPage,
  args: { hasManuscript: true, onOpenInMaster: () => undefined },
  decorators: [
    (Story, { parameters }) => (
      <ApiProvider api={parameters.api}>
        <div className="max-w-[80rem] bg-[var(--bg)] p-4">
          <Story />
        </div>
      </ApiProvider>
    ),
  ],
} satisfies Meta<typeof DeliveryPage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Ready: Story = {
  parameters: { api: host(all) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText('Every chapter passes.')).toBeTruthy();
    await expect(canvas.getByText('4 of 4')).toBeTruthy();
  },
};

export const Blocked: Story = {
  parameters: { api: host([all[0], all[1], waiting('Chapter 03.wav'), failingTwo('Chapter 04.wav')]) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText('1 failing, 1 not ready')).toBeTruthy();
  },
};

export const Built: Story = {
  parameters: { api: host(all, builtJob) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText('4 files')).toBeTruthy();
    await expect(canvas.getAllByText('Written')).toHaveLength(4);
  },
};

export const NoManuscript: Story = {
  args: { hasManuscript: false },
  parameters: { api: host([]) },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText(/Add the manuscript first/)).toBeTruthy();
  },
};
