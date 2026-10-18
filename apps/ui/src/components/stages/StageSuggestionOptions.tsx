import { ProofOptions } from '../proof/proofOptions/ProofOptions';

/** Every setting of the stage suggestions: whether they are offered at all, then which readiness signals a chapter must meet first (app.go fieldSchemas). */
const STAGE_SUGGESTION_KEYS = [
  'suggestions_enabled',
  'recording.text_present',
  'editing.empty_space',
  'editing.clicks',
  'editing.breaths',
  'proofing.pickups',
  'proofing.delivery.integrated_lufs',
  'proofing.delivery.rms_dbfs',
  'proofing.delivery.sample_peak_dbfs',
  'proofing.delivery.true_peak_dbtp',
  'proofing.delivery.noise_floor_dbfs',
  'proofing.delivery.sample_rate',
  'proofing.delivery.duration_seconds',
  'proofing.delivery.head_room_tone_seconds',
  'proofing.delivery.tail_room_tone_seconds',
  'proofing.delivery.render_length',
] as const;

/**
 * The stage board's own options, kept closed under the pipeline they shape: this project's values, saved at once. `onSaved` has the board read
 * its suggestions again, so a change shows in the rows above.
 */
export function StageSuggestionOptions({ onSaved }: { onSaved: () => void }) {
  return <ProofOptions title="Stage suggestion options" tool="StageRecommendations" keys={STAGE_SUGGESTION_KEYS} onSaved={onSaved} className="m-3" />;
}
