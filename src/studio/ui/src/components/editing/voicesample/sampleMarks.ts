import type { VoiceSample, VoiceSamples } from '../../../api/contracts/voiceSamples';
import { clipProblem, passageBadge } from '../../storybible/voicesamples/voiceSampleModel';

/** A voice sample as the dots take it, so the script's own files need no import from the api folder. */
export type MarkedSample = VoiceSample;

/** Where a chapter's voice samples are drawn in Editing: a dot after the word each range ends with, or in `moved` when that word is gone. */
export type SampleMarks = {
  /** Samples by the key (`paragraphId:ordinal`) of the last word of their range, in the order the host lists them. */
  at: ReadonlyMap<string, readonly VoiceSample[]>;
  /** Samples of this chapter whose last word is not in the chapter any more (the text changed): drawn together at the top. */
  moved: readonly VoiceSample[];
};

/** The marks for one chapter. `hasWord` says whether a word key is in the chapter's text now; with no list read yet there are none. */
export function sampleMarks(list: VoiceSamples | undefined, chapterId: string, hasWord: (key: string) => boolean): SampleMarks {
  const at = new Map<string, VoiceSample[]>();
  const moved: VoiceSample[] = [];
  for (const sample of list?.samples ?? []) {
    if (sample.source.chapterId !== chapterId) continue;
    const key = sample.source.endKey;
    if (!hasWord(key)) {
      moved.push(sample);
      continue;
    }
    const there = at.get(key);
    if (there) there.push(sample);
    else at.set(key, [sample]);
  }
  return { at, moved };
}

/** How a mark looks: a clip that cannot play is worse than words that moved, which is worse than fine. */
export type MarkState = 'ok' | 'changed' | 'missing';

export function markState(samples: readonly VoiceSample[]): MarkState {
  if (samples.some((s) => clipProblem(s))) return 'missing';
  if (samples.some((s) => passageBadge(s))) return 'changed';
  return 'ok';
}

/** What a screen reader hears for the dot: one sample by character and label with what is wrong with it, or the count when several end here. */
export function markName(samples: readonly VoiceSample[], nameOf: (characterId: string) => string | undefined): string {
  if (samples.length !== 1) return `${samples.length} voice samples`;
  const sample = samples[0];
  const who = nameOf(sample.characterId) ?? 'a character who is no longer in the Story Bible';
  const label = sample.label.trim();
  const problem = clipProblem(sample);
  const passage = sample.source.state === 'text_changed' ? 'The words changed since it was marked' : undefined;
  const wrong = problem ? problem.sentence.replace(/\.$/, '') : passage;
  return `Voice sample: ${who}${label ? `, ${label}` : ''}${wrong ? `. ${wrong}` : ''}`;
}
