import { useMemo } from 'react';
import type { GuideEntity } from '../../../api/contracts/storyBible';
import { speakerColour } from '../../../kinds/entityColour';
import { canSpeak } from '../../../storyBibleTypes';
import type { GuideType } from '../../../types';
import { UNKNOWN_SPEAKER, type BoothUnit } from '../reading/boothUnits';
import { voicesInChapter } from '../side/nearby';

type Args = {
  paragraphs: ReadonlyArray<{ text: string }>;
  units: readonly BoothUnit[];
  entities: readonly GuideEntity[];
  types: readonly GuideType[];
  /** Records the narrator's speaker for a quote (`useBoothData`). */
  correctCue: (cueId: string, entityId: string) => Promise<void>;
  /** Says why a correction failed. */
  toast: (text: string) => void;
};

/** Who speaks in the chapter and in what colour, and the speaker chip's correction of a quote's speaker. */
export function useBoothSpeakers({ paragraphs, units, entities, types, correctCue, toast }: Args) {
  const inThisChapter = useMemo(() => voicesInChapter(paragraphs, units, entities, types), [paragraphs, units, entities, types]);
  const characters = useMemo(() => entities.filter((entity) => canSpeak(types, entity.category)), [entities, types]);
  // The speakers who speak in this chapter, for the picker's first group.
  const inChapter = useMemo(
    () => new Set(units.filter((unit) => unit.quoted && unit.speaker !== '' && unit.speaker !== UNKNOWN_SPEAKER).map((unit) => unit.speaker)),
    [units],
  );
  const colourOf = useMemo(() => {
    const byName = new Map(characters.map((entity) => [entity.canonical_name, entity]));
    return (speaker: string) => {
      const entity = byName.get(speaker);
      return entity ? (speakerColour(types, { category: entity.category, speakerColor: entity.speaker_color }) ?? undefined) : undefined;
    };
  }, [characters, types]);
  const setSpeaker = (cueId: string, speaker: string) => {
    const entity = characters.find((item) => item.canonical_name === speaker);
    if (!entity) return;
    correctCue(cueId, entity.id).catch((reason) => toast(reason instanceof Error ? reason.message : String(reason)));
  };
  return { inThisChapter, characters, inChapter, colourOf, setSpeaker };
}
