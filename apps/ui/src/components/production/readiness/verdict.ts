import type { StageChapterRecommendation, StageSignal } from '../../../types';
import type { StatusTone } from '../../primitives/StatusBadge';
import { CAUSE_TEXT, SIGNAL_STATE_LABEL, signalName, stageLabel, verdictSentence } from '../../stages/stageText';

/** The six verdicts of the Studio Next mock (`selectors/readiness.ts`), read from the host's recommendation. */
export type Verdict = 'ready' | 'notready' | 'notchecked' | 'progress' | 'changed' | 'confirmed';

export const VERDICT_LABEL: Record<Verdict, string> = {
  ready: 'Ready',
  notready: 'Not ready',
  notchecked: 'Not checked',
  progress: 'In progress',
  changed: 'Evidence changed',
  confirmed: 'Confirmed',
};

export const VERDICT_TONE: Record<Verdict, StatusTone> = {
  ready: 'success',
  notready: 'danger',
  notchecked: 'neutral',
  progress: 'info',
  changed: 'warning',
  confirmed: 'success',
};

/** One character per verdict for the chip, drawn as text: the icon catalogue has no verdict rows yet. */
export const VERDICT_GLYPH: Record<Verdict, string> = { ready: '✓', notready: '✕', notchecked: '?', progress: '…', changed: '!', confirmed: '✓' };

type EvidenceState = 'met' | 'unmet';
export type EvidenceRow = { id: string; label: string; value: string; note: string; state: EvidenceState };
type EvidenceChange = { id: string; label: string; was: string; now: string };

const moved = (current: StageChapterRecommendation, seen?: StageChapterRecommendation): boolean =>
  !!seen && current.verdict !== 'none' && !!seen.basisKey && !!current.basisKey && seen.basisKey !== current.basisKey;

/**
 * The verdict of a chapter's stage suggestion. A contradiction (the evidence under a live confirmation moved), or a basis that moved since
 * the narrator read the suggestion (`seen`), is "evidence changed". A dismissed suggestion has no verdict of its own in the mock and reads
 * "not checked" with the host's sentence saying it was dismissed.
 */
export function verdictOf(recommendation: StageChapterRecommendation, seen?: StageChapterRecommendation): Verdict {
  if (recommendation.contradiction || moved(recommendation, seen)) return 'changed';
  switch (recommendation.verdict) {
    case 'recommended':
      return 'ready';
    case 'not_ready':
      return 'notready';
    case 'unknown':
      return recommendation.causes.includes('analysis_running') ? 'progress' : 'notchecked';
    case 'dismissed':
      return 'notchecked';
    case 'none':
      return recommendation.confirmation ? 'confirmed' : 'notchecked';
  }
}

/** A row per measured signal. An unknown signal is not measured, so it draws no row (its cause is in the suggestion box). */
export function evidenceRows(recommendation: StageChapterRecommendation): EvidenceRow[] {
  return recommendation.signals.flatMap((item: StageSignal) =>
    item.state === 'unknown'
      ? []
      : [
          {
            id: item.id,
            label: signalName(item),
            value: SIGNAL_STATE_LABEL[item.state],
            note: item.reason,
            state: item.state === 'met' ? ('met' as const) : ('unmet' as const),
          },
        ],
  );
}

const stateOf = (item: StageSignal | undefined): string => (item ? SIGNAL_STATE_LABEL[item.state] : '—');

function changesOf(recommendation: StageChapterRecommendation, seen?: StageChapterRecommendation): EvidenceChange[] {
  if (recommendation.contradiction) {
    return recommendation.contradiction.signals.map((item) => ({
      id: item.id,
      label: signalName(item),
      was: SIGNAL_STATE_LABEL.met,
      now: SIGNAL_STATE_LABEL[item.state],
    }));
  }
  if (!moved(recommendation, seen) || !seen) return [];
  const ids = [...new Set([...seen.signals, ...recommendation.signals].map((item) => item.id))];
  return ids.flatMap((id) => {
    const was = seen.signals.find((item) => item.id === id);
    const now = recommendation.signals.find((item) => item.id === id);
    return stateOf(was) === stateOf(now) ? [] : [{ id, label: signalName(was ?? now!), was: stateOf(was), now: stateOf(now) }];
  });
}

export type ReadinessModel = {
  verdict: Verdict;
  /** The stage the chapter is in. */
  stage: string;
  headline: string;
  sub: string;
  /** The suggestion box's label: the suggestion, or the decision once confirmed. */
  boxLabel: 'Suggestion' | 'Decision';
  items: EvidenceRow[];
  changes: EvidenceChange[];
  /** When the changed evidence was last settled: the confirmation's time, or the time the narrator read the suggestion. */
  changedSince?: string;
  canConfirm: boolean;
  canDismiss: boolean;
  /** A live confirmation exists, so Revert can undo it. */
  canRevert: boolean;
};

const unmet = (recommendation: StageChapterRecommendation): string =>
  recommendation.signals
    .filter((item) => item.state === 'not_met')
    .map(signalName)
    .join(' · ');

/** What the panel says and offers for one chapter; `seen` is the suggestion the narrator had on screen when Confirm or Dismiss was pressed. */
export function readinessOf(recommendation: StageChapterRecommendation, seen?: StageChapterRecommendation): ReadinessModel {
  const verdict = verdictOf(recommendation, seen);
  const target = recommendation.target ? stageLabel(recommendation.target) : '';
  const confirmation = recommendation.confirmation;
  const cause = recommendation.causes[0];
  let headline: string;
  let sub = '';
  switch (verdict) {
    case 'confirmed':
      headline = `Moved to ${stageLabel(confirmation?.target ?? recommendation.from)}`;
      break;
    case 'ready':
      headline = `Ready to move to ${target}`;
      break;
    case 'changed':
      headline = confirmation ? `Moved to ${stageLabel(confirmation.target)}, but the evidence has changed` : `Was ready to move to ${target}`;
      sub = 'Nothing moves until you decide.';
      break;
    case 'notready':
      headline = `Not ready to move to ${target}`;
      sub = `${unmet(recommendation)} not met`;
      break;
    case 'progress':
      headline = 'Still in progress';
      sub = cause ? CAUSE_TEXT[cause].short : '';
      break;
    case 'notchecked':
      headline =
        recommendation.verdict === 'dismissed'
          ? `Suggestion to move to ${target} dismissed`
          : recommendation.verdict === 'unknown'
            ? 'Not enough evidence yet'
            : 'Nothing to check yet';
      sub = recommendation.verdict === 'unknown' && cause ? CAUSE_TEXT[cause].short : verdictSentence(recommendation);
      break;
  }
  return {
    verdict,
    stage: stageLabel(recommendation.from),
    headline,
    sub,
    boxLabel: verdict === 'confirmed' ? 'Decision' : 'Suggestion',
    items: evidenceRows(recommendation),
    changes: changesOf(recommendation, seen),
    changedSince: recommendation.contradiction ? confirmation?.at : seen?.signals[0]?.computedAt,
    canConfirm: verdict === 'ready',
    // The host takes a Dismiss only of a live suggestion, so a changed verdict offers it only when the current evidence still recommends.
    canDismiss: verdict === 'ready' || (verdict === 'changed' && recommendation.verdict === 'recommended'),
    canRevert: !!confirmation,
  };
}
