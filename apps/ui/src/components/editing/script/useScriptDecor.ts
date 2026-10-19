import { useMemo } from 'react';
import { speakerColour } from '../../../kinds/entityColour';
import { UNKNOWN_SPEAKER } from '../../booth/reading/boothUnits';
import { useEntries, useMarks, useSpeakers } from '../../script/page/data/useScriptData';
import { boothDecorations } from '../../booth/side/decorations';
import type { DecorPhrase, ScriptDecor } from './docFromHeard';

/** A line of the chapter, with the chapter it belongs to (the Story Bible keys its cues by both). */
interface Line {
  id: string;
  text: string;
}

const NONE: readonly Line[] = [];

/**
 * What the Story Bible and the Script's marks add to a chapter's text: who speaks each quotation (the dialogue cues), the names to underline
 * and the marked words, and the notes under a line. The Script and the Booth read the same shared lists, so a speaker or a mark changed there is here
 * the next time the page draws. A list that has not been read yet adds nothing: the text shows plain, then with the marks.
 */
export function useScriptDecor(chapterId: string, lines: readonly Line[] | undefined): { decor: ScriptDecor; settled: boolean } {
  const speakers = useSpeakers();
  const { entries, types, status: entriesStatus } = useEntries();
  const marks = useMarks();
  const own = lines ?? NONE;
  const decor = useMemo(() => {
    const phrases = new Map<string, readonly DecorPhrase[]>();
    for (const line of own) {
      const found = speakers.phrasesOf({ id: line.id, chapterId });
      if (found.length)
        phrases.set(
          line.id,
          found.map((q) => ({
            start: q.start,
            end: q.end,
            speaker: q.speaker?.canonical_name ?? UNKNOWN_SPEAKER,
            confirmed: q.state === 'confirmed',
            colour: speakerColour(types, q.speaker ?? undefined) ?? undefined,
          })),
        );
    }
    const { decorations, notes } = boothDecorations(own, entries, marks.value ?? { types: [], marks: [] }, types);
    return { phrases, decorations, notes };
  }, [own, chapterId, speakers, entries, types, marks.value]);
  // The page waits for the first answer of each list (or its failure), so the text is drawn once with its speakers and marks, and what hangs on the document
  // (the drawer's sections, the playback) is not put back when they arrive.
  const settled = [speakers, { status: entriesStatus, value: entries }, marks].every((v) => v.value !== undefined || v.status === 'error');
  return { decor, settled };
}
