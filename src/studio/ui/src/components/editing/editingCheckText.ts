// The words of the editing check panel. Every reason the host gives is
// already a plain sentence (StageSignal.reason, Finding.evidence.reason): this file only maps wire enums to labels
// and reads a candidate's class, so EditingCheckPanel stays layout only.
import type { Finding } from '../../types';

/** Evidence.class, as every editing finding's evidence carries it (apps/desktop/internal/editing/findings.go). Only
 * `silence` is produced today (the click and breath detectors are not validated yet); the other two are read
 * for the day they are. */
export type EditingCandidateClass = 'silence' | 'click' | 'breath';

export const EDITING_CLASS_LABEL: Record<EditingCandidateClass, string> = {
  silence: 'Empty space',
  click: 'Click',
  breath: 'Breath',
};

/** The three editing signal ids (apps/desktop/internal/editing/signals.go), in the order the panel lists them. */
export const EDITING_SIGNAL_ID: Record<EditingCandidateClass, string> = {
  silence: 'editing.empty_space',
  click: 'editing.clicks',
  breath: 'editing.breaths',
};

export const EDITING_CLASSES: readonly EditingCandidateClass[] = ['silence', 'click', 'breath'];

/** The label on every editing result (Architecture Notes, "Processed-audio caveat"), read from a signal's own
 * evidence when one is available; this exact sentence is the fallback so the caveat is never missing. */
export const PROCESSED_AUDIO_CAVEAT = 'Analysis of source audio; take FX, item gain and fades are not applied.';

function isString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

/** A candidate's class, from its evidence; a class this build does not know reads as `undefined` rather than guessing. */
export function candidateClass(finding: Finding): EditingCandidateClass | undefined {
  const value = finding.evidence?.class;
  return isString(value) && EDITING_CLASSES.includes(value as EditingCandidateClass) ? (value as EditingCandidateClass) : undefined;
}
