import { useEffect, useRef } from 'react';
import { useIsRecording } from '../daw/useIsRecording';
import { usePort } from '../ports/usePort';
import { useDawCapabilities } from './useDawCapabilities';
import { useFollowChapterInDaw } from './useDawGoesToChapter';

/**
 * The app leads, the DAW follows (#3428, owner A9): when the app window gets focus back, the DAW is put back on the chapter the page is on if the
 * narrator moved its selection somewhere else in the meantime. Booth.follow_chapter_in_daw governs it, like the move on opening a chapter.
 *
 * It asks first and moves second, so a DAW that has not changed is not touched:
 * - `dawPlace` (a read: no undo point, no change to the project) names the chapter whose linked track is the one selected, or, for a folder of voices
 *   with several tracks selected, the one whose folder and tracks inside it are exactly the selection (a folder selected alone names its chapter too,
 *   so it is not pulled back). When that is the page's chapter nothing is sent, so a narrator who only moved the cursor keeps it where it is.
 * - Otherwise the selection is put back with `dawGoToChapter(chapter, 'at', cursor)`: the chapter's folder and its tracks selected, the cursor
 *   where the read found it (a cursor the read cannot give leaves the DAW alone: nothing is guessed). A pull-back restores the selection and leaves
 *   the cursor; only a chapter change moves the cursor to the chapter.
 *
 * Nothing runs while the DAW records (the host refuses the move too), when the DAW cannot follow or is not answering, when the chapter has no linked
 * track (the refusal is silent), or when the setting is off or not read yet. Two focus events in a row are one check, and one more is made after it
 * when a second arrived meanwhile; there is no queue, no timer and no standing read. A check whose page has gone or whose chapter changed while it
 * waited sends nothing: the chapter change has moved the DAW itself. `busy` is the page's move on open, when it has one under way: nothing is sent
 * while it runs. A read or move that never settles is bounded by the host (3 seconds a call), not by a timer here.
 */
export function useDawPullBack(chapterId: string | undefined, busy?: { readonly current: boolean }): void {
  const place = usePort('dawPlace');
  const follow = useFollowChapterInDaw();
  const { caps } = useDawCapabilities();
  const recording = useIsRecording();
  const canFollow = !!caps?.capabilities.follow_position?.available;
  const active = follow === true && canFollow && !recording && !!chapterId;
  const chapterRef = useRef(chapterId);
  chapterRef.current = chapterId;
  // Counts the chapter changes and the page's own end: a check belongs to the generation it began in, and one that outlives it (a read that never
  // settles) neither moves the DAW nor holds up the next focus.
  const generation = useRef(0);
  const running = useRef(false);
  const again = useRef(false);
  useEffect(() => {
    generation.current += 1;
    running.current = false;
    again.current = false;
    return () => {
      generation.current += 1;
    };
  }, [chapterId]);

  useEffect(() => {
    if (!active) return;
    const pullBack = async (wanted: string, mine: number) => {
      try {
        const found = await place.dawPlace();
        if (generation.current !== mine || busy?.current || !found.ok || found.chapterId === wanted) return;
        // A cursor that cannot be read is not guessed at: the selection is restored only with the cursor left where it is.
        if (!Number.isFinite(found.cursor) || found.cursor < 0) return;
        await place.dawGoToChapter(wanted, 'at', found.cursor);
      } catch {
        // A read or a move that failed leaves the DAW as it is; the page's own DAW notices say what is wrong.
      }
    };
    const onFocus = () => {
      // The page's own move on open is under way: it puts the DAW on the chapter, so a second move for the same chapter is not sent.
      if (busy?.current) return;
      if (running.current) {
        again.current = true;
        return;
      }
      const mine = generation.current;
      const wanted = chapterRef.current;
      if (!wanted) return;
      running.current = true;
      void (async () => {
        do {
          again.current = false;
          await pullBack(wanted, mine);
        } while (again.current && generation.current === mine);
        if (generation.current === mine) running.current = false;
      })();
    };
    window.addEventListener('focus', onFocus);
    return () => {
      window.removeEventListener('focus', onFocus);
      // A page that goes (or a switch turned off) ends the check in flight; a new listener starts with nothing running.
      generation.current += 1;
      running.current = false;
      again.current = false;
    };
  }, [active, place, busy]);
}
