import { useEffect, useRef } from 'react';
import { usePort } from '../ports/usePort';
import { useDawCapabilities } from './useDawCapabilities';
import { useFollowChapterInDaw } from './useDawGoesToChapter';
import { useToasts } from './useToasts';

/** The calls to the DAW run one after the other in the order the page made them, so a chapter entered right after the last one was left is never put back by it. */
let queue: Promise<unknown> = Promise.resolve();
const inOrder = (call: () => Promise<unknown>) => {
  queue = queue.then(call, call).catch(() => undefined);
};

/** A restore that did not reach the DAW is owed until one does, whichever page asks next. The narrator is told once per owed restore. */
let owed = false;
let told = false;
const LEFT_SOLOED =
  "The DAW could not put the chapter's track back after you left the Booth, so the other chapters may stay silent. Unsolo the chapter's track in the DAW.";

/**
 * The DAW goes quiet around the chapter the Booth is on (the Booth also records a pickup session): while it is on a chapter, with Booth.follow_chapter_in_daw
 * on and a DAW that can follow, the chapter's track is soloed in place in the DAW so the other chapters are silent and untouched (`dawSoloChapter`, #3428).
 * The Booth remounts for each chapter, so going to another chapter is a restore and then a solo; the DAW also puts the earlier chapter back before it
 * soloes the next. Leaving the Booth, a page with no chapter in view, or turning the switch off puts it back (`dawSoloRestore`, which the DAW does only for
 * what it soloed, where the narrator has not changed it since). A refused solo changes nothing and says nothing: the page's own DAW notices say whether
 * the DAW answers. A restore that fails is owed: the narrator is told once what may be left soloed, and it is sent again when the DAW can follow again
 * (the DAW's own ledger puts it back the next time its bridge starts). `chapterId` is undefined or '' for a page with no chapter in view.
 */
export function useDawSoloesChapter(chapterId: string | undefined): void {
  const place = usePort('dawPlace');
  const follow = useFollowChapterInDaw();
  const { caps } = useDawCapabilities();
  const { notify } = useToasts();
  const active = follow === true && !!caps?.capabilities.follow_position?.available;
  const wanted = active && chapterId ? chapterId : null;
  const sent = useRef(false);

  const putBack = useRef(() => {});
  putBack.current = () => {
    sent.current = false;
    inOrder(async () => {
      let message = LEFT_SOLOED;
      try {
        const answer = await place.dawSoloRestore();
        if (answer.ok) {
          owed = false;
          told = false;
          return;
        }
        message = answer.refused || message;
      } catch {
        message = LEFT_SOLOED;
      }
      owed = true;
      if (!told) {
        told = true;
        notify(message, 'error');
      }
    });
  };

  // The DAW can follow again: a restore that was owed goes first.
  useEffect(() => {
    if (!active || !owed) return;
    inOrder(async () => {
      try {
        owed = !(await place.dawSoloRestore()).ok;
      } catch {
        owed = true;
      }
      if (!owed) told = false;
    });
  }, [active, place]);

  useEffect(() => {
    if (wanted === null) {
      // The Booth is still open but is on no chapter: the chapter soloed before is put back.
      if (sent.current) putBack.current();
      return;
    }
    sent.current = true;
    inOrder(() => place.dawSoloChapter(wanted));
  }, [wanted, place]);

  // Only the page being left, or the switch or the DAW going away, puts it back.
  useEffect(() => {
    if (!active) return;
    return () => {
      // Nothing is put back for a page that never soloed (no chapter in view).
      if (sent.current) putBack.current();
    };
  }, [active, place]);
}
