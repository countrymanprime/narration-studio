import type { TakeEvidenceResult } from '../../../../api/contracts/takeEvidence';
import { measuredPassage } from '../takeFixtures';
import type { LinePassage } from '../types';
import type { PrepRange } from './prepSteps';

/** Every take of the passage with its longest pause set to `pause` seconds. */
export function withPause(passage: LinePassage, pause: number): LinePassage {
  return {
    ...passage,
    takes: passage.takes.map((t) =>
      t.evidence ? { ...t, evidence: { ...t.evidence, measure: { ...t.evidence.measure, pause: { ok: true as const, value: pause } } } } : t,
    ),
  };
}

/** Takes at one level with long pauses and breaths: both trims are offered, and the suggestion is held down for them. */
export const longPausePassage = (): LinePassage => withPause(measuredPassage(), 2.4);

/** What `TakesPort.evidence` answers for the passage as it stands. */
export function evidenceOf(passage: LinePassage): TakeEvidenceResult {
  return {
    chapterId: passage.chapterId,
    firstToken: passage.firstToken,
    lastToken: passage.lastToken,
    firstParagraph: 1,
    lastParagraph: 1,
    takes: passage.takes.flatMap((t) => (t.evidence ? [t.evidence] : [])),
  };
}

/** One long pause inside the passage, as the two words either side of it. */
export const ONE_PAUSE: readonly PrepRange[] = [{ firstToken: 12, lastToken: 13 }];
