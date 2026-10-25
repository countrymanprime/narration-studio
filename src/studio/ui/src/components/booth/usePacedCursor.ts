import { useEffect, useState } from 'react';
import { pacedStep } from './readerModel';
import { reducedMotion } from '../../motion';

const STEP_MS = 45;
// Nobody reads this many words between two reports: it is a session being
// picked up mid-chapter, so show it in place rather than walking there.
const SNAP_WORDS = 80;

/**
 * The word the highlight is on. The tracker reports positions in bursts (a
 * confirmed phrase can move it several words at once), so forward movement is
 * walked a few words at a time to read as a smooth follow. It only ever
 * catches up to the real position - it never runs ahead of it - and
 * a move backward, a new `session`, or reduced-motion, lands immediately.
 */
export function usePacedCursor(target: number, session = 0): number {
  const [paced, setPaced] = useState(target);
  // A new session (`session` changed) is not a move: it lands in place, so nothing the last one showed is walked through.
  const [shown, setShown] = useState(session);
  const reduced = reducedMotion();
  if (session !== shown) {
    setShown(session);
    setPaced(target);
  } else if (target < paced || target - paced > SNAP_WORDS) setPaced(target);

  useEffect(() => {
    if (paced >= target || reduced) return;
    const timer = setTimeout(() => setPaced((current) => pacedStep(current, target)), STEP_MS);
    return () => clearTimeout(timer);
  }, [paced, target, reduced]);

  return reduced ? target : Math.min(paced, target);
}
