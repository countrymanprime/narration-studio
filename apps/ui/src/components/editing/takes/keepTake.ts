import { useCallback, useState } from 'react';
import type { DawResult } from '../../../api/contracts/daw';
import { overlay } from '../../../overlay/overlayService';
import { usePort } from '../../../ports/usePort';
import type { DawClient } from '../../../ports/daw';
import type { Command, Journal, Result } from '../../../studio/journal/createJournal';
import type { LinePassage, LineTake } from './types';

/** What keeping needs of the journal. */
export type KeepJournal = Pick<Journal, 'act' | 'undo'>;

async function choose(daw: DawClient, passage: LinePassage, take: LineTake): Promise<Result<DawResult>> {
  const result = await daw.useTake(passage.chapterId, passage.firstToken, passage.lastToken, take.id);
  if (result.ok) return { ok: true, value: result };
  return { ok: false, refusal: { code: 'daw_refused', reason: result.refused ?? result.message } };
}

/**
 * Keep a take: the DAW makes it the active one and the others stay where they are, muted. Nothing is deleted. Undo makes the take that was active
 * active again, so the journal refuses it once a later change came after (the DAW's last action then is not this one). With no take active before,
 * there is nothing to go back to and the entry says so.
 */
function keepTakeCommand(daw: DawClient, passage: LinePassage, take: LineTake): Command<DawResult> {
  const before = passage.takes.find((t) => t.active);
  return {
    label: `Kept ${take.label}`,
    touches: [`takes/${passage.id}`],
    daw: true,
    run: () => choose(daw, passage, take),
    ...(before ? { undo: () => choose(daw, passage, before) } : {}),
  };
}

export interface KeepTakes {
  /** The take the DAW said it kept for each line, by line id. */
  kept: Readonly<Record<string, string>>;
  /** Keeps the take: one `useTake` call and the usual Undo toast; a refusal shows the DAW's own sentence and changes nothing here. */
  keep: (passage: LinePassage, take: LineTake) => Promise<void>;
}

/** Keeps takes through the journal and the DAW port. "Kept" is shown only after the DAW has said so. */
export function useKeepTakes(journal: KeepJournal): KeepTakes {
  const daw = usePort('daw');
  const [kept, setKept] = useState<Record<string, string>>({});
  const keep = useCallback(
    async (passage: LinePassage, take: LineTake) => {
      if (kept[passage.id] === take.id) {
        overlay.toast(`${take.label} is already kept.`);
        return;
      }
      const result = await journal.act(keepTakeCommand(daw, passage, take));
      if (!result.ok) {
        overlay.toast(result.refusal.reason, { tone: 'error' });
        return;
      }
      setKept((k) => ({ ...k, [passage.id]: take.id }));
      overlay.toastUndo(`Kept ${take.label}. The other takes are still there.`, async () => {
        const undone = await journal.undo(result.value.id);
        if (undone.ok) setKept((k) => Object.fromEntries(Object.entries(k).filter(([id]) => id !== passage.id)));
        return undone;
      });
    },
    [daw, journal, kept],
  );
  return { kept, keep };
}
