import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PickupItem, PickupList } from '../../../api/contracts/pickups';
import { describeApiError } from '../../../api/errorMessage';
import { useCommand } from '../../../input/useCommand';
import { useOverlay } from '../../../overlay/OverlayProvider';
import { usePort } from '../../../ports/usePort';
import type { BoothUnit } from '../reading/boothUnits';
import { nextLine, openCount, pickupBars, ranOver, sessionLines } from './pickupBars';

export type PickupSessionOptions = {
  /** The pickups the narrator opened the Booth on, in order. Empty: no session, and nothing here draws or listens. */
  ids: readonly string[];
  /** The chapter on the page, and its sentences. */
  chapterId: string;
  units: readonly BoothUnit[];
  recording: boolean;
  /** Takes the page to a line: its chapter (when another) and its place in the text. */
  onJump: (line: PickupItem) => void;
};

/** Where a take began and stopped, as indices into the chapter's sentences. `quiet`: leaving the Booth, no toast and no Undo. */
export type StoppedTake = { began: number; stopped: number; quiet?: boolean };

export type PickupSessionModel = {
  active: boolean;
  lines: readonly PickupItem[];
  open: number;
  /** The line the reading is on, or null outside a session. */
  at: string | null;
  /** `BoothText`'s `pickupLines`: the bars in this chapter's text. */
  bars: ReadonlyArray<{ paragraphId: string; done: boolean }>;
  jump: (id: string) => void;
  step: (direction: 1 | -1) => void;
  /** Takes an automatic line (from the speech check) off the list; the host keeps it off. */
  dismiss: (id: string) => Promise<void>;
  /** Marks the lines the take read over as recorded, and says so with an Undo unless `quiet`. Answers how many. */
  takeStopped: (take: StoppedTake) => Promise<number>;
};

/**
 * A pickup session in the Booth (the Studio Next mock's `jumpPick`, `nextPick` and the pickup branch of `stopTake`). The list is the
 * host's (ADR 0840): reading it on open is what reconciles the Booth with the DAW's markers, and marking a line done goes through the
 * host to its marker, a refusal being the answer. `N` and `Shift+N` are registered only while a session runs.
 */
export function usePickupSession(options: PickupSessionOptions): PickupSessionModel {
  const { ids, chapterId, units, recording, onJump } = options;
  const pickups = usePort('pickups');
  const overlay = useOverlay();
  const active = ids.length > 0;
  const key = ids.join('\n');
  const [list, setList] = useState<readonly PickupItem[]>([]);
  const [picked, setPicked] = useState<string | null>(null);

  // Opening the Booth on a session reads the list again, so a pickup done in the DAW is done here and a reopened one is open here.
  useEffect(() => {
    if (!active) return undefined;
    let live = true;
    pickups
      .pickupsList()
      .then((answer) => live && setList(answer.pickups))
      .catch((reason) => live && overlay.toast(describeApiError(reason), { tone: 'error' }));
    return () => {
      live = false;
    };
  }, [pickups, overlay, active, key]);

  const lines = useMemo(() => (active ? sessionLines(list, ids) : []), [active, list, ids]);
  const at = active ? (lines.find((item) => item.id === picked)?.id ?? lines[0]?.id ?? null) : null;
  const bars = useMemo(() => pickupBars(lines, chapterId), [lines, chapterId]);

  const latest = useRef({ lines, at, units, chapterId, recording, onJump });
  latest.current = { lines, at, units, chapterId, recording, onJump };

  const take = useCallback((answer: PickupList) => setList(answer.pickups), []);

  const jumpTo = useCallback(
    (line: PickupItem | undefined) => {
      const now = latest.current;
      if (!line) return;
      if (now.recording) {
        overlay.toast('Stop recording first.');
        return;
      }
      setPicked(line.id);
      now.onJump(line);
    },
    [overlay],
  );

  const jump = useCallback((id: string) => jumpTo(latest.current.lines.find((item) => item.id === id)), [jumpTo]);
  const step = useCallback((direction: 1 | -1) => jumpTo(nextLine(latest.current.lines, latest.current.at, direction)), [jumpTo]);
  useCommand('booth.pickup.next', () => step(1), active);
  useCommand('booth.pickup.prev', () => step(-1), active);

  /** Marks each id done or open through the host, one at a time; the first refusal stops it and is answered. */
  const setDone = useCallback(
    async (targets: readonly string[], done: boolean): Promise<string | null> => {
      try {
        for (const id of targets) take(await pickups.pickupsSetDone(id, done));
        return null;
      } catch (reason) {
        return describeApiError(reason);
      }
    },
    [pickups, take],
  );

  const takeStopped = useCallback(
    async ({ began, stopped, quiet = false }: StoppedTake): Promise<number> => {
      const now = latest.current;
      const targets = ranOver(now.lines, now.chapterId, now.units, began, stopped);
      if (targets.length === 0) return 0;
      const refused = await setDone(targets, true);
      if (refused) {
        if (!quiet) overlay.toast(refused, { tone: 'error' });
        return 0;
      }
      if (!quiet) {
        overlay.toastUndo(`Take saved · ${targets.length} ${targets.length === 1 ? 'pickup' : 'pickups'} marked recorded`, async () => {
          const failed = await setDone(targets, false);
          return failed ? { ok: false, refusal: { reason: failed } } : { ok: true };
        });
      }
      return targets.length;
    },
    [overlay, setDone],
  );

  const dismiss = useCallback(
    async (id: string) => {
      try {
        take(await pickups.pickupsRemove(id));
        overlay.toast('Dismissed.');
      } catch (reason) {
        overlay.toast(describeApiError(reason), { tone: 'error' });
      }
    },
    [pickups, overlay, take],
  );

  return { active, lines, open: openCount(lines), at, bars, jump, step, dismiss, takeStopped };
}
