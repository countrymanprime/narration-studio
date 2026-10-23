import { useEffect, useMemo, useRef, useState } from 'react';
import type { DawCapabilities, DawResult } from '../../../api/contracts/daw';
import type { EditCut } from '../../../api/contracts/editCuts';
import { usePort } from '../../../ports/usePort';
import { origTime } from '../model/cuts';
import type { CleanupDeps, RangeTrim } from './cleanupApply';

/** The fade at a trimmed gap's seam, in milliseconds: one of the cut fades the chapter's cuts take. */
export const TRIM_FADE_MS = 6;

const available = (caps: DawCapabilities, key: string): boolean => caps.capabilities[key]?.available === true;

const r3 = (n: number): number => Math.round(n * 1000) / 1000;

/** The chapter's cuts as the page holds them, and where a record sends the cuts after it. */
export interface CleanupCuts {
  cuts: readonly EditCut[];
  onCuts: (cuts: EditCut[]) => void;
}

/**
 * The DAW calls Clean up needs, built from the `daw` and `editCuts` ports and lent by the page. `trim` shortens a gap through the
 * DAW (a cut of no words, the later audio moved up) and `record` keeps it in the chapter's cuts as a wordless cut, in the recording's
 * time before any cut, then hands the page the cuts; a trim the DAW did not change is not recorded. `reduce` is lent only where the DAW reports `range_gain` and `repair` only where
 * it reports `click_repair`; the tab turns an operation's Apply off with the capability's sentence otherwise. Undefined until the DAW
 * has answered, and when it cannot.
 */
export function useCleanupDeps({ cuts, onCuts }: CleanupCuts): CleanupDeps | undefined {
  const daw = usePort('daw');
  const log = usePort('editCuts');
  const [caps, setCaps] = useState<DawCapabilities | null>(null);
  // The cuts as of the last read or record: an apply records several trims before the page re-renders.
  const latest = useRef({ cuts, onCuts });
  useEffect(() => {
    latest.current = { cuts, onCuts };
  }, [cuts, onCuts]);
  useEffect(() => {
    let live = true;
    setCaps(null);
    daw.capabilities().then(
      (answer) => live && setCaps(answer),
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [daw]);
  const reducible = caps ? available(caps, 'range_gain') : false;
  const repairable = caps ? available(caps, 'click_repair') : false;
  const dawName = caps?.daw ?? '';
  return useMemo(() => {
    if (!caps) return undefined;
    const trim = ({ chapterId, itemGuid, start, end }: RangeTrim): Promise<DawResult> =>
      daw.trimRange({ chapterId, itemId: itemGuid, start, end, fadeMs: TRIM_FADE_MS });
    const record = async ({ chapterId, itemGuid, start, end }: RangeTrim, result: DawResult): Promise<void> => {
      if (!result.changed) return;
      const a = r3(origTime(latest.current.cuts, start));
      const b = r3(a + (end - start));
      const change = await log.editingCutRecord(chapterId, {
        pid: '',
        keys: [],
        text: `A gap of ${Math.round((end - start) * 100) / 100} s`,
        a,
        b,
        off0: a,
        off1: b,
        mode: 'close',
        fadeMs: TRIM_FADE_MS,
        daw: dawName,
        guid: `${chapterId}/${itemGuid}@${start}`,
        undoSteps: result.undoSteps,
      });
      latest.current = { ...latest.current, cuts: change.cuts };
      latest.current.onCuts(change.cuts);
    };
    return {
      trim,
      record,
      ...(reducible ? { reduce: (request) => daw.reduceRangeGain(request) } : {}),
      ...(repairable ? { repair: (request) => daw.repairClick(request) } : {}),
    } satisfies CleanupDeps;
  }, [daw, log, caps !== null, dawName, reducible, repairable]); // eslint-disable-line react-hooks/exhaustive-deps
}
