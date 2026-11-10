import { NARRATION_CHARACTER_ID } from '../../../api/contracts/character';
import type { GuideEntity, GuideType } from '../../../api/contracts/storyBible';
import type { VoiceSample, VoiceSampleDawState, VoiceSamples } from '../../../api/contracts/voiceSamples';
import { canSpeak } from '../../../storyBibleTypes';
import type { MoveChoice } from './MoveVoiceSampleDialog';
import { clock } from '../../../clock';

/** m:ss for a sample's length, in whole seconds: "0:07". */
export function sampleLength(durationMs: number): string {
  return clock(durationMs / 1000);
}

const MIB = 1024 * 1024;

/** "11.4 MiB", the unit the project limit is written in ("200 MiB"); nothing is "0 MiB" and a sliver is "under 0.1 MiB". */
export function mebibytes(bytes: number): string {
  if (bytes <= 0) return '0 MiB';
  const value = Math.round((bytes / MIB) * 10) / 10;
  return value < 0.1 ? 'under 0.1 MiB' : `${value} MiB`;
}

/** What is wrong with a sample's audio file, in a badge word and the sentence under it; undefined when the clip is as saved. */
export function clipProblem(sample: VoiceSample): { badge: string; sentence: string; hint?: true } | undefined {
  // A sample kept only in the DAW has no file: its audio is whatever lies under its region in the saved project (docs/prds/character-voice-samples.prd.md).
  if (sample.storage === 'daw' && sample.daw && sample.clipState !== 'ok') return dawProblem(sample.daw.state);
  switch (sample.clipState) {
    case 'ok':
      return undefined;
    case 'missing':
      return { badge: 'Audio file missing', sentence: 'The audio file is missing.' };
    case 'size_changed':
    case 'hash_changed':
      return { badge: 'Audio file changed', sentence: 'The audio file changed since it was saved.' };
  }
}

/** Why a sample kept only in the DAW cannot play: the region is gone, not saved yet, or has no audio under it. */
function dawProblem(state: VoiceSampleDawState): { badge: string; sentence: string; hint: true } | undefined {
  // `hint`: the sentence is the badge's tooltip and the play control's reason, a short sentence of at most 80 characters, and is not drawn in the row.
  switch (state) {
    case 'label_missing':
      return { badge: 'Region removed', sentence: 'Its region is gone from the REAPER project, so the sample has ended.', hint: true };
    case 'not_saved':
      return { badge: 'Not saved in REAPER yet', sentence: 'Its region is not in the saved REAPER project yet.', hint: true };
    case 'source_missing':
      return { badge: 'Audio missing', sentence: 'The audio under its region is no longer in the REAPER project.', hint: true };
    case 'project_unreadable':
      return { badge: 'Project unreadable', sentence: 'The saved REAPER project could not be read.', hint: true };
    default:
      return { badge: 'Audio missing', sentence: 'The audio under its region could not be read.', hint: true };
  }
}

/** A badge for a sample kept in the DAW as well as the project whose region the project no longer shows as it was. The copy still plays. */
export function dawBadge(sample: VoiceSample): { badge: string; hint: string } | undefined {
  if (sample.storage !== 'both' || !sample.daw) return undefined;
  switch (sample.daw.state) {
    case 'ok':
      return undefined;
    case 'label_moved':
      return { badge: 'Region moved', hint: 'The region moved in REAPER, and the saved copy still plays.' };
    case 'label_missing':
      return { badge: 'Region removed', hint: 'The region is gone from REAPER, and the saved copy still plays.' };
    case 'not_saved':
      return { badge: 'Not saved in REAPER yet', hint: 'The region is not in the saved REAPER project yet.' };
    case 'source_missing':
    case 'project_unreadable':
      return { badge: 'Region unchecked', hint: 'The region could not be checked, and the saved copy still plays.' };
  }
}

/** A badge for words that no longer read as they did when the sample was marked; the sample still plays. */
export function passageBadge(sample: VoiceSample): { badge: string; hint: string } | undefined {
  switch (sample.source.state) {
    case 'ok':
      return undefined;
    case 'text_changed':
      return { badge: 'Passage changed', hint: 'The words in this chapter changed since the sample was marked. The sample still plays.' };
    case 'chapter_missing':
      return { badge: 'Chapter removed', hint: 'The chapter this sample was marked in is no longer in the manuscript. The sample still plays.' };
  }
}

/** A label for a sample that has none: its character's name and its length, as the play control names it. */
export function sampleName(sample: VoiceSample, characterName: string): string {
  return sample.label.trim() === '' ? characterName : sample.label;
}

/** One character's samples in the order the host lists them (primary first, then newest). */
export function samplesOf(list: VoiceSamples, characterId: string): VoiceSample[] {
  return list.samples.filter((sample) => sample.characterId === characterId);
}

/** Samples whose character is neither Narration nor an entry the Story Bible can still voice: they are kept and listed apart. */
export function orphanSamples(list: VoiceSamples, knownCharacterIds: ReadonlySet<string>): VoiceSample[] {
  return list.samples.filter((sample) => sample.characterId !== NARRATION_CHARACTER_ID && !knownCharacterIds.has(sample.characterId));
}

/** The characters a sample can be moved to: Narration, then every entry whose type speaks, by name. */
export function moveChoices(entities: readonly GuideEntity[], types: readonly GuideType[]): MoveChoice[] {
  const voices = entities
    .filter((entity) => canSpeak(types, entity.category))
    .map((entity) => ({ id: entity.id, name: entity.canonical_name }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return [{ id: NARRATION_CHARACTER_ID, name: 'Narration' }, ...voices];
}
