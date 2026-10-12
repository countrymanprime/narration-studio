import { useState } from 'react';
import type { Journal } from '../../../studio/journal/createJournal';
import { BackupsInspector } from './BackupsInspector';
import { BackupsList } from './BackupsList';
import { useBackups } from './useBackups';
import { useBackupSettings } from './useBackupSettings';

export interface BackupsTabProps {
  chapterId: string;
  chapterName: string;
  /** The chapter's length, in seconds. */
  total: number;
  journal: Pick<Journal, 'act'>;
}

/** The Backups tab: the chapter's backups, newest first, and the settings with the one picked in the list. */
export function BackupsTab({ chapterId, chapterName, total, journal }: BackupsTabProps) {
  const backups = useBackups(journal, chapterId);
  const settings = useBackupSettings();
  const [pick, setPick] = useState<string | null>(null);
  const current = backups.list.find((b) => b.id === pick) ?? null;
  const restore = (id: string) => void backups.restore(id);
  return (
    <div className="flex flex-col gap-4">
      <BackupsList list={backups.list} gate={backups.gate} missing={backups.missing} selectedId={current?.id ?? null} onSelect={setPick} onRestore={restore} />
      <BackupsInspector settings={settings} gate={backups.gate} backup={current} chapterName={chapterName} total={total} onRestore={restore} />
    </div>
  );
}
