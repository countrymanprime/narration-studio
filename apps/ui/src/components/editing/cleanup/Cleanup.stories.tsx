import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, within } from 'storybook/test';
import { ApiProvider } from '../../../api/ApiContext';
import { createMockApi } from '../../../api/mockApi';
import { DAW_SETUPS } from '../../../fixtures/daw';
import { createJournal } from '../../../studio/journal/createJournal';
import { previewOf } from './cleanupApply';
import { FINDINGS } from './cleanupFixtures';
import { CLEANUP_OPS, initialParams, opSpec, type CleanupKind, type CleanupParams } from './cleanupOps';
import { countsOf, proposals } from './cleanupRows';
import { CleanupHeader } from './CleanupHeader';
import { CleanupInspector, type CleanupInspectorProps } from './CleanupInspector';
import { CleanupList } from './CleanupList';
import { CleanupTab } from './CleanupTab';

const params = initialParams();

const shell = (children: React.ReactNode, width = 420) => (
  <div style={{ width }} className="bg-[var(--surface)] text-[var(--text)]">
    {children}
  </div>
);

const inspector = (kind: CleanupKind, over: Partial<CleanupInspectorProps> = {}, p: CleanupParams = params[kind]): CleanupInspectorProps => {
  const rows = proposals(FINDINGS, kind, p);
  const on = rows.filter((r) => !r.done);
  return {
    kind,
    params: p,
    open: on.length,
    fixed: rows.length - on.length,
    selected: on.length,
    advanced: false,
    onAdvanced: fn(),
    onLevel: fn(),
    onParam: fn(),
    noiseFloor: { ok: true, value: -58 },
    dawReason: null,
    preview: null,
    onPreview: fn(),
    onApply: fn(),
    ...over,
  };
};

const api = {
  ...createMockApi(),
  findingsList: async () => ({ findings: FINDINGS, total: FINDINGS.length }),
  editingCandidates: async () => FINDINGS,
  dawCapabilities: async () => DAW_SETUPS.reaper,
};

const meta = { title: 'Editing/Cleanup', parameters: { layout: 'padded' } } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

export const Header: Story = {
  render: () => shell(<CleanupHeader counts={countsOf(FINDINGS, params)} op="gaps" onOp={fn()} />),
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('button', { name: 'Gaps 2' })).toBeTruthy();
  },
};

export const List: Story = {
  render: () =>
    shell(<CleanupList kind="gaps" rows={proposals(FINDINGS, 'gaps', params.gaps)} params={params.gaps} skip={[]} onToggle={fn()} onToggleAll={fn()} />),
};

export const ListEmpty: Story = {
  render: () => shell(<CleanupList kind="gaps" rows={[]} params={params.gaps} skip={[]} onToggle={fn()} onToggleAll={fn()} />),
};

export const ListPartlySelected: Story = {
  render: () => {
    const rows = proposals(FINDINGS, 'gaps', { limit: 0.5 });
    return shell(<CleanupList kind="gaps" rows={rows} params={{ limit: 0.5 }} skip={[rows[0]?.key ?? '']} onToggle={fn()} onToggleAll={fn()} />);
  },
};

export const InspectorLight: Story = { render: () => shell(<CleanupInspector {...inspector('gaps', {}, opSpec('gaps').levels.light)} />) };
export const InspectorStandard: Story = { render: () => shell(<CleanupInspector {...inspector('gaps')} />) };
export const InspectorHeavy: Story = { render: () => shell(<CleanupInspector {...inspector('gaps', {}, opSpec('gaps').levels.heavy)} />) };
export const InspectorAdvanced: Story = {
  render: () => shell(<CleanupInspector {...inspector('breaths', { advanced: true })} />),
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('textbox', { name: 'Reduce by (dB)' })).toBeTruthy();
  },
};
export const InspectorCustom: Story = {
  render: () => shell(<CleanupInspector {...inspector('breaths', { advanced: true }, { above: -23, reduce: 9 })} />),
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('button', { name: 'Custom' }).getAttribute('aria-pressed')).toBe('true');
  },
};
export const InspectorNoise: Story = { render: () => shell(<CleanupInspector {...inspector('noise')} />) };
export const InspectorNoiseNotMeasured: Story = {
  render: () =>
    shell(<CleanupInspector {...inspector('noise', { noiseFloor: { ok: false, reason: 'no measurement of this chapter reports a noise floor yet.' } })} />),
};
export const InspectorDawOff: Story = {
  render: () => shell(<CleanupInspector {...inspector('gaps', { dawReason: 'REAPER is not running.' })} />),
};
export const InspectorNoDawCommand: Story = { render: () => shell(<CleanupInspector {...inspector('clicks')} />) };

export const Preview: Story = {
  render: () => {
    const rows = proposals(FINDINGS, 'gaps', params.gaps);
    return shell(<CleanupInspector {...inspector('gaps', { preview: previewOf('gaps', rows, params.gaps, 'REAPER') })} />);
  },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('region', { name: 'Preview' })).toBeTruthy();
  },
};

export const PreviewPlaying: Story = {
  render: () => {
    const rows = proposals(FINDINGS, 'gaps', params.gaps);
    const note = { text: 'Playing the first 2 of 2 selected, with 2 s before and after.', playing: true };
    return shell(
      <CleanupInspector {...inspector('gaps', { preview: previewOf('gaps', rows, params.gaps, 'REAPER'), previewNote: note, onStopPreview: fn() })} />,
    );
  },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('button', { name: 'Stop preview' })).toBeTruthy();
  },
};

export const PreviewNoPlayback: Story = {
  render: () =>
    shell(<CleanupInspector {...inspector('gaps', { previewNote: { text: 'Nothing can play here: this page has no playback.', playing: false } })} />),
};

export const Tab: Story = {
  render: () => (
    <ApiProvider api={api as ReturnType<typeof createMockApi>}>
      {shell(<CleanupTab chapterId="5" journal={createJournal({ dawName: () => 'REAPER', dawLastAction: async () => 'this' })} />)}
    </ApiProvider>
  ),
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByRole('button', { name: 'Gaps 2' })).toBeTruthy();
    await expect(CLEANUP_OPS).toHaveLength(5);
  },
};
