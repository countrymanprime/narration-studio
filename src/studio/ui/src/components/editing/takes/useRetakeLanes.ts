import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { RetakeLane, RetakeLaneLine, RetakeLanesApi, RetakeLanesList, RetakeLanesState } from '../../../api/contracts/retakelanes';
import { apiErrorMessage } from '../../../api/errorMessage';
import { overlay } from '../../../overlay/overlayService';
import { usePort } from '../../../ports/usePort';
import type { Command, Journal, Result } from '../../../studio/journal/createJournal';
import type { LinePassage } from './types';

/** How long a pick may wait for REAPER's answer before the page says it did not come. */
const ANSWER_MS = 30_000;

export interface RetakeLanes {
  /** The lane group of this line: its retakes in lane order, or null when the line has no retakes on more than one lane. */
  forLine: (passage: LinePassage) => RetakeLaneLine | null;
  /** The retake being picked now (every other lane's button is off until REAPER answers), or null. */
  picking: string | null;
  /** Makes this retake's lane the only one playing on its track: one journal entry, one undo step in REAPER, and the Undo toast. */
  pick: (passage: LinePassage, line: RetakeLaneLine, retake: RetakeLane) => Promise<void>;
}

/** The first state REAPER sends for this pick (a new run) that says how it ended. */
function answerOf(port: RetakeLanesApi, itemGuid: string, start: () => Promise<unknown>): Promise<RetakeLanesState> {
  return new Promise<RetakeLanesState>((resolve, reject) => {
    let baseline: string | undefined;
    let done = false;
    const finish = (settle: () => void) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      off();
      settle();
    };
    const off = port.subscribeRetakeLanes((state) => {
      if (state.itemGuid !== itemGuid || (state.phase !== 'picked' && state.phase !== 'error')) return;
      if (state.runId !== undefined && state.runId === baseline) return;
      finish(() => resolve(state));
    });
    const timer = setTimeout(() => finish(() => reject(new Error('REAPER did not answer. Check that it is open, then try again.'))), ANSWER_MS);
    void port
      .retakeLanesState()
      .then((state) => {
        baseline = state.runId;
      })
      .catch(() => {})
      .then(start)
      .catch((reason: unknown) => finish(() => reject(reason)));
  });
}

const refusal = (reason: string): Result<never> => ({ ok: false, refusal: { code: 'daw_refused', reason } });

/**
 * The retakes of the project's fixed-lane tracks, read once from the saved project when the takes list first needs them, and the pick that
 * makes one lane the only one playing on its track. Lines are joined by the items of their lane retakes (`laneItems`), the same fact the takes
 * read says. The pick changes nothing but which lane plays, in one REAPER undo step; the journal's Undo picks the lane that played before.
 */
export function useRetakeLanes(journal: Pick<Journal, 'act' | 'undo'>, enabled: boolean): RetakeLanes {
  const port = usePort('retakeLanes');
  const [list, setList] = useState<RetakeLanesList | null>(null);
  const [picking, setPicking] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let live = true;
    port
      .retakeLanesList()
      .then((answer) => live && setList(answer))
      .catch(() => live && setList({ lines: [], laneTracks: 0 }));
    return () => {
      live = false;
    };
  }, [port, enabled]);

  const byItem = useMemo(() => {
    const out = new Map<string, RetakeLaneLine>();
    for (const line of list?.lines ?? []) for (const retake of line.retakes) out.set(retake.itemGuid, line);
    return out;
  }, [list]);

  const forLine = useCallback(
    (passage: LinePassage): RetakeLaneLine | null => {
      for (const guid of passage.laneItems ?? []) {
        const line = byItem.get(guid);
        if (line) return line;
      }
      return null;
    },
    [byItem],
  );

  /** What plays on the track once REAPER confirmed the pick: the picked lane alone, on every line of that track. */
  const played = useCallback((trackGuid: string, lane: number) => {
    setList((current) =>
      current
        ? {
            ...current,
            lines: current.lines.map((line) =>
              line.trackGuid === trackGuid ? { ...line, retakes: line.retakes.map((retake) => ({ ...retake, plays: retake.lane === lane })) } : line,
            ),
          }
        : current,
    );
  }, []);

  const latest = useRef({ port, journal, played });
  latest.current = { port, journal, played };

  const pick = useCallback(async (passage: LinePassage, line: RetakeLaneLine, retake: RetakeLane) => {
    const { port: api, journal: j, played: show } = latest.current;
    const before = line.retakes.find((r) => r.plays);
    const choose = async (target: RetakeLane): Promise<Result<RetakeLanesState>> => {
      try {
        const state = await answerOf(api, target.itemGuid, () => api.retakeLanesPick(line.lineId, target.itemGuid));
        if (state.phase === 'error') return refusal(state.message);
        show(line.trackGuid, target.lane);
        return { ok: true, value: state };
      } catch (error) {
        return refusal(apiErrorMessage(error));
      }
    };
    const command: Command<RetakeLanesState> = {
      label: `Lane ${retake.lane + 1} plays on ${line.trackName}`,
      touches: [`takes/${passage.id}`],
      // Not a DAW entry in the journal's sense: its inverse picks the lane that played before, a new choice in REAPER, not a step back through REAPER's
      // undo history, so there is no "REAPER's last action" to check. REAPER's own Undo still takes the pick back in one step.
      daw: false,
      run: () => choose(retake),
      ...(before ? { undo: () => choose(before) } : {}),
      notUndoableReason: 'No lane was playing before, so there is nothing to put back. Undo in REAPER.',
    };
    setPicking(retake.itemGuid);
    const result = await j.act(command);
    setPicking(null);
    if (!result.ok) {
      overlay.toast(result.refusal.reason, { tone: 'error' });
      return;
    }
    const others = line.retakes.filter((r) => r.lane !== retake.lane).map((r) => r.lane + 1);
    overlay.toastUndo(
      `Lane ${retake.lane + 1} plays on ${line.trackName}. ${laneList(others)} ${others.length === 1 ? 'is' : 'are'} silent everywhere on this track.`,
      async () => {
        const undone = await j.undo(result.value.id);
        return undone;
      },
      { entry: result.value.id },
    );
  }, []);

  return { forLine, picking, pick };
}

/** "Lane 1", "Lanes 1 and 3", "Lanes 1, 2 and 4". */
function laneList(lanes: readonly number[]): string {
  if (lanes.length < 2) return `Lane ${lanes[0] ?? ''}`.trim();
  return `Lanes ${lanes.slice(0, -1).join(', ')} and ${lanes[lanes.length - 1]}`;
}
