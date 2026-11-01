import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, waitFor, within } from 'storybook/test';
import { overlay } from '../../../overlay/overlayService';
import { ApiProvider } from '../../../api/ApiContext';
import { createMockApi } from '../../../api/mockApi';
import { StudioProvider } from '../../../studio/StudioProvider';
import type { ExportJob, ManuscriptChapter, MeasureFileResult, MeasureJob, PackageJob } from '../../../types';
import { failingTwo, passing, profile, waiting } from '../../masterqc/files/testFiles';
import { DeliveryPage } from './DeliveryPage';

// The Delivery page body (docs/research/mockups/studio-next/src/pages/Delivery.tsx): the profile card, Output and "Before you build", mounted at
// `/delivery`.
const chapters = [1, 2, 3, 4].map(
  (index) => ({ id: `c${index}`, title: `Chapter 0${index}`, index, wordCount: 100, status: 'not_started' }) as unknown as ManuscriptChapter,
);
const measured = (files: MeasureFileResult[]) => ({ phase: 'success', files, profile, bookRules: [] }) as unknown as MeasureJob;
const encoded = { phase: 'success', files: [{ status: 'done', kind: 'chapter', title: 'Chapter 01', encodedPath: 'C:/enc/01.mp3' }] } as unknown as ExportJob;
const idle = { id: null, kind: 'render_package', phase: 'idle', message: '', profile: '', outputDir: '', files: [], checklist: [], elapsed: 0 } as PackageJob;
const builtJob: PackageJob = {
  ...idle,
  id: 'p1',
  phase: 'success',
  message: 'Built',
  // The host names the profile a package was built with by its key.
  profile: 'acx@2026-09',
  outputDir: 'C:/Deliver/ACX',
  files: chapters.map((c) => ({ kind: 'chapter', name: `${c.title}.mp3`, destPath: `C:/Deliver/ACX/${c.title}.mp3`, tagged: true })),
};
const all = ['01', '02', '03', '04'].map((n) => passing(`Chapter ${n}.wav`));

const credits = (kind: 'opening' | 'closing'): ManuscriptChapter =>
  ({
    id: `credits-${kind}`,
    title: kind === 'opening' ? 'Opening credits' : 'Closing credits',
    index: -2,
    wordCount: 40,
    status: 'not_started',
    contentKind: 'narration',
    isCredits: true,
    paragraphIds: [],
  }) as unknown as ManuscriptChapter;

// The rows are the chapter list's: a story brings the credits by putting them in it.
const host = (files: MeasureFileResult[], job: PackageJob = idle, list: ManuscriptChapter[] = chapters) =>
  createMockApi({
    manuscriptChapters: async () => list,
    measureState: async () => measured(files),
    exportState: async () => encoded,
    packageState: async () => job,
  });

const meta = {
  title: 'Delivery/Page',
  component: DeliveryPage,
  args: { hasManuscript: true, onOpenInMaster: () => undefined, onOpenMaster: () => undefined },
  decorators: [
    (Story, { parameters }) => (
      <ApiProvider api={parameters.api}>
        <StudioProvider>
          <div className="max-w-[80rem] bg-[var(--bg)] p-4">
            <Story />
          </div>
        </StudioProvider>
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
    await expect(canvas.getByRole('button', { name: 'Open the folder' })).toBeTruthy();
  },
};

// A manuscript whose headings are numbered ("1." over the chapter's own name): each row is named in that style.
const numbered = ['Down the Rabbit-Hole', 'The Pool of Tears', 'A Caucus-Race', 'Pig and Pepper'].map(
  (subtitle, i) => ({ id: `n${i + 1}`, title: `${i + 1}.`, subtitle, index: i + 1, wordCount: 100, status: 'not_started' }) as unknown as ManuscriptChapter,
);

export const NumberedHeadings: Story = {
  parameters: {
    api: createMockApi({
      manuscriptChapters: async () => numbered,
      measureState: async () => measured([]),
      exportState: async () => encoded,
      packageState: async () => idle,
    }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText('1. — Down the Rabbit-Hole')).toBeTruthy();
    await expect(canvas.getByText('0 of 4')).toBeTruthy();
  },
};

// The opening credits before chapter 1 and the closing credits after the last, each judged by its own file ("Opening credits.wav"), counted in "n of N".
export const WithCredits: Story = {
  parameters: {
    api: host([...all, passing('Opening credits.wav')], idle, [credits('opening'), ...chapters, credits('closing')]),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText('5 of 6')).toBeTruthy();
    await expect(canvas.getByRole('button', { name: 'Opening credits: Pass. Open in Master & QC' })).toBeTruthy();
    await expect(canvas.getByRole('button', { name: 'Closing credits: Not mastered. Open in Master & QC' })).toBeTruthy();
  },
};

export const NoManuscript: Story = {
  args: { hasManuscript: false },
  parameters: { api: host([]) },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText('This project has no manuscript yet. Import one to begin.')).toBeTruthy();
  },
};

const running = {
  ...idle,
  id: 'p2',
  phase: 'running',
  message: 'Building the ACX package.',
  profile: 'acx@2026-09',
  outputDir: 'C:/Deliver/ACX',
} as PackageJob;

// A build started: the busy Build button, Cancel and the bar.
export const Building: Story = {
  parameters: { api: host(all, running) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByRole('button', { name: 'Cancel' })).toBeTruthy();
    await expect(canvas.getByRole('progressbar', { name: 'Building the package' })).toBeTruthy();
  },
};

/** The error toasts the page has raised: errors are toasts, never text in the page's flow (rule 7). */
const errorToasts = () => overlay.getSnapshot().toasts.filter((toast) => toast.tone === 'error');

// The host refused the build: its reason as an error toast, nothing drawn under Build, and nothing listed as written.
export const BuildFailed: Story = {
  parameters: {
    api: host(all, { ...running, phase: 'error', error: 'could not create "C:/Deliver/ACX": access is denied', message: 'The package could not be built.' }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(() => expect(errorToasts().some((toast) => toast.text.includes('access is denied'))).toBe(true));
    await expect(canvas.queryByRole('alert')).toBeNull();
    await expect(canvas.queryByText('Written')).toBeNull();
  },
};

// The measurement cannot be read: the page says it cannot tell in an error toast with Retry, rather than calling every chapter "Not mastered".
export const CannotTell: Story = {
  parameters: {
    api: createMockApi({
      manuscriptChapters: async () => chapters,
      measureState: async () => Promise.reject(new Error('the host did not answer')),
      exportState: async () => encoded,
      packageState: async () => idle,
    }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(() => expect(errorToasts().some((toast) => /Can't tell which chapters pass/.test(toast.text) && toast.action?.label === 'Retry')).toBe(true));
    await expect(canvas.queryByRole('alert')).toBeNull();
    await expect(canvas.queryByText('Not mastered')).toBeNull();
  },
};
