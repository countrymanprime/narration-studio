import { useEffect, useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, within } from 'storybook/test';
import { ApiProvider } from '../../../api/ApiContext';
import { createMockApi } from '../../../api/mockApi';
import { DAW_SETUPS, type DawSetupId } from '../../../fixtures/daw';
import type { DawClient } from '../../../ports';
import { createMockDawClient } from '../../../ports/daw';
import { PortOverrides } from '../../../ports/usePort';
import type { Finding } from '../../../types';
import { Inspector, type InspectorHostApi } from './Inspector';
import { inspectorFinding } from './testFinding';

const placed = (overrides: Partial<Finding> = {}) =>
  inspectorFinding({
    source: { item_guid: 'g1' },
    time_range: { start: 134.6, end: 136, source_start: 134, source_end: 135 },
    manuscript: { expected: 'I could not help it', recorded: 'I could not help myself', chapter_id: 'chapter-1' },
    ...overrides,
  });

const api: InspectorHostApi = {
  findingsGet: async (id) => inspectorFinding({ id }),
  findingsReview: async (request) => inspectorFinding({ id: request.id, review: { status: request.status, note: request.note } }),
  findingsGoTo: async () => ({ outcome: 'navigated', projectTime: 134.6 }),
  findingsThread: async (id, change) =>
    inspectorFinding({
      id,
      review: { status: 'unreviewed', thread: change.op === 'add' ? [{ id: 'm1', who: change.who, text: change.text, at: '2026-10-13T10:00:00Z' }] : [] },
    }),
};

const daw = (setup: DawSetupId): DawClient => createMockDawClient(DAW_SETUPS[setup], { chapterIds: ['chapter-1'], candidateIds: [], findingIds: ['f1'] });

// The Studio Next Inspector (docs/research/mockups/studio-next/src/pages/proof/Inspector.tsx) without the takes section and the type select,
// which arrive through the `spot` and `typeControl` slots. The column is about 24 rem wide.
const meta = {
  title: 'Proof/Inspector',
  component: Inspector,
  args: { finding: placed(), api, order: ['f1', 'f2'], onSelect: fn(), onChanged: fn(), onOpenScript: fn(), onOpenBooth: fn() },
  decorators: [
    (Story, context) => (
      <ApiProvider api={createMockApi()}>
        <PortOverrides clients={{ daw: daw((context.parameters.daw as DawSetupId | undefined) ?? 'reaper') }}>
          <div className="max-w-sm bg-[var(--surface)] p-3">
            <Story />
          </div>
        </PortOverrides>
      </ApiProvider>
    ),
  ],
} satisfies Meta<typeof Inspector>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Undecided: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('group', { name: 'Resolution' })).toBeTruthy();
    await expect(canvas.getByText('Confidence 0.90')).toBeTruthy();
  },
};

export const DecidedWithANote: Story = {
  args: { finding: placed({ review: { status: 'accepted', note: 'Re-record the last three words.' } }) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('button', { name: 'Reopen' })).toBeTruthy();
    await expect((canvas.getByRole('textbox') as HTMLTextAreaElement).value).toBe('Re-record the last three words.');
  },
};

// A re-check heard something else under the narrator: the banner is up and every decision and step is inert.
function Rechecked(args: React.ComponentProps<typeof Inspector>) {
  const [finding, setFinding] = useState(args.finding);
  useEffect(() => {
    setFinding(
      placed({ evidence_version: 'v2', manuscript: { expected: 'I could not help it', recorded: 'I could not help it at all', chapter_id: 'chapter-1' } }),
    );
  }, []);
  return <Inspector {...args} finding={finding} />;
}

export const EvidenceChanged: Story = {
  render: (args) => <Rechecked {...args} />,
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByRole('alert')).toBeTruthy();
  },
};

export const NoConfidence: Story = {
  args: { finding: placed({ confidence: null, confidence_reason: 'The recording was too noisy to score.' }) },
};

export const DawUnavailable: Story = {
  parameters: { daw: 'builtin' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText(DAW_SETUPS.builtin.capabilities.navigate.message!)).toBeTruthy();
  },
};
