/**
 * Backups (Audacity keeps no takes of its own). Before a punch or an edit the audio around it is cloned: about a minute or two either
 * side (the window is a setting), kept for as long as the retention setting says. A backup can be put back, which is how a punch is
 * rolled back later. With backups on, Audacity's roll no longer loses anything.
 */
import type { Backup } from '@/domain/schemas'
import { guidOf } from '@/format/guid'
import { capOf, lastEnd } from '@/selectors/daw'
import { backupsDue } from '@/selectors/backups'
import { toast, toastUndo } from '@/ui/overlay'
import { daw } from '../daw'
import { act, getState, update } from '../store'

/**
 * Clone the audio around `sec` in the chapter's recording before it is changed. `limit` is where the audio ends if it is not yet on the
 * track (a take that is still recording). `span` is a stretch that will change (stacked takes): the window is kept either side of all of it. Returns the backup, or null when there is nothing to back up or the DAW has no backups.
 */
export function backupBefore(chapterId: string, sec: number, label: string, limit?: number, span?: { start: number; end: number }): Backup | null {
  const s = getState()
  const cap = capOf(s.mock, 'backups')
  if (!cap?.available) return null
  const w = s.data.editor.backupWindow
  const track = daw().tracks().find((t) => t.chapterId === chapterId)
  const top = Math.max(lastEnd(track), limit ?? 0)
  const start = Math.max(0, Math.round((span?.start ?? sec) - w))
  const end = Math.min(top, Math.round((span?.end ?? sec) + w))
  if (end <= start) return null
  const n = s.data.backups.reduce((m, b) => Math.max(m, +b.id.replace(/\D/g, '') || 0), 0) + 1
  const id = 'bk' + n
  const guid = guidOf('backup', id + '/' + chapterId)
  const r = daw().backupAround(guid, chapterId, start, end)
  if (r.refused) { toast(r.refused); return null }
  const backup: Backup = { id, chapterId, guid, start, end, at: s.data.today, label }
  update((d) => { d.data.backups.push(backup) })
  pruneBackups()
  return backup
}

/** Drop backups older than the retention setting. Returns how many went. */
export function pruneBackups(): number {
  const { data } = getState()
  const old = backupsDue(data)
  if (old.length) update((d) => { d.data.backups = d.data.backups.filter((b) => !old.includes(b.id)) })
  return old.length
}

/** Put a backup's audio back in the DAW. One undo step; the backup stays, marked as put back today. */
export function restoreBackup(id: string): boolean {
  const s = getState()
  const b = s.data.backups.find((x) => x.id === id)
  if (!b) return false
  const r = daw().restoreBackup(b.guid)
  if (r.refused) { toast(r.refused); return false }
  const e = act('Put back ' + b.label, (d) => { const x = d.data.backups.find((y) => y.id === id); if (x) x.restored = d.data.today }, { daw: true })
  toastUndo(r.message, e, 8000)
  return true
}

export type BackupSettings = { backups: boolean; backupWindow: number; backupKeepDays: number }
export function setBackupSetting(patch: Partial<BackupSettings>): void {
  update((d) => { Object.assign(d.data.editor, patch) })
  if (patch.backupKeepDays != null) pruneBackups()
}
