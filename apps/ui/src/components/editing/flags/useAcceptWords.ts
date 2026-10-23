import { useCallback, useRef } from 'react';
import { apiErrorMessage } from '../../../api/errorMessage';
import { overlay } from '../../../overlay/overlayService';
import { usePort } from '../../../ports/usePort';
import type { Journal } from '../../../studio/journal/createJournal';
import { announcePickupListChanged } from '../../pickups/pickupListChanged';
import type { ChapterDoc } from '../model';
import { decideLinked, restoreLinked, type LinkedChange } from './decideLinked';
import { findingsAt } from './findingLink';

export interface AcceptOptions {
  journal: Pick<Journal, 'act' | 'undo'>;
  chapterId: string;
  /** The chapter's document as it is now: it says which Proof notes the accepted words are. */
  doc: ChapterDoc;
  /** Called after the words were recorded or taken back, so the page rebuilds its document from the accepted list. */
  onChange?: () => void;
}

type Accepted = { changed: LinkedChange[]; failed?: string };

/** What the toast says: the flag is gone, and what happened to the note on Proof. */
function acceptedMessage({ changed, failed }: Accepted): string {
  const note = changed.length === 1 ? 'The note on Proof is fine as read.' : changed.length > 1 ? `${changed.length} notes on Proof are fine as read.` : '';
  return ['Not flagged any more.', note, failed ? `The note on Proof was not changed: ${failed}` : ''].filter(Boolean).join(' ');
}

/**
 * Records words as read through the Editing records port, as one journalled command, and marks the Proof notes on the same words fine as
 * read (`dismissed` through `FindingsReview`, research note A2), so the note on Proof and its line on Pickups clear too. The toast offers
 * Undo, which unaccepts the same keys and puts each note back as it was: the flag comes back and no card reopens. A refusal of the
 * accept is the host's own sentence in a toast and nothing is journalled; a note the host does not change (the check ran again since)
 * leaves the accept made, and the toast says so.
 */
export function useAcceptWords({ journal, chapterId, doc, onChange }: AcceptOptions): (keys: string[]) => Promise<void> {
  const log = usePort('editLog');
  const findings = usePort('findings');
  const latest = useRef(doc);
  latest.current = doc;
  return useCallback(
    async (keys: string[]) => {
      const now = latest.current;
      const result = await journal.act<Accepted>({
        label: keys.length === 1 ? 'Accepted a word' : `Accepted ${keys.length} words`,
        touches: [`editing/${chapterId}/accepted`, 'pickups'],
        run: async () => {
          try {
            await log.editingAccept(chapterId, keys);
          } catch (e) {
            return { ok: false as const, refusal: { code: 'host_refused', reason: e instanceof Error ? e.message : String(e) } };
          }
          try {
            const listed = await findings.findingsList({ chapterId });
            return { ok: true as const, value: await decideLinked(findings, findingsAt(now, chapterId, listed.findings, keys), 'dismissed') };
          } catch (e) {
            return { ok: true as const, value: { changed: [], failed: apiErrorMessage(e) } };
          }
        },
        undo: async (accepted) => {
          try {
            await log.editingUnaccept(chapterId, keys);
            await restoreLinked(findings, accepted.changed);
            return { ok: true as const, value: accepted };
          } catch (e) {
            return { ok: false as const, refusal: { code: 'host_refused', reason: e instanceof Error ? e.message : String(e) } };
          }
        },
      });
      if (!result.ok) {
        overlay.toast(result.refusal.reason, { tone: 'error' });
        return;
      }
      const { id, value } = result.value;
      onChange?.();
      if (value.changed.length) announcePickupListChanged();
      overlay.toastUndo(
        acceptedMessage(value),
        async () => {
          const undone = await journal.undo(id);
          if (undone.ok) {
            onChange?.();
            if (value.changed.length) announcePickupListChanged();
          }
          return undone;
        },
        { entry: id },
      );
    },
    [journal, chapterId, log, findings, onChange],
  );
}
