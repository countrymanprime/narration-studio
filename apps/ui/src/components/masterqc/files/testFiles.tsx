// Shared by the tests and the stories: the host's own measure-success fixture, reshaped into the cases the files table draws.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { useState, type ReactNode } from 'react';
import { measureJobSchema } from '../../../api/schemas/measure';
import { ApiProvider } from '../../../api/ApiContext';
import { createMockApi } from '../../../api/mockApi';
import { DAW_SETUPS, type DawSetupId } from '../../../fixtures/daw';
import { createMockDawClient } from '../../../ports/daw';
import { PortOverrides } from '../../../ports/usePort';
import type { DeliveryRuleResult, MeasureFileResult } from '../../../types';
import { FileChecks } from './FileChecks';
import type { FileActions } from './FileActions';
import { FilesTable } from './FilesTable';
import { buildRows } from './rows';

const job = measureJobSchema.parse(
  JSON.parse(readFileSync(join(__dirname, '..', '..', '..', '..', '..', '..', 'tests', 'fixtures', 'contracts', 'measure-success.json'), 'utf8')),
);
export const profile = job.profile!;
const base = job.files.find((file) => file.status === 'measured' && file.rules.some((r) => r.ruleId === 'acx.rms'))!;

const rule = (file: MeasureFileResult, ruleId: string, patch: Partial<DeliveryRuleResult>): MeasureFileResult => ({
  ...file,
  rules: file.rules.map((result) => (result.ruleId === ruleId ? { ...result, ...patch } : result)),
});
const named = (file: MeasureFileResult, name: string): MeasureFileResult => ({ ...file, name, path: `C:/Renders/${name}` });

/** Every file rule met. */
export const passing = (name = 'Chapter 01.wav'): MeasureFileResult =>
  named({ ...base, rules: base.rules.map((r) => (r.status === 'not_met' ? { ...r, status: 'met' as const, violation: undefined } : r)) }, name);

/** The noise floor and the head room tone missed, as the mock's chapter 4 does. */
export const failingTwo = (name = 'Chapter 04.wav'): MeasureFileResult => {
  const file = rule(rule(passing(name), 'acx.noise_floor', { status: 'not_met', value: -57.8, violation: 'above_max' }), 'acx.room_tone_head', {
    status: 'not_met',
    value: 0.4,
    violation: 'below_min',
  });
  return { ...file, report: { ...file.report!, noise_floor_dbfs: -57.8, head_room_tone_seconds: 0.4 } };
};

export const waiting = (name = 'Chapter 03.wav'): MeasureFileResult => ({
  ...named(base, name),
  status: 'pending',
  report: null,
  fingerprint: null,
  findings: [],
  rules: [],
});

export const ALL_PASS = [passing('Chapter 01.wav'), passing('Chapter 02.wav')];
export const TWO_FAIL = [passing('Chapter 01.wav'), passing('Chapter 02.wav'), waiting('Chapter 03.wav'), failingTwo('Chapter 04.wav')];
export const rowsOf = (files: readonly MeasureFileResult[]) => buildRows(files, profile);

const noActions = (): FileActions => ({ onPlayQuietest: () => undefined, onOpenInDaw: () => undefined, onRecheck: () => undefined });

export function Host({ daw = 'reaper', children }: { daw?: DawSetupId; children: ReactNode }) {
  return (
    <ApiProvider api={createMockApi()}>
      <PortOverrides clients={{ daw: createMockDawClient(DAW_SETUPS[daw], { chapterIds: [], candidateIds: [], findingIds: [] }) }}>{children}</PortOverrides>
    </ApiProvider>
  );
}

/** The table and its detail with a selection of their own, as the page that mounts them holds it. */
export function FilesDemo({
  files,
  actions = noActions(),
  initial,
  onSelected,
}: {
  files: readonly MeasureFileResult[];
  actions?: FileActions;
  initial?: string;
  onSelected?: (id: string) => void;
}) {
  const [selected, setSelected] = useState<string | undefined>(initial);
  const pick = (id: string) => {
    setSelected(id);
    onSelected?.(id);
  };
  const rows = rowsOf(files);
  const current = selected === undefined ? undefined : rows.find((row) => row.id === selected);
  return (
    <div className="flex flex-col gap-4">
      <FilesTable files={files} profile={profile} selected={selected} onSelect={pick} actions={actions} />
      <FileChecks
        row={current ?? (selected === undefined ? undefined : undefined)}
        chapterLabel={selected !== undefined && !current ? 'Chapter 09' : undefined}
        actions={actions}
      />
    </div>
  );
}
