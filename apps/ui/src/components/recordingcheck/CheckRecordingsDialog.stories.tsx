import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import { ApiProvider } from '../../api/ApiContext';
import { createMockApi } from '../../api/mockApi';
import type { CoverageResult, CoverageStartResult } from '../../api/contracts/coverage';
import type { ManuscriptChapter } from '../../api/contracts/manuscript';
import type { NarrationApi } from '../../types';
import { CheckRecordingsDialog } from './CheckRecordingsDialog';

// The Check recordings dialog body (docs/research/mockups/studio-next/src/pages/pickups/CheckRecordings.tsx). It has no opener yet: the Proof,
// Pickups and Production swaps call `openCheckRecordings`.
const chapter = (index: number, extra: Partial<ManuscriptChapter> = {}): ManuscriptChapter => ({
  id: `c${index}`,
  title: `Chapter ${index}`,
  index,
  wordCount: 2400,
  status: 'recording',
  recordedSeconds: 900 + index * 60,
  ...extra,
});
const chapters = [chapter(1), chapter(2), chapter(3), chapter(4, { recordedSeconds: undefined, recordedFraction: 0.4 }), chapter(5, { recordedSeconds: 0 })];
const stored = (state: CoverageResult['state'], gaps: number, unfinished: { start: number; end: number }): CoverageResult =>
  ({
    chapterId: 'x',
    state,
    reasons: [],
    result: {
      model: 'small',
      paragraphs: Array.from({ length: 6 }, (_, i) => ({ id: `p${i}`, tokens: 1, present: 1, longestMissingRun: 0 })),
      gaps: Array.from({ length: gaps }, (_, i) => ({ id: `g${i}` })),
      unfinished,
    },
  }) as unknown as CoverageResult;
const results: Record<string, CoverageResult> = { c1: stored('current', 2, { start: 0, end: 2 }), c2: stored('stale', 0, { start: 0, end: 0 }) };
const engines = {
  default: 'small',
  engines: [
    { id: 'tiny', label: 'Whisper tiny', family: 'whisper' as const, installState: 'installed' as const },
    { id: 'small', label: 'Whisper small', family: 'whisper' as const, installState: 'installed' as const },
    { id: 'large', label: 'Whisper large', family: 'whisper' as const, installState: 'not_installed' as const },
  ],
};
const running = (id: string): CoverageStartResult => ({
  status: 'started',
  state: { runId: `run-${id}`, chapterId: id, phase: 'running', percent: 37, message: 'Transcribing' },
});

const host = (overrides: Partial<NarrationApi> = {}) =>
  createMockApi({
    manuscriptChapters: async () => chapters,
    coverageEngines: async () => engines,
    coverageResult: async (id) => results[id] ?? { chapterId: id, state: 'never', reasons: [] },
    subscribeCoverage: () => () => undefined,
    ...overrides,
  });

const meta = {
  title: 'RecordingCheck/CheckRecordingsDialog',
  component: CheckRecordingsDialog,
  args: { preselected: ['c1', 'c2'], close: () => undefined },
  decorators: [
    (Story, { parameters }) => (
      <ApiProvider api={parameters.api}>
        <div className="max-w-[60rem] bg-[var(--bg)] p-4">
          <Story />
        </div>
      </ApiProvider>
    ),
  ],
} satisfies Meta<typeof CheckRecordingsDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const IdleWithStates: Story = {
  parameters: { api: host() },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText('small · 2 lines to redo · read 4 of 6 paragraphs')).toBeTruthy();
    await expect(canvas.getByRole('button', { name: 'Check 2 chapters' })).toBeTruthy();
  },
};

export const RunningTwoChapters: Story = {
  parameters: { api: host({ coverageStart: async (id) => running(id) }) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    (await canvas.findByRole('button', { name: 'Check 2 chapters' })).click();
    await expect(await canvas.findByRole('button', { name: 'Stop' })).toBeTruthy();
    await expect(canvas.getAllByRole('progressbar')).toHaveLength(2);
  },
};

export const RefusedChapter: Story = {
  args: { preselected: ['c1'] },
  parameters: {
    api: host({ coverageStart: async () => ({ status: 'refused', reason: 'unmapped', message: 'Link a REAPER track to this chapter first.' }) }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    (await canvas.findByRole('button', { name: 'Check 1 chapter' })).click();
    await expect(await canvas.findByText('Link a REAPER track to this chapter first.')).toBeTruthy();
  },
};

export const NoRecordedChapters: Story = {
  args: { preselected: [] },
  parameters: { api: host({ manuscriptChapters: async () => [chapter(5, { recordedSeconds: 0 })] }) },
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByText('No chapter has a recording to check yet.')).toBeTruthy();
  },
};
