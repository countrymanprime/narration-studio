import { useCallback, useEffect, useState } from 'react';
import type { DawBackup, DawCapabilities, DawResult } from '../../../api/contracts/daw';
import { overlay } from '../../../overlay/overlayService';
import type { DawClient } from '../../../ports/daw';
import { usePort } from '../../../ports/usePort';
import type { Command, Journal } from '../../../studio/journal/createJournal';
import { restoredText } from './backupsText';

/** Whether the DAW can back up and restore now, and its own sentence when it cannot. */
export type BackupsGate = { ok: true } | { ok: false; reason: string };

function gateOf(caps: DawCapabilities | null): BackupsGate {
  const support = caps?.capabilities['backups'];
  if (support?.available) return { ok: true };
  return { ok: false, reason: support?.message ?? '' };
}

const why = (e: unknown): string => (e instanceof Error ? e.message : String(e));
const failed = (e: unknown): DawResult => ({ ok: false, changed: false, message: why(e), undoSteps: 0, refused: why(e) });

/**
 * Puts a backup's audio back in the DAW as one history entry. The DAW makes it one undo step of its own; the app cannot take it back (the
 * undo-inverse table, row 1), so the entry has no inverse and says where to undo it. A refusal journals nothing.
 */
function restoreCommand(daw: Pick<DawClient, 'restoreBackup'>, backup: DawBackup, dawName: string): Command<DawResult> {
  return {
    label: `Put back ${backup.label ?? 'a backup'}`,
    touches: [`daw/backups/${backup.id}`],
    daw: true,
    async run() {
      const res = await daw.restoreBackup(backup.id).catch(failed);
      if (!res.ok) return { ok: false, refusal: { code: res.code ?? 'daw_refused', reason: res.refused ?? res.message } };
      return { ok: true, value: res };
    },
    notUndoableReason: `Undo it in ${dawName}.`,
  };
}

export interface BackupsState {
  /** This chapter's backups, newest first. */
  list: readonly DawBackup[];
  gate: BackupsGate;
  /** Backups the DAW refused to put back because it no longer holds them. */
  missing: ReadonlySet<string>;
  restore: (id: string) => Promise<void>;
  /** Reads the table again, for after the host pruned it. */
  reload: () => void;
}

/**
 * The chapter's backups from the DAW's table, and Restore. Reading the table never prunes it: the host drops the backups older than the
 * retention setting, with their clones, when the project opens and when a shorter retention is saved (reload reads the table again then).
 */
export function useBackups(journal: Pick<Journal, 'act'>, chapterId: string): BackupsState {
  const daw = usePort('daw');
  const [caps, setCaps] = useState<DawCapabilities | null>(null);
  const [rows, setRows] = useState<readonly DawBackup[]>([]);
  const [missing, setMissing] = useState<ReadonlySet<string>>(new Set());
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let live = true;
    daw.capabilities().then(
      (c) => live && setCaps(c),
      () => live && setCaps(null),
    );
    daw.backups().then(
      (all) => live && setRows(all.filter((b) => b.chapterId === chapterId)),
      (e) => live && overlay.toast(why(e), { tone: 'error' }),
    );
    return () => {
      live = false;
    };
  }, [daw, chapterId, version]);

  const gate = gateOf(caps);
  const dawName = caps?.daw ?? 'the DAW';

  const restore = useCallback(
    async (id: string) => {
      const backup = rows.find((b) => b.id === id);
      if (!backup) return;
      const done = await journal.act(restoreCommand(daw, backup, dawName));
      if (done.ok) {
        overlay.toast(restoredText(done.value.value.message, dawName));
      } else {
        overlay.toast(done.refusal.reason, { tone: 'error' });
        if (gate.ok) setMissing((m) => new Set(m).add(id));
      }
      setVersion((v) => v + 1);
    },
    [daw, journal, rows, dawName, gate.ok],
  );

  const reload = useCallback(() => setVersion((v) => v + 1), []);

  return { list: rows, gate, missing, restore, reload };
}
