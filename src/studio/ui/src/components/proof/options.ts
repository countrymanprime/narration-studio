import { fieldChoiceLabel } from '../settings/registry/choiceLabels';

const CHUNK_SECONDS = [30, 60, 300, 600] as const;

/** The chunk lengths a compare run offers, worded as the Compare chunk length setting words them: the run's chips are that setting, for one run. */
export const PROOFING_CHUNK_OPTIONS = CHUNK_SECONDS.map((seconds) => ({
  seconds,
  label: fieldChoiceLabel('TranscriptCompare', 'chunk_seconds', String(seconds)),
}));
