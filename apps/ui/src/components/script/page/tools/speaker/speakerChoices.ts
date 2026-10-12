// Who can be picked as the speaker of a phrase (SNB-7h), ported from the mock's `selectors/speakers.ts` (`speakerCandidates`) and
// `ui/SpeakerPicker.tsx` (`speakersInChapter`) onto the host's Story Bible entries and dialogue cues. A choice is one name of a
// speaking entry (its own name or an alias): the picker shows the name the Story Bible spells with the entry's name beneath, and
// choosing it confirms the entry. The narration is never a choice. Pure: the page passes in what it has read.

import type { ManuscriptParagraph } from '../../../../../api/contracts/manuscript';
import type { GuideDialogueCue, GuideEntity } from '../../../../../api/contracts/storyBible';
import { speakerColorIndex } from '../../../../primitives/speakerColor';
import { entriesInChapter, speakerCandidates } from '../../data/script.selectors';

export type SpeakerChoice = {
  entryId: string;
  /** The name as the Story Bible spells it: the entry's own name or one alias. */
  name: string;
  /** The entry the name belongs to, shown beneath it. */
  entryName: string;
  /** 1..7, the entry's `--speaker-N` (its own pick, else the stable one). */
  colourIndex: number;
};

export const speakerColourIndexOf = (entry: Pick<GuideEntity, 'id' | 'speaker_color'>): number => speakerColorIndex(entry.id, entry.speaker_color);

/** Every name of every speaking entry; a name two entries share belongs to the first in the list. */
export function speakerChoices(entries: readonly GuideEntity[]): SpeakerChoice[] {
  const seen = new Set<string>();
  return speakerCandidates(entries).flatMap((entry) =>
    [entry.canonical_name, ...entry.aliases.map((alias) => alias.text)]
      .filter((name) => {
        const key = name.trim().toLowerCase();
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .map((name) => ({ entryId: entry.id, name, entryName: entry.canonical_name, colourIndex: speakerColourIndexOf(entry) })),
  );
}

/** Speakers worth suggesting for a phrase: entries that speak somewhere in its chapter, or are named in its text. */
export function speakersInChapter(
  entries: readonly GuideEntity[],
  cues: readonly GuideDialogueCue[],
  paragraphs: readonly Pick<ManuscriptParagraph, 'text'>[],
  chapterId: string,
): SpeakerChoice[] {
  const present = new Set(cues.filter((cue) => cue.chapterId === chapterId && cue.speaker_entity_id).map((cue) => cue.speaker_entity_id));
  for (const entry of entriesInChapter(entries, paragraphs)) present.add(entry.id);
  return speakerChoices(entries).filter((choice) => present.has(choice.entryId));
}

/** Choices whose name or entry's name contains the search, ignoring case. */
export function searchSpeakers(choices: readonly SpeakerChoice[], search: string): SpeakerChoice[] {
  const term = search.trim().toLowerCase();
  return choices.filter((choice) => choice.name.toLowerCase().includes(term) || choice.entryName.toLowerCase().includes(term));
}
