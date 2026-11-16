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
 * - `dawPlace` (a read: no undo point, no change to the project) names the chapter whose folder and tracks inside it are exactly the selection.
 *   When that is the page's chapter nothing is sent, so a narrator who only moved the cursor keeps it where it is.
 * - Otherwise the selection is put back with `dawGoToChapter(chapter, 'at', cursor)`: the chapter's folder and its tracks selected, the cursor
 *   where the read found it. A pull-back restores the selection and leaves the cursor; only a chapter change moves the cursor to the chapter.
 *
 * Nothing runs while the DAW records (the host refuses the move too), when the DAW cannot follow or is not answering, when the chapter has no linked
 * track (the refusal is silent), or when the setting is off or not read yet. Two focus events in a row are one check, and one more is made after it
 * when a second arrived meanwhile; there is no queue, no timer and no standing read. A check whose page has gone or whose chapter changed while it
 * waited sends nothing: the chapter change has moved the DAW itself.
 */
export function useDawPullBack(chapterId: string | undefined): void {
  const place = usePort('dawPlace');
  const follow = useFollowChapterInDaw();
  const { caps } = useDawCapabilities();
  const recording = useIsRecording();
  const canFollow = !!caps?.capabilities.follow_position?.available;
  const active = follow === true && canFollow && !recording && !!chapterId;
  const chapterRef = useRef(chapterId);
  chapterRef.current = chapterId;

  useEffect(() => {
    if (!active) return;
    let live = true;
    let running = false;
    let again = false;
    const pullBack = async () => {
      const wanted = chapterRef.current;
      if (!wanted) return;
      try {
        const found = await place.dawPlace();
        if (!live || chapterRef.current !== wanted || !found.ok || found.chapterId === wanted) return;
        const cursor = Number.isFinite(found.cursor) && found.cursor >= 0 ? found.cursor : null;
        await place.dawGoToChapter(wanted, cursor === null ? 'start' : 'at', cursor ?? 0);
      } catch {
        // A read or a move that failed leaves the DAW as it is; the page's own DAW notices say what is wrong.
      }
    };
    const onFocus = () => {
      if (running) {
        again = true;
        return;
      }
      running = true;
      void (async () => {
        do {
          again = false;
          await pullBack();
        } while (again && live);
        running = false;
      })();
    };
    window.addEventListener('focus', onFocus);
    return () => {
      live = false;
      window.removeEventListener('focus', onFocus);
    };
  }, [active, place]);
}
