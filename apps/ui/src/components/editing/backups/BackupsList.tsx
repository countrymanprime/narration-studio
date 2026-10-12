import type { DawBackup } from '../../../api/contracts/daw';
import { IconButton } from '../../primitives/IconButton';
import { StatusBadge } from '../../primitives/StatusBadge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../primitives/Table';
import { clock } from '../bar/clock';
import { BACKUPS_TEXT, dayOf, putBackOn } from './backupsText';
import type { BackupsGate } from './useBackups';

function Status({ backup, missing }: { backup: DawBackup; missing: boolean }) {
  if (missing) return <StatusBadge tone="danger" label={BACKUPS_TEXT.missing} />;
  if (backup.restored) return <StatusBadge tone="success" label={putBackOn(dayOf(backup.restored))} />;
  return <StatusBadge tone="neutral" label={BACKUPS_TEXT.kept} />;
}

/** The audio cloned before punches and edits in this chapter, newest first: when, what for, the stretch it covers, and Put this back. */
export function BackupsList({
  list,
  gate,
  missing,
  selectedId,
  onSelect,
  onRestore,
}: {
  list: readonly DawBackup[];
  gate: BackupsGate;
  missing: ReadonlySet<string>;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onRestore: (id: string) => void;
}) {
  if (!list.length) {
    return (
      <div className="py-6 text-center">
        <h3 className="m-0 text-base font-semibold text-[var(--text-muted)]">{gate.ok ? BACKUPS_TEXT.none : gate.reason || BACKUPS_TEXT.off}</h3>
      </div>
    );
  }
  const reason = gate.ok ? undefined : gate.reason || BACKUPS_TEXT.off;
  return (
    <Table label="Backups of this chapter">
      <TableHead>
        <TableRow>
          <TableHeader align="left">Made</TableHeader>
          <TableHeader align="left">What</TableHeader>
          <TableHeader align="left">Covers</TableHeader>
          <TableHeader align="left">Status</TableHeader>
          <TableHeader hiddenLabel="Put back" />
        </TableRow>
      </TableHead>
      <TableBody>
        {list.map((b) => (
          <TableRow key={b.id} selected={b.id === selectedId} onActivate={() => onSelect(b.id)}>
            <TableCell numeric align="left">
              {dayOf(b.createdAt)}
            </TableCell>
            <TableCell>{b.label ?? ''}</TableCell>
            <TableCell numeric align="left">
              {clock(b.start)}–{clock(b.end)}
            </TableCell>
            <TableCell>
              <Status backup={b} missing={missing.has(b.id)} />
            </TableCell>
            <TableCell>
              <IconButton action="undo" label={BACKUPS_TEXT.restore} size="sm" data-bkrestore={b.id} disabledReason={reason} onClick={() => onRestore(b.id)} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
