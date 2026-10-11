import type { Backup, BookData } from '@/domain/schemas'
import { diffDays, parseIso } from '@/format/time'

/** Backups newest first. */
export const backupsOf = (b: BookData, chapterId?: string): Backup[] =>
  b.backups.filter((x) => chapterId == null || x.chapterId === chapterId).slice().sort((a, c) => (a.at < c.at ? 1 : a.at > c.at ? -1 : +c.id.slice(2) - +a.id.slice(2)))

/** Ids of the backups that are older than the retention setting allows. */
export const backupsDue = (b: Pick<BookData, 'backups' | 'editor' | 'today'>): string[] =>
  b.backups.filter((x) => diffDays(parseIso(b.today), parseIso(x.at)) > b.editor.backupKeepDays).map((x) => x.id)
