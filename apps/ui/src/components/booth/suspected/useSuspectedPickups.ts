import { useCallback, useRef } from 'react';
import { describeApiError } from '../../../api/errorMessage';
import { overlay } from '../../../overlay/overlayService';
import { usePort } from '../../../ports/usePort';
import { suspectedLines, toFlagSave, type SuspectedFlag } from './suspectedLines';

/** A take that stopped: the paragraphs it read. `quiet`: the narrator is leaving, no toast. `saidSaved`: another toast already said the take is saved. */
export type SuspectedTake = { paragraphIds: ReadonlySet<string>; quiet?: boolean; saidSaved?: boolean };

const lines = (n: number) => `${n} suspected ${n === 1 ? 'line' : 'lines'} added to Pickups`;

/**
 * Suspected lines become pickups (the Studio Next mock's `suspectedFrom` in `stopTake`, ruling BO-1 item 7). When a take stops, each line
 * the live speech check suspects in the paragraphs it read is put on the shared pickup list by accepting its finding: the host lists an
 * accepted finding as a pickup (ADR 0840). One the narrator dismissed, or one already accepted, is left as it is, so reading a place
 * again adds it once. The toast offers Undo, which puts the findings back to unreviewed and so takes them off the list. The lines come
 * from the speech check only; nothing here flags a line by hand.
 */
export function useSuspectedPickups({ chapterId, flags }: { chapterId: string; flags: readonly SuspectedFlag[] }) {
  const teleprompter = usePort('teleprompter');
  const findings = usePort('findings');
  const latest = useRef({ chapterId, flags });
  latest.current = { chapterId, flags };

  const takeStopped = useCallback(
    async ({ paragraphIds, quiet = false, saidSaved = false }: SuspectedTake): Promise<number> => {
      const { chapterId: chapter, flags: all } = latest.current;
      const read = suspectedLines(all, paragraphIds);
      if (read.length === 0) return 0;
      const added: { id: string; evidenceVersion: string }[] = [];
      let refused = '';
      try {
        // The host answers each line with its stored decision, so a dismissed or accepted line is known before anything changes.
        const stored = await teleprompter.teleprompterSaveFlags(
          chapter,
          read.map((flag) => toFlagSave(flag, false)),
        );
        for (const finding of stored.filter((item) => item.review.status === 'unreviewed')) {
          const answer = await findings.findingsReview({ id: finding.id, evidenceVersion: finding.evidence_version ?? '', status: 'accepted', note: '' });
          added.push({ id: answer.id, evidenceVersion: answer.evidence_version ?? '' });
        }
      } catch (reason) {
        refused = describeApiError(reason);
      }
      if (refused) overlay.toast(refused, { tone: 'error' });
      if (added.length === 0 || quiet) return added.length;
      overlay.toastUndo(saidSaved ? lines(added.length) : `Take saved · ${lines(added.length)}`, async () => {
        try {
          for (const item of added) await findings.findingsReview({ ...item, status: 'unreviewed', note: '' });
          return { ok: true };
        } catch (reason) {
          return { ok: false, refusal: { reason: describeApiError(reason) } };
        }
      });
      return added.length;
    },
    [teleprompter, findings],
  );

  return { takeStopped };
}
