import type { GuideDialogueCue, GuideEntity } from '../../types';

// The mock's stand-in for the local model that suggests a speaker for the lines the rules leave unknown, as the host's fake does
// (src/studio/desktop/internal/extractionport/localmodeltest): a pure function of what it is given, so every UI test runs without a
// download. It names the speaker of the nearest line that has one, an earlier line first, and says why in one sentence.

/** What the narrator's settings allow a run: whether the model is asked at all, and about how many lines. */
export type SpeakerFallbackSetting = { on: boolean; maxLines: number };

export type SpeakerFallbackRun = { cues: GuideDialogueCue[]; filled: number; note: string };

/**
 * One run over the cues the rules have been through: each unknown line the narrator has not confirmed or edited, up to
 * `maxLines`, takes the speaker of the nearest line whose speaker is one of `speakers` (an earlier line first, else a
 * later one), as a `local-model` suggestion with a reason. With no such line anywhere, every line stays unknown.
 */
export function suggestUnknownSpeakers(
  cues: readonly GuideDialogueCue[],
  speakers: readonly GuideEntity[],
  setting: SpeakerFallbackSetting,
): SpeakerFallbackRun {
  if (!setting.on) return { cues: [...cues], filled: 0, note: '' };
  const unknown = cues.filter((cue) => cue.speaker_entity_id === null && !cue.corrected && cue.speaker_source !== 'correction');
  const asked = new Set(unknown.slice(0, Math.max(0, setting.maxLines)).map((cue) => cue.id));
  let filled = 0;
  const next = cues.map((cue, index) => {
    if (!asked.has(cue.id)) return cue;
    const spoken = (row: GuideDialogueCue) => speakers.some((entity) => entity.id === row.speaker_entity_id);
    const nearest = cues.slice(0, index).reverse().find(spoken) ?? cues.slice(index + 1).find(spoken);
    const speaker = speakers.find((entity) => entity.id === nearest?.speaker_entity_id);
    if (!speaker) return cue;
    filled += 1;
    return {
      ...cue,
      speaker_entity_id: speaker.id,
      speaker_source: 'local-model' as const,
      evidence: { ...cue.evidence, reason: `${speaker.canonical_name} speaks the nearest attributed line.` },
    };
  });
  const note =
    asked.size < unknown.length
      ? `The local model was asked about ${asked.size} of the ${unknown.length} lines the rules left unknown; run it again for the rest.`
      : '';
  return { cues: next, filled, note };
}
