import { useCallback, useMemo, useRef, useState } from 'react';
import { apiErrorMessage } from '../../../api/errorMessage';
import { DAW_RESULT_MAX_UNDO_STEPS, type DawResult } from '../../../api/contracts/daw';
import { overlay } from '../../../overlay/overlayService';
import { usePort } from '../../../ports/usePort';
import type { DawClient } from '../../../ports/daw';
import type { Command, Journal, Result } from '../../../studio/journal/createJournal';
import type { LinePassage, LineTake } from './types';

/**
 * The lines whose takes a call to the DAW is changing right now, by line id, and what the call is. Keeping and hiding share one, so neither starts
 * on a line while the other is still on its way (a Hide would otherwise act on the take that was kept before the pending Keep) and the same call is not
 * sent twice.
 */
export type LineBusy = Map<string, 'keep' | 'hide'>;
export const createLineBusy = (): LineBusy => new Map();
/** Said when a Keep or a Hide is pressed on a line the other is still changing. */
export const LINE_BUSY = 'Still changing this line’s takes. Try again in a moment.';

/** What keeping needs of the journal. */
export type KeepJournal = Pick<Journal, 'act' | 'undo'>;

const USE_TAKE_KIND = 'use_take';

async function choose(daw: DawClient, passage: LinePassage, take: LineTake): Promise<Result<DawResult>> {
  let result: DawResult;
  try {
    result = await daw.useTake(passage.chapterId, passage.firstToken, passage.lastToken, take.id);
  } catch (error) {
    return { ok: false, refusal: { code: 'daw_failed', reason: `Could not keep ${take.label}: ${apiErrorMessage(error)}` } };
  }
  if (result.ok) return { ok: true, value: result };
  const sentence = (result.refused ?? result.message ?? '').trim();
  return { ok: false, refusal: { code: 'daw_refused', reason: sentence || `Could not keep ${take.label}.` } };
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
    // One undo point in the DAW's history (narration_workspace.lua's set_active_take, or a lane pick); a keep that changed nothing left none and names no action.
    dawAction: ({ undoSteps }) => (undoSteps >= 1 && undoSteps <= DAW_RESULT_MAX_UNDO_STEPS ? { kind: USE_TAKE_KIND, steps: undoSteps } : undefined),
    run: () => choose(daw, passage, take),
    ...(before ? { undo: () => choose(daw, passage, before) } : {}),
  };
}

export interface KeepTakes {
  /** The kept take for each line with several takes, by line id: the take the DAW has active (what Proof marks Kept too), or the one just kept or taken back until the lines are read again. */
  kept: Readonly<Record<string, string>>;
  /** Keeps the take: one `useTake` call and the usual Undo toast; a refusal shows the DAW's own sentence and changes nothing here. */
  keep: (passage: LinePassage, take: LineTake) => Promise<void>;
  /** The lines with a keep made here that Undo choice can take back. */
  undoable: Readonly<Record<string, true>>;
  /** Undo choice: takes the line's last keep back through the history, or says why it cannot. */
  undoKeep: (passageId: string) => Promise<void>;
}

/** A choice made here that the lines read from the DAW have not caught up with: it stands only while the DAW's active take is still `over`. */
type Pending = { take: string | null; over: string | undefined };

const activeOf = (passage: LinePassage): string | undefined => passage.takes.find((t) => t.active)?.id;
const NO_LINES: ReadonlyMap<string, LinePassage> = new Map();

/**
 * Keeps takes through the journal and the DAW port. The kept take is the one the DAW has active (the same fact Proof reads), so it is the same
 * after a reload; a keep or an undo made here shows at once and gives way as soon as the lines read a different active take. A line with one
 * take has nothing to choose between and no kept take.
 */
export function useKeepTakes(journal: KeepJournal, lines: ReadonlyMap<string, LinePassage> = NO_LINES, shared?: LineBusy): KeepTakes {
  const daw = usePort('daw');
  const [pending, setPending] = useState<Record<string, Pending>>({});
  const entries = useRef<Record<string, number>>({});
  const [undoable, setUndoable] = useState<Record<string, true>>({});
  const kept = useMemo(() => {
    const out: Record<string, string> = {};
    for (const [id, choice] of Object.entries(pending)) {
      // A line the lines do not list (none were given) shows the choice made here alone.
      if (!lines.has(id) && choice.take) out[id] = choice.take;
    }
    for (const line of lines.values()) {
      if (line.takes.length < 2) continue;
      const host = activeOf(line);
      const choice = pending[line.id];
      const take = choice && choice.over === host ? choice.take : host;
      if (take) out[line.id] = take;
    }
    return out;
  }, [pending, lines]);
  const choose = useCallback(
    (passageId: string, take: string | null, over: string | undefined) => setPending((p) => ({ ...p, [passageId]: { take, over } })),
    [],
  );
  const undoKeep = useCallback(
    async (passageId: string) => {
      const id = entries.current[passageId];
      if (id === undefined) return;
      const undone = await journal.undo(id);
      if (!undone.ok) {
        overlay.toast(undone.refusal.reason, { tone: 'error' });
        return;
      }
      delete entries.current[passageId];
      setUndoable(({ [passageId]: _gone, ...rest }) => rest);
      const line = lines.get(passageId);
      choose(passageId, backTo.current[passageId] ?? null, line ? activeOf(line) : kept[passageId]);
    },
    [journal, lines, kept, choose],
  );
  const backTo = useRef<Record<string, string | undefined>>({});
  const keepNow = useCallback(
    async (passage: LinePassage, take: LineTake) => {
      if (kept[passage.id] === take.id) {
        overlay.toast(`${take.label} is already kept.`);
        return;
      }
      const before = activeOf(passage);
      const result = await journal.act(keepTakeCommand(daw, passage, take));
      if (!result.ok) {
        overlay.toast(result.refusal.reason, { tone: 'error' });
        return;
      }
      choose(passage.id, take.id, before);
      entries.current[passage.id] = result.value.id;
      setUndoable((u) => ({ ...u, [passage.id]: true }));
      backTo.current[passage.id] = before;
      overlay.toastUndo(
        `Kept ${take.label}. The other takes are still there.`,
        async () => {
          const undone = await journal.undo(result.value.id);
          if (undone.ok) {
            choose(passage.id, before ?? null, take.id);
            setUndoable(({ [passage.id]: _gone, ...rest }) => rest);
          }
          return undone;
        },
        { entry: result.value.id },
      );
    },
    [daw, journal, kept, choose],
  );
  /** The lines with a call on its way: a second press of the same Keep sends nothing, and a Keep during a Hide says so. */
  const own = useRef<LineBusy>(new Map());
  const busy = shared ?? own.current;
  const keep = useCallback(
    async (passage: LinePassage, take: LineTake) => {
      const doing = busy.get(passage.id);
      if (doing) {
        if (doing === 'hide') overlay.toast(LINE_BUSY);
        return;
      }
      busy.set(passage.id, 'keep');
      try {
        await keepNow(passage, take);
      } finally {
        busy.delete(passage.id);
      }
    },
    [keepNow, busy],
  );
  return { kept, undoable, keep, undoKeep };
}
