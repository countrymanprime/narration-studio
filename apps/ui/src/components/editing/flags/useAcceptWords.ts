import { useCallback } from 'react';
import { overlay } from '../../../overlay/overlayService';
import { usePort } from '../../../ports/usePort';
import type { Journal } from '../../../studio/journal/createJournal';

export interface AcceptOptions {
  journal: Pick<Journal, 'act' | 'undo'>;
  chapterId: string;
  /** Called after the words were recorded or taken back, so the page rebuilds its document from the accepted list. */
  onChange?: () => void;
}

/**
 * Records words as read through the Editing records port, as one journalled command. The toast offers Undo, which unaccepts the same keys: the
 * flag comes back and no card reopens. A refusal is the host's own sentence in a toast and nothing is journalled.
 */
export function useAcceptWords({ journal, chapterId, onChange }: AcceptOptions): (keys: string[]) => Promise<void> {
  const log = usePort('editLog');
  return useCallback(
    async (keys: string[]) => {
      const result = await journal.act({
        label: keys.length === 1 ? 'Accepted a word' : `Accepted ${keys.length} words`,
        touches: [`editing/${chapterId}/accepted`],
        run: async () => {
          try {
            return { ok: true as const, value: await log.editingAccept(chapterId, keys) };
          } catch (e) {
            return { ok: false as const, refusal: { code: 'host_refused', reason: e instanceof Error ? e.message : String(e) } };
          }
        },
        undo: async () => {
          try {
            return { ok: true as const, value: await log.editingUnaccept(chapterId, keys) };
          } catch (e) {
            return { ok: false as const, refusal: { code: 'host_refused', reason: e instanceof Error ? e.message : String(e) } };
          }
        },
      });
      if (!result.ok) {
        overlay.toast(result.refusal.reason, { tone: 'error' });
        return;
      }
      onChange?.();
      overlay.toastUndo('Not flagged any more.', async () => {
        const undone = await journal.undo(result.value.id);
        if (undone.ok) onChange?.();
        return undone;
      });
    },
    [journal, chapterId, log, onChange],
  );
}
