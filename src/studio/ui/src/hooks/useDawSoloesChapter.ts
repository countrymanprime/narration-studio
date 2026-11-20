import { useEffect, useRef } from 'react';
import type { DawPlaceApi } from '../ports';
import { usePort } from '../ports/usePort';
import { useDawCapabilities } from './useDawCapabilities';
import { useFollowChapterInDaw } from './useDawGoesToChapter';
import { useToasts } from './useToasts';

/** The calls to the DAW run one after the other in the order the page made them, so a chapter entered right after the last one was left is never put back by it. */
let queue: Promise<unknown> = Promise.resolve();
const inOrder = (call: () => Promise<unknown>) => {
  queue = queue.then(call, call).catch(() => undefined);
};

/**
 * What this page knows of the solo, whichever page asked for it: `maySolo` is set when a solo was answered as done and cleared when a restore was; `owed`
 * when a restore that had something to take off failed; `told` once the narrator has been told (the host's sentence, said once per owed restore).
 */
let maySolo = false;
let owed = false;
let told = false;

type Say = (sentence: string) => void;

const restoreNow = (place: DawPlaceApi, say: Say | null) =>
  inOrder(async () => {
    try {
      const answer = await place.dawSoloRestore();
      if (answer.ok) {
        maySolo = false;
        owed = false;
        told = false;
        return;
      }
      // Nothing was answered as soloed and nothing is owed: nothing to take off, so nothing to say.
      if (!maySolo && !owed) return;
      // Something was soloed and could not be taken off: it is owed, and the host's sentence says what and what to do.
      owed = true;
      if (say && !told && answer.refused) {
        told = true;
        say(answer.refused);
      }
    } catch {
      // The call did not reach the host; the page's own DAW notices say so, and what may be soloed stays owed.
      owed = maySolo || owed;
    }
  });

/** Whether the switch is on and the DAW can follow. */
function useSoloActive(): boolean {
  const follow = useFollowChapterInDaw();
  const { caps } = useDawCapabilities();
  return follow === true && !!caps?.capabilities.follow_position?.available;
}

/**
 * The DAW goes quiet around the chapter the Booth is on (the Booth also records a pickup session): while it is on a chapter, with Booth.follow_chapter_in_daw
 * on and a DAW that can follow, the chapter's track is soloed in place in the DAW so the other chapters are silent and untouched (`dawSoloChapter`, #3428).
 * The Booth remounts for each chapter, so going to another chapter is a restore and then a solo; the DAW also puts the earlier chapter back before it
 * soloes the next. Leaving the Booth, a page with no chapter in view, or turning the switch off takes the solo off (`dawSoloRestore`, which the DAW does only
 * for what it soloed, where the narrator has not changed it since). A refused solo changes nothing and says nothing. A restore that could not take off a solo
 * that was answered as done is owed: the narrator is told once, with the host's sentence, and `useRetryOwedSoloRestore`, mounted once for the whole app,
 * sends it again when the DAW can follow again (the DAW's own ledger takes it off the next time its bridge starts). `chapterId` is undefined or '' for a
 * page with no chapter in view.
 */
export function useDawSoloesChapter(chapterId: string | undefined): void {
  const place = usePort('dawPlace');
  const active = useSoloActive();
  const { notify } = useToasts();
  const wanted = active && chapterId ? chapterId : null;
  const sent = useRef(false);

  const takeOff = useRef(() => {});
  takeOff.current = () => {
    sent.current = false;
    restoreNow(place, (sentence) => notify(sentence, 'error'));
  };

  useEffect(() => {
    if (wanted === null) {
      // The Booth is still open but is on no chapter: the chapter soloed before is taken off.
      if (sent.current) takeOff.current();
      return;
    }
    sent.current = true;
    inOrder(async () => {
      if ((await place.dawSoloChapter(wanted)).ok) maySolo = true;
    });
  }, [wanted, place]);

  // Only the page being left, or the switch or the DAW going away, takes it off.
  useEffect(() => {
    if (!active) return;
    return () => {
      // Nothing is sent for a page that never soloed (no chapter in view).
      if (sent.current) takeOff.current();
    };
  }, [active, place]);
}

/** Mounted once in the app shell: an owed restore is sent again whenever the DAW can follow again, on any page (Editing, Proof and Master & QC put it back too). */
export function useRetryOwedSoloRestore(): void {
  const place = usePort('dawPlace');
  const active = useSoloActive();
  useEffect(() => {
    if (active && owed) restoreNow(place, null);
  }, [active, place]);
}

/** For tests only: forgets what the page knows of the solo, so one test's owed restore does not reach the next. */
export function resetSoloDebtForTest(): void {
  maySolo = owed = told = false;
}
