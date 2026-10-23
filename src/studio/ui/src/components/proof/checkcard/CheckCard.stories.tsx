import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import { ApiProvider } from '../../../api/ApiContext';
import type { CoverageGap, CoverageResult, CoverageState } from '../../../api/contracts/coverage';
import type { DawCapabilities } from '../../../api/contracts/daw';
import type { Finding } from '../../../api/contracts/findings';
import { createMockApi } from '../../../api/mockApi';
import type { ManuscriptChapter } from '../../../types';
import { CheckCard } from './CheckCard';

// The Proof recording check card (docs/research/mockups/studio-next/src/pages/proof/CheckCard.tsx). It has no route yet: the Proof swap
// mounts it in the single-chapter view.
const chapter: ManuscriptChapter = { id: 'c1', title: 'Chapter 1', index: 1, wordCount: 2400, status: 'recording', recordedSeconds: 910 };
const gap = (id: string, kind: CoverageGap['kind'], at: number, text?: string): CoverageGap => ({
  id,
  kind,
  paragraphIds: ['p1'],
  tokenCount: 3,
  firstWord: 'the',
  lastWord: 'door',
  text,
  position: { itemIndex: 0, itemGuid: 'g', sourceTime: at },
  confidence: null,
  confReason: 'no_word_scores',
});
const gaps = [gap('g1', 'misread', 131), gap('g2', 'missing', 244), gap('g3', 'extra', 402, 'um, right')];
const stored = (state: CoverageResult['state'], reasons: CoverageResult['reasons'] = [], list: CoverageGap[] = gaps): CoverageResult =>
  ({
    chapterId: 'c1',
    state,
    reasons,
    basis: { label: 'saved project', modifiedAt: '2026-09-26T08:40:00', stale: false },
    result: state === 'never' ? undefined : { gaps: list, unfinished: { start: 0, end: list.length ? 2 : 0 }, regions: [], paragraphs: [] },
  }) as unknown as CoverageResult;
const audio = (id: string, kind: string, at: number): Finding =>
  ({
    id,
    category: 'audio_quality',
    evidence: { kind },
    evidence_version: 'v1',
    review: { status: 'unreviewed' },
    time_range: { start: at, end: at + 1 },
    confidence_reason: 'Heard in the recording',
  }) as unknown as Finding;
const heard = [audio('a1', 'noise', 90), audio('a2', 'breath', 310), audio('a3', 'breath', 330), audio('a4', 'mouth_click', 520)];
const caps = { capabilities: { review: { level: 'supported', available: true } } } as unknown as DawCapabilities;

const host = (result: CoverageResult, state?: CoverageState, found: Finding[] = heard) =>
  createMockApi({
    coverageResult: async () => result,
    coverageGapReviews: async () => ({}),
    coverageState: async () => state ?? { phase: 'idle', percent: 0, message: '' },
    subscribeCoverage: () => () => undefined,
    findingsList: async (query) => {
      const list = found.filter((finding) => finding.category === query.category);
      return { findings: list, total: list.length };
    },
    dawCapabilities: async () => caps,
    subscribeDawCapabilities: () => () => undefined,
  });

const meta = {
  title: 'Proof/CheckCard',
  component: CheckCard,
  args: { chapter, onCheck: () => undefined },
  decorators: [
    (Story, { parameters }) => (
      <ApiProvider api={parameters.api}>
        <div className="max-w-[60rem] bg-[var(--bg)] p-4">
          <Story />
        </div>
      </ApiProvider>
    ),
  ],
} satisfies Meta<typeof CheckCard>;

export default meta;
type Story = StoryObj<typeof meta>;
const state = (canvasElement: HTMLElement) => within(canvasElement).getByRole('region', { name: 'Recording check' }).getAttribute('data-check-state');

export const NotChecked: Story = {
  parameters: { api: host(stored('never')) },
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByText('Not checked yet')).toBeTruthy();
    await expect(state(canvasElement)).toBe('none');
  },
};

export const Checking: Story = {
  parameters: { api: host(stored('never'), { phase: 'running', chapterId: 'c1', percent: 42, message: '' }) },
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByRole('progressbar', { name: 'Checking' })).toBeTruthy();
    await expect(within(canvasElement).getByRole('button', { name: 'Cancel' })).toBeTruthy();
  },
};

export const CurrentWithFindings: Story = {
  parameters: { api: host(stored('current')) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    (await canvas.findByRole('button', { name: 'Show the findings' })).click();
    await expect(await canvas.findByText('Check findings · 7')).toBeTruthy();
    await expect(canvas.getByText('Checked against the script: 3 differences found')).toBeTruthy();
  },
};

export const CurrentClean: Story = {
  parameters: { api: host(stored('current', [], []), undefined, []) },
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByText('Checked against the script: no differences found')).toBeTruthy();
  },
};

export const StaleText: Story = {
  parameters: { api: host(stored('stale', ['manuscript_changed'])) },
  play: async ({ canvasElement }) => {
    await expect((await within(canvasElement).findByRole('alert')).textContent).toContain('The text changed since this check');
  },
};

export const StaleRecording: Story = {
  parameters: { api: host(stored('stale', ['item_trimmed'])) },
  play: async ({ canvasElement }) => {
    await expect((await within(canvasElement).findByRole('alert')).textContent).toContain('Recording changed since this check');
  },
};

export const StaleSave: Story = {
  parameters: { api: host(stored('stale', ['project_unreadable'])) },
  play: async ({ canvasElement }) => {
    await expect((await within(canvasElement).findByRole('alert')).textContent).toContain('saved again since this check');
  },
};
