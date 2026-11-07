import { useCallback, useRef } from 'react';
import { apiErrorMessage } from '../../../api/errorMessage';
import { useOverlay } from '../../../overlay/OverlayProvider';
import { usePort } from '../../../ports/usePort';
import { decideLinked, restoreLinked, type LinkedChange } from '../../../studio/commands/reviewFinding';
import { useJournalOrOwn } from '../../../studio/StudioProvider';
import type { Result } from '../../../studio/journal/createJournal';
import { keptLines, suspectedLines, toFlagSave, type SuspectedFlag } from './suspectedLinesModel';

/**
 * A take that stopped: the paragraphs it read. `quiet`: the narrator is leaving, no toast. `saidSaved`: another toast already said the take is
 * saved. `undoTake` and `entry`: the take's history entry when a DAW stopped it and this toast is the one that says so; its Undo takes the take
 * back in the DAW before the lines.
 */
export type SuspectedTake = {
  paragraphIds: ReadonlySet<string>;
  quiet?: boolean;
  saidSaved?: boolean;
  undoTake?: () => Promise<Result<unknown>>;
  entry?: number;
};

const lines = (n: number) => `${n} suspected ${n === 1 ? 'line' : 'lines'} added to Pickups`;

/**
 * Suspected lines become pickups (the Studio Next mock's `suspectedFrom` in `stopTake`, ruling BO-1 item 7). When a take stops, each line
 * the live speech check suspects in the paragraphs it read is put on the shared pickup list by accepting its finding: the host lists an
 * accepted finding as a pickup. One the narrator dismissed, or one already accepted, is left as it is, so reading a place
 * again adds it once. The toast offers Undo, which puts the findings back to unreviewed and so takes them off the list. The lines come
 * from the speech check only; nothing here flags a line by hand.
 */
export function useSuspectedPickups({ chapterId, flags }: { chapterId: string; flags: readonly SuspectedFlag[] }) {
  const teleprompter = usePort('teleprompter');
  const findings = usePort('findings');
  const overlay = useOverlay();
  const journal = useJournalOrOwn();
  const latest = useRef({ chapterId, flags });
  latest.current = { chapterId, flags };

  const takeStopped = useCallback(
    async ({ paragraphIds, quiet = false, saidSaved = false, undoTake, entry }: SuspectedTake): Promise<number> => {
      const { chapterId: chapter, flags: all } = latest.current;
      const read = keptLines(suspectedLines(all, paragraphIds));
      if (read.length === 0) return 0;
      let changed: LinkedChange[] = [];
      let journalEntry = -1;
      let refused = '';
      try {
        // The host answers each line with its stored decision, so a dismissed or accepted line is known before anything changes.
        const stored = await teleprompter.teleprompterSaveFlags(
          chapter,
          read.map((flag) => toFlagSave(flag, false)),
        );
        const fresh = stored.filter((item) => item.review.status === 'unreviewed');
        if (fresh.length > 0) {
          // The accepted lines are one journal entry, so Ctrl+Z and History take them back with the toast's Undo; the first refusal stops it.
          const done = await journal.act<{ changed: LinkedChange[]; failed?: string }>({
            label: lines(fresh.length),
            touches: ['pickups', ...fresh.map((finding) => `proof/finding/${finding.id}`)],
            run: async () => {
              const result = await decideLinked(findings, fresh, 'accepted', { stopAtRefusal: true });
              if (result.changed.length === 0 && result.failed) return { ok: false, refusal: { code: 'host_refused', reason: result.failed } };
              return { ok: true, value: result };
            },
            undo: async (result) => {
              try {
                await restoreLinked(findings, result.changed);
                return { ok: true, value: result };
              } catch (reason) {
                return { ok: false, refusal: { code: 'host_refused', reason: apiErrorMessage(reason) } };
              }
            },
          });
          if (done.ok) {
            changed = done.value.value.changed;
            refused = done.value.value.failed ?? '';
            journalEntry = done.value.id;
          } else {
            refused = done.refusal.reason;
          }
        }
      } catch (reason) {
        refused = apiErrorMessage(reason);
      }
      if (refused) overlay.toast(refused, { tone: 'error' });
      if (changed.length === 0 || quiet) return changed.length;
      const withTake = !saidSaved && undoTake;
      const text = saidSaved ? lines(changed.length) : `Take saved · ${lines(changed.length)}`;
      const undo: Parameters<typeof overlay.toastUndo>[1] = async () => {
        // The take goes first when this toast is the one that said it is saved.
        const take = withTake ? await undoTake() : null;
        if (take && !take.ok) return take;
        const undone = await journal.undo(journalEntry);
        return undone.ok ? { ok: true } : undone;
      };
      if (withTake && entry !== undefined) overlay.toastUndo(text, undo, { entry });
      else overlay.toastUndo(text, undo, { entry: journalEntry });
      return changed.length;
    },
    [teleprompter, findings, overlay, journal],
  );

  return { takeStopped };
}
