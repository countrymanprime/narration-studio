import { useEffect, useRef } from 'react'
import type { Backup, BookData } from '@/domain/schemas'
import { clock, fmtD, parseIso } from '@/format/time'
import { editGateOf, gateOf } from '@/selectors/daw'
import { chapterSeconds } from '@/selectors/editing'
import { chName } from '@/selectors/chapters'
import type { EditingUi } from '@/state/slices/ui'
import type { MockState } from '@/state/slices/mock'
import { restoreBackup, setBackupSetting } from '@/state/commands/backups'
import { selectRow } from '@/state/commands/editing'
import { Checkbox, FieldRow, IconButton, NumberInput, Pill } from '@/ui/primitives'
import { EDIT_TEXT } from '@/selectors/editing'

const when = (b: Backup): string => fmtD(parseIso(b.at))

/** The audio cloned before punches and edits in this chapter, newest first. */
export function BackupsList({ data, list, sel, setup }: { data: BookData; list: Backup[]; sel: string | null; setup: MockState['setup'] }) {
  const body = useRef<HTMLTableSectionElement>(null)
  useEffect(() => { body.current?.querySelector('tr[aria-selected="true"]')?.scrollIntoView?.({ block: 'nearest' }) }, [sel])
  const gate = gateOf({ setup }, 'backups')
  if (!list.length) return <div className="empty"><h3>{gate.ok ? EDIT_TEXT.noBackups : gate.reason}</h3></div>
  return (
    <table>
      <thead><tr><th>Made</th><th>What</th><th>Covers</th><th>Status</th><th></th></tr></thead>
      <tbody ref={body}>
        {list.map((b) => (
          <tr key={b.id} tabIndex={0} data-bk={b.id} aria-selected={b.id === sel} onClick={() => selectRow(b.id, (b.start + b.end) / 2)}
            onKeyDown={(e) => { if (e.key === 'Enter') selectRow(b.id, (b.start + b.end) / 2) }}>
            <td className="mono">{when(b)}</td>
            <td>{b.label}</td>
            <td className="mono">{clock(b.start)}–{clock(b.end)}</td>
            <td>{b.restored ? <Pill kind="ok">Put back {fmtD(parseIso(b.restored))}</Pill> : <Pill kind="neutral">Kept</Pill>}</td>
            <td><IconButton icon="undo" tip="Put this back" data-bkrestore={b.id} disabled={!gate.ok} onClick={(e) => { e.stopPropagation(); restoreBackup(b.id) }} /></td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/** The backup settings: whether to keep them, how much audio each one clones either side of the change, and how long they are kept. */
export function BackupsInspector({ data, chapterId, ed, setup }: { data: BookData; chapterId: string; ed: EditingUi; setup: MockState['setup'] }) {
  const gate = editGateOf({ setup }, 'backups')
  const d = data.editor
  const b = data.backups.find((x) => x.id === ed.row && x.chapterId === chapterId)
  return (
    <div className="dr-insp">
      <div className="ph"><h2>Backups</h2></div>
      <div className="pb stack">
        <Checkbox id="bkon" label="Keep backups" checked={d.backups} onCheckedChange={(c) => setBackupSetting({ backups: c })} />
        {!d.backups ? <div className="sub" id="bknote">{gateOf({ setup }, 'backups').reason || 'Backups are off.'}</div> : null}
        <FieldRow label="Audio kept either side of a punch or an edit (s)" htmlFor="bkwin">
          <NumberInput id="bkwin" value={d.backupWindow} min={10} max={300} step={10} onValueChange={(v) => setBackupSetting({ backupWindow: v })} />
        </FieldRow>
        <FieldRow label="Keep backups for (days)" htmlFor="bkkeep">
          <NumberInput id="bkkeep" value={d.backupKeepDays} min={1} max={365} step={1} onValueChange={(v) => setBackupSetting({ backupKeepDays: Math.round(v) })} />
        </FieldRow>
        {b ? (
          <>
            <span className="label">Selected</span>
            <div className="stack" style={{ gap: 4 }}>
              <div className="optrow"><span>Chapter</span><span>{chName(data, data.chapters.find((c) => c.id === b.chapterId) ?? data.chapters[0])}</span></div>
              <div className="optrow"><span>What</span><span>{b.label}</span></div>
              <div className="optrow"><span>Covers</span><span className="mono">{clock(b.start)}–{clock(b.end)} of {clock(chapterSeconds(data, b.chapterId))}</span></div>
              <div className="optrow"><span>Made</span><span className="mono">{when(b)}</span></div>
            </div>
            <div className="row"><span className="spacer" /><IconButton icon="undo" tip="Put this back" id="bkput" disabled={!gate.ok} onClick={() => restoreBackup(b.id)} /></div>
          </>
        ) : null}
      </div>
    </div>
  )
}
