import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { NARRATION_CHARACTER_ID } from '../../../api/contracts/character';
import { usePort } from '../../../ports/usePort';
import { useSamplePlayer, type SamplePlayer } from '../../voicesamples/useSamplePlayer';
import { useVoiceSamples } from '../../voicesamples/useVoiceSamples';
import { sampleMarks, type SampleMarks } from './sampleMarks';

/** What the dots in the script need that changes only when the samples do: where each sits, whose it is, and where "Open in Story Bible" leads. */
export type SampleMarksValue = {
  marks: SampleMarks;
  /** The character's name, or undefined when the Story Bible has no such entry (it was read, and the character is gone). */
  nameOf: (characterId: string) => string | undefined;
  /** Opens a character's Story Bible entry. Absent where the page has no router, and then no link is drawn. */
  onOpenStoryBible?: (entityId: string) => void;
};

export const SampleMarksContext = createContext<SampleMarksValue | null>(null);

/** The one shared sample player, apart from the marks: its progress changes many times a second and only an open popover reads it. */
export const SamplePlayerContext = createContext<SamplePlayer | null>(null);

export const useSampleMarksValue = (): SampleMarksValue | null => useContext(SampleMarksContext);
export const useSamplePlayerHandle = (): SamplePlayer | null => useContext(SamplePlayerContext);

/**
 * The chapter's voice-sample dots (docs/prds/character-voice-samples.prd.md, phase 7): reads the project's samples, which the host sends
 * again whenever one changes, and the characters' names, and says where each sample's last word is in the chapter now. A list that failed
 * to read draws the dots of the last list it did read, and none before that: the dots are an extra, so the page says nothing more.
 */
export function useSampleMarks({
  chapterId,
  hasWord,
  onOpenStoryBible,
}: {
  chapterId: string;
  hasWord: (key: string) => boolean;
  onOpenStoryBible?: (entityId: string) => void;
}): { marks: SampleMarksValue; player: SamplePlayer } {
  const { read } = useVoiceSamples();
  const storyBible = usePort('storyBible');
  const list = read.status === 'ready' ? read.samples : read.status === 'failed' ? read.samples : undefined;
  const [names, setNames] = useState<ReadonlyMap<string, string> | null>(null);
  // The names are read again with the list, so a character added a moment ago is named. A failed read leaves the names as they were.
  useEffect(() => {
    let current = true;
    storyBible
      .guideEntities()
      .then((entities) => {
        if (current) setNames(new Map(entities.map((e) => [e.id, e.canonical_name])));
      })
      .catch(() => undefined);
    return () => {
      current = false;
    };
  }, [storyBible, list]);

  const player = useSamplePlayer();
  const marks = useMemo(() => sampleMarks(list, chapterId, hasWord), [list, chapterId, hasWord]);
  const value = useMemo<SampleMarksValue>(
    () => ({
      marks,
      // Narration is not an entry. Before the names are read, or when the read failed, a character is named plainly rather than called gone.
      nameOf: (id) => (id === NARRATION_CHARACTER_ID ? 'Narration' : names ? names.get(id) : 'this character'),
      onOpenStoryBible,
    }),
    [marks, names, onOpenStoryBible],
  );
  return { marks: value, player };
}
