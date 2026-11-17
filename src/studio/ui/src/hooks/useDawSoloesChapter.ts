import { useEffect, useRef } from 'react';
import { usePort } from '../ports/usePort';
import { useDawCapabilities } from './useDawCapabilities';
import { useFollowChapterInDaw } from './useDawGoesToChapter';

/** The calls to the DAW run one after the other in the order the page made them, so a chapter entered right after the last one was left is never put back by it. */
let queue: Promise<unknown> = Promise.resolve();
const inOrder = (call: () => Promise<unknown>) => {
  queue = queue.then(call, call).catch(() => undefined);
};

/**
 * The DAW goes quiet around the chapter being recorded: while the Booth (which also records a pickup session) is on a chapter, with
 * Booth.follow_chapter_in_daw on and a DAW that can follow, the chapter's track is soloed in place in the DAW so the other chapters are silent and untouched
 * (`dawSoloChapter`, #3428). Going to another chapter moves the solo (the DAW puts the earlier one back); leaving the Booth, or turning the switch off, puts
 * it back (`dawSoloRestore`, which the DAW does only for what it soloed, where the narrator has not changed it since). A refusal or a failed call changes
 * nothing and says nothing: the page's own DAW notices say whether the DAW answers, and a solo that could not be put back is on the DAW's ledger, which puts it
 * back the next time its bridge starts. `chapterId` is undefined or '' for a page with no chapter in view.
 */
export function useDawSoloesChapter(chapterId: string | undefined): void {
  const place = usePort('dawPlace');
  const follow = useFollowChapterInDaw();
  const { caps } = useDawCapabilities();
  const active = follow === true && !!caps?.capabilities.follow_position?.available;
  const wanted = active && chapterId ? chapterId : null;
  const sent = useRef(false);
  useEffect(() => {
    if (wanted === null) return;
    sent.current = true;
    inOrder(() => place.dawSoloChapter(wanted));
  }, [wanted, place]);
  // Only the page being left, or the switch or the DAW going away, puts it back: a chapter change is the DAW's own move.
  useEffect(() => {
    if (!active) return;
    return () => {
      // Nothing is put back for a page that never soloed (no chapter in view).
      if (!sent.current) return;
      sent.current = false;
      inOrder(() => place.dawSoloRestore());
    };
  }, [active, place]);
}
