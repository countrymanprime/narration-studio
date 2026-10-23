import { ProofOptions } from '../proof/proofOptions/ProofOptions';

/** The recording check's own rules, judged on this project's values (docs/utilities/recording-coverage.md); the model and chunking stay in Settings > Speech to text. */
const RULE_KEYS = ['min_paragraph_present', 'max_missing_run', 'max_misread_run', 'min_anchor_run', 'background_checks'] as const;
const RULES_NOTE = (
  <div className="space-y-1 text-[length:var(--font-size-sm)] text-[var(--text-muted)]">
    <div className="font-medium text-[var(--text)]">Proposed values, not yet calibrated</div>
    <div>
      They were chosen on synthetic test recordings and have not been checked against real ones. The first two only change how a stored check is judged;
      changing either of the next two changes which words count, so earlier checks read as out of date and those chapters need checking again.
    </div>
  </div>
);

/**
 * The recording check's rules, opened from the jump menu while Production shows (the check's own panel is a modal, so the jump menu can't be reached
 * from inside it): this project's values, saved at once. `onSaved` has the page read the checks again, so each chapter is judged by the new rule.
 */
export function RecordingCheckRules({ onSaved }: { onSaved: () => void }) {
  return <ProofOptions title="Recording check rules" group="Production" tool="RecordingCoverage" keys={RULE_KEYS} onSaved={onSaved} note={RULES_NOTE} />;
}
