import type { Meta, StoryObj } from '@storybook/react-vite';
import { useEffect, useState, type ReactNode } from 'react';
import { expect, fn, userEvent, within } from 'storybook/test';
import type { ExtractionScanJob, ExtractionSuggestion } from '../../../../api/contracts/extraction';
import { createMockApi } from '../../../../api/mockApi';
import { EntryVerifyPill } from './EntryVerifyPill';
import { ImportButton } from './ImportButton';
import { LooseSuggestionRows } from './LooseSuggestionRows';
import { NeedsVerificationChip } from './NeedsVerificationChip';
import { ScanButton } from './ScanButton';
import { unattached } from '../row/selectors';
import type { ExtractionScan } from './useSuggestions';

// SN-X42: the pieces of the Story Bible page that come from extraction, drawn with props and the mock host's fixture suggestions. The
// mock page they follow is Bible.tsx in the Studio Next mock (the header buttons, the "Needs verification · N" chip, the loose rows).

const meta = { title: 'Story Bible/Extraction panel', component: NeedsVerificationChip, args: { count: 7, on: false, onToggle: fn() } } satisfies Meta<
  typeof NeedsVerificationChip
>;
export default meta;
type Story = StoryObj<typeof meta>;

function Surface({ children }: { children: ReactNode }) {
  return <div className="max-w-md rounded-[var(--radius-card)] bg-[var(--surface)] p-4">{children}</div>;
}

// The chip is off with suggestions waiting; pressing it turns the filter on.
export const ChipOff: Story = {
  render: function Render(args) {
    const [on, setOn] = useState(args.on);
    return (
      <Surface>
        <NeedsVerificationChip count={args.count} on={on} onToggle={setOn} />
      </Surface>
    );
  },
  play: async ({ canvasElement }) => {
    const chip = within(canvasElement).getByRole('button', { name: 'Needs verification · 7' });
    await expect(chip).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(chip);
    await expect(chip).toHaveAttribute('aria-pressed', 'true');
  },
};

export const ChipOn: Story = {
  render: (args) => (
    <Surface>
      <NeedsVerificationChip {...args} on />
    </Surface>
  ),
};

// Nothing waits but the filter is still on: the chip stays so it can be turned off.
export const ChipZeroButOn: Story = {
  render: (args) => (
    <Surface>
      <NeedsVerificationChip {...args} count={0} on />
    </Surface>
  ),
};

export const EntryPills: Story = {
  render: () => (
    <Surface>
      <div className="flex gap-2">
        <EntryVerifyPill verify={3} flagged />
        <EntryVerifyPill verify={0} flagged />
      </div>
    </Surface>
  ),
};

function Loose({ pick }: { pick?: boolean }) {
  const [list, setList] = useState<ExtractionSuggestion[]>();
  const [chosen, setChosen] = useState<string | null>(null);
  useEffect(() => {
    void createMockApi()
      .extractionList()
      .then((all) => setList(unattached(all)));
  }, []);
  if (!list) return null;
  return (
    <Surface>
      <ul>
        <LooseSuggestionRows suggestions={list} selectedId={pick ? (chosen ?? list[0]?.id ?? null) : chosen} onSelect={setChosen} />
      </ul>
    </Surface>
  );
}

// Suggestions with no entry yet, above the entries: summary, a percent or "No score", and the kind line.
export const LooseRows: Story = { render: () => <Loose /> };
export const LooseRowChosen: Story = { render: () => <Loose pick /> };

const job = (over: Partial<ExtractionScanJob>): ExtractionScanJob => ({
  id: 'scan-1',
  kind: 'extraction_scan',
  phase: 'idle',
  message: 'Ready to scan the manuscript.',
  percent: 0,
  logs: [],
  elapsed: 0,
  sources: ['rules'],
  added: 0,
  skipped: 0,
  ...over,
});
const scanOf = (j: ExtractionScanJob | null, over: Partial<ExtractionScan> = {}): ExtractionScan => ({
  job: j,
  starting: false,
  running: j?.phase === 'running',
  start: fn(async () => {}),
  cancel: fn(async () => {}),
  ...over,
});
const scanStory = (scan: ExtractionScan): Story => ({
  render: () => (
    <Surface>
      <div className="flex items-start gap-2">
        <ScanButton scan={scan} />
        <ImportButton onImport={fn()} />
      </div>
    </Surface>
  ),
});

export const ScanIdle: Story = {
  ...scanStory(scanOf(job({}))),
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('button', { name: 'Scan the manuscript for suggestions' })).not.toHaveAttribute('aria-busy');
    await expect(within(canvasElement).queryByRole('button', { name: 'Cancel scan' })).toBeNull();
  },
};
// The host's own percent and message (ADR 0015), with Cancel (ADR 0076).
export const ScanRunning: Story = scanStory(scanOf(job({ phase: 'running', percent: 40, message: 'Scanning with Rules (1 of 2).' })));
export const ScanCancelling: Story = scanStory(scanOf(job({ phase: 'running', percent: 40, message: 'Stopping the scan.' })));
export const ScanFailedSource: Story = scanStory(
  scanOf(job({ phase: 'success', percent: 100, message: '4 suggestions added.', logs: ['Skipped GLiNER: the model could not be loaded.'] })),
);
