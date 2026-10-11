import { useState } from 'react';
import { apiErrorMessage } from '../../../api/errorMessage';
import { usePendingAction } from '../../../hooks/usePendingAction';
import type { Finding, FindingReviewStatus, NarrationApi } from '../../../types';
import { evidenceChange, type EvidenceChange } from './evidenceChange';

/** What the narrator is told when a decision or a step is refused because the evidence moved under them. */
export const STALE_DECISION_SENTENCE = 'The evidence for this note changed since you looked at it. Read what changed, then decide.';

/** The two host reads the inspector needs; the Proof port will give the same pair. */
export type InspectorApi = Pick<NarrationApi, 'findingsGet' | 'findingsReview'>;

/** Whether a decision or step went ahead; a refusal carries the sentence to show. */
export type InspectorOutcome = { ok: true } | { ok: false; message: string };

interface Tracked {
  /** The last finding the caller passed: a new one is a re-check or another note. Never set from a fetch. */
  prop: Finding;
  shown: Finding;
  latest: Finding;
  note: string;
}

const versionOf = (finding: Finding) => finding.evidence_version ?? '';
const fresh = (finding: Finding): Tracked => ({ prop: finding, shown: finding, latest: finding, note: finding.review.note ?? '' });

/**
 * The finding the narrator was shown, kept beside the latest one the host gave. A decision goes out with the shown evidence version
 * and is refused here, before the host is asked, while the latest evidence differs from the shown one. A re-check with the same
 * version replaces the finding silently; one that moves it raises `change` until `useNewEvidence`. The decision note lives here, so it
 * outlives a replaced finding and goes out with the decision made on the new evidence.
 */
export function useShownEvidence({
  api,
  finding,
  order,
  onSelect,
  onChanged,
}: {
  api: InspectorApi;
  finding: Finding;
  /** Ids of the notes in the order the narrator steps through them. */
  order: readonly string[];
  onSelect: (id: string) => void;
  /** The finding as the host now holds it; `decided` is true when a decision was saved. */
  onChanged: (finding: Finding, decided: boolean) => void;
}) {
  const [state, setState] = useState<Tracked>(() => fresh(finding));
  const action = usePendingAction();

  // The finding prop moved: another note is a fresh start, a re-check of this one keeps what was shown and the typed note.
  let current = state;
  if (state.prop !== finding) {
    current =
      state.prop.id !== finding.id
        ? fresh(finding)
        : { ...state, prop: finding, latest: finding, shown: versionOf(state.shown) === versionOf(finding) ? finding : state.shown };
    setState(current);
  }

  const change: EvidenceChange | null = evidenceChange(current.shown, current.latest);
  const at = order.indexOf(current.latest.id);
  const refused: InspectorOutcome = { ok: false, message: STALE_DECISION_SENTENCE };

  const decide = async (status: FindingReviewStatus): Promise<InspectorOutcome> => {
    if (change) return refused;
    const outcome = await action.run(status, async (): Promise<InspectorOutcome> => {
      const shownVersion = versionOf(current.shown);
      try {
        const decided = await api.findingsReview({ id: current.latest.id, evidenceVersion: shownVersion, status, note: current.note.trim() });
        setState((s) => ({ ...s, shown: decided, latest: decided }));
        onChanged(decided, true);
        return { ok: true };
      } catch (error) {
        // Whether the evidence moved is checked against the finding itself, so the page never depends on the host's wording.
        const latest = await api.findingsGet(current.latest.id).catch(() => undefined);
        if (latest && versionOf(latest) !== shownVersion) {
          setState((s) => ({ ...s, latest }));
          onChanged(latest, false);
          return refused;
        }
        return { ok: false, message: `Not saved: ${apiErrorMessage(error)}` };
      }
    });
    return outcome ?? { ok: false, message: 'Another action is still running.' };
  };

  const step = (delta: -1 | 1): InspectorOutcome => {
    if (change) return refused;
    const target = order[at + delta];
    if (target !== undefined) onSelect(target);
    return { ok: true };
  };

  return {
    /** The finding the narrator was shown. */
    shown: current.shown,
    change,
    note: current.note,
    setNote: (note: string) => setState((s) => ({ ...s, note })),
    decide,
    step,
    /** The narrator read what changed and takes the latest evidence as the one to decide on. */
    useNewEvidence: () => setState((s) => ({ ...s, shown: s.latest })),
    canPrev: at > 0,
    canNext: at >= 0 && at < order.length - 1,
    isPending: action.isPending,
    isBusy: action.isBusy,
  };
}
