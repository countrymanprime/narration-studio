import { useEffect, useRef, useState } from 'react';
import type { RecordedThrough } from '../../../api/contracts/manuscript';
import type { ReadingParagraph } from '../reading/boothUnits';
import type { OpenedResume } from '../resume/resumeOfferModel';
import { openedResume, resumeStart } from '../resume/resumeStart';
import { loadChapterPlace, saveLastPlace, type LastPlace } from './lastPlace';

type Args = {
  /** The chapter on screen; absent for the credits, which have no place to keep. */
  chapter: { id: string } | undefined;
  paragraphs: readonly ReadingParagraph[];
  /** How many reading units the chapter has: the place can be chosen once there are some. */
  unitCount: number;
  projectFolder: string;
  /** The place to go back to when the Booth opened on the chapter the narrator left. */
  returnTo?: LastPlace;
  /** The Booth was opened at a target of its own (the address's `from`, a pickup line), placed by its own code. */
  explicit: boolean;
  recordedThrough: RecordedThrough | undefined;
  /** The reading's position now, kept as the last place once the chapter is placed. */
  position: { paragraphId: string; word: number } | undefined;
  /** A take is being listened to: when it ends, how far each chapter is recorded is read again. */
  listening: boolean;
  refreshRecorded: () => void;
  seek: (paragraphId: string, word: number) => void;
  setOpened: (opened: OpenedResume | null) => void;
  /** The place is back (or there was none). */
  onReturned: () => void;
};

/**
 * Where the chapter opens and where the Booth keeps the place (resume/resumeStart.ts, #2251): a target the narrator came with is placed by its own
 * code; otherwise the word after the last one recorded, else where they left this chapter, else its top. The place is kept as the reading moves
 * only once the chapter is placed (a save before then would overwrite it with the top).
 */
export function useChapterResume({
  chapter,
  paragraphs,
  unitCount,
  projectFolder,
  returnTo,
  explicit,
  recordedThrough,
  position,
  listening,
  refreshRecorded,
  seek,
  setOpened,
  onReturned,
}: Args): void {
  const [back, setBack] = useState(false);
  useEffect(() => {
    if (back) return;
    // The chapter the narrator left is on its way (the address is being changed to it): the fallback chapter on screen until then keeps nothing.
    if (returnTo && returnTo.chapterId !== chapter?.id) return;
    if (!chapter) return setBack(true);
    if (unitCount === 0) return;
    const kept = returnTo?.paragraphId ? returnTo : projectFolder ? loadChapterPlace(projectFolder, chapter.id) : null;
    const start = resumeStart({ paragraphs, explicit, recorded: recordedThrough, kept });
    const opened = openedResume(start);
    if (start.place && opened) {
      seek(start.place.paragraphId, start.place.word);
      setOpened(opened);
    }
    setBack(true);
    onReturned();
  }, [back, returnTo, chapter, unitCount, paragraphs, projectFolder, explicit, recordedThrough, seek, setOpened, onReturned]);

  // A take just ended (its listening session stopped): how far each chapter is recorded is read again, so a chapter the narrator comes
  // back to opens where this take ended.
  const wasListening = useRef(false);
  useEffect(() => {
    if (wasListening.current && !listening) refreshRecorded();
    wasListening.current = listening;
  }, [listening, refreshRecorded]);

  const placeParagraph = position?.paragraphId;
  const placeWord = position?.word;
  useEffect(() => {
    if (!projectFolder || !chapter || !back || placeParagraph === undefined || placeWord === undefined) return;
    saveLastPlace(projectFolder, { chapterId: chapter.id, paragraphId: placeParagraph, word: placeWord });
  }, [projectFolder, chapter, back, placeParagraph, placeWord]);
}
