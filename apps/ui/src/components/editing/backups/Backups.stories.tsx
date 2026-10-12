import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, within } from 'storybook/test';
import type { DawBackup } from '../../../api/contracts/daw';
import { BackupsInspector } from './BackupsInspector';
import { BackupsList } from './BackupsList';
import { BACKUP_SETTING_FIELDS } from './backupsFixtures';
import type { BackupsGate } from './useBackups';
import { backupSettingsOf } from './useBackupSettings';

// The Studio Next mock's Backups tab (BackupsTab.tsx): the list of backups, newest first, and the inspector with the settings and the picked one.

const LIST: DawBackup[] = [
  { id: '{bk-3}', guid: 'chapter-1', chapterId: 'chapter-1', start: 190, end: 430, createdAt: '2026-10-12T09:33:00Z', label: 'Roll at ¶ 3' },
  {
    id: '{bk-2}',
    guid: 'chapter-1',
    chapterId: 'chapter-1',
    start: 0,
    end: 134,
    createdAt: '2026-10-11T15:02:00Z',
    label: 'Trim white space',
    restored: '2026-10-12T08:10:00Z',
  },
  { id: '{bk-1}', guid: 'chapter-1', chapterId: 'chapter-1', start: 300, end: 541, createdAt: '2026-10-09T11:20:00Z', label: 'Delete words' },
];

const ON: BackupsGate = { ok: true };
const OFF: BackupsGate = { ok: false, reason: 'Turned off in Settings.' };

const shell = (children: React.ReactNode, width = 520) => (
  <div style={{ width, maxWidth: '100%' }} className="flex flex-col gap-4 bg-[var(--surface)] p-3 text-[var(--text)]">
    {children}
  </div>
);

const settingsOf = (keep: boolean) => ({
  settings: { ...backupSettingsOf({ DAW: [...BACKUP_SETTING_FIELDS] })!, keep },
  error: '',
  setKeep: fn(),
  setWindow: fn(),
  setRetention: fn(),
});

const meta = { title: 'Editing/Backups', parameters: { layout: 'padded' } } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

const list = (rows: DawBackup[], gate: BackupsGate = ON, missing: string[] = [], width = 520) =>
  shell(<BackupsList list={rows} gate={gate} missing={new Set(missing)} selectedId={rows[0]?.id ?? null} onSelect={fn()} onRestore={fn()} />, width);

export const ListNone: Story = { render: () => list([]) };
export const ListOff: Story = { render: () => list([], OFF) };
export const ListMany: Story = {
  render: () => list(LIST),
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getAllByRole('button', { name: 'Put this back' })).toHaveLength(3);
  },
};
export const ListNarrow: Story = { render: () => list(LIST, ON, [], 320) };
/** A restore the DAW refused because it no longer holds the clone: the row is marked missing. */
export const ListRestoreRefused: Story = { render: () => list(LIST, ON, ['{bk-3}']) };

const inspector = (keep: boolean, gate: BackupsGate, backup: DawBackup | null, width = 360) =>
  shell(<BackupsInspector settings={settingsOf(keep)} gate={gate} backup={backup} chapterName="Chapter 1" total={1260} onRestore={fn()} />, width);

export const InspectorSettings: Story = { render: () => inspector(true, ON, null) };
export const InspectorSelected: Story = { render: () => inspector(true, ON, LIST[0]!) };
export const InspectorOff: Story = { render: () => inspector(false, OFF, LIST[0]!) };
export const InspectorNarrow: Story = { render: () => inspector(true, ON, LIST[0]!, 280) };
