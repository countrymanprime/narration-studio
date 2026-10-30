import { useEffect, useRef } from 'react';
import { usePort } from '../../../ports/usePort';

/** How often the DAW is asked where the narrator is while it has not answered yet (it may still be connecting), and how long the Booth keeps asking. */
const ASK_EVERY_MS = 2000;
const ASK_FOR_MS = 20_000;

/**
 * Opening the Booth with no chapter asked for: it opens on the chapter whose track the narrator is on in the DAW. The DAW may not have
 * connected yet (the app connects on its own a few seconds after it opens), so an unanswered ask is repeated for a short while; an answer that names
 * no chapter (no track selected, several, or a track no chapter is linked to) leaves the Booth where it opens anyway. It is asked once per
 * Booth, never once the narrator or the address has chosen a chapter, and never while a take runs. Any DAW whose `follow_position`
 * capability answers is followed the same way.
 *
 * `chapterIds` is the narration chapters, or undefined until they are read; `enabled` is false once something else chose the chapter.
 */
export function useFollowDawOnOpen({
  enabled,
  chapterIds,
  onChapter,
}: {
  enabled: boolean;
  chapterIds: readonly string[] | undefined;
  onChapter: (chapterId: string) => void;
}) {
  const place = usePort('dawPlace');
  const settled = useRef(false);
  const onChapterRef = useRef(onChapter);
  onChapterRef.current = onChapter;
  const ready = enabled && chapterIds !== undefined && chapterIds.length > 0;
  const ids = useRef(chapterIds);
  ids.current = chapterIds;
  useEffect(() => {
    if (!ready || settled.current) return;
    let live = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = Date.now() + ASK_FOR_MS;
    const ask = () => {
      void place
        .dawPlace()
        .then((answer) => {
          if (!live) return;
          if (answer.ok) {
            settled.current = true;
            if (answer.chapterId !== '' && ids.current?.includes(answer.chapterId)) onChapterRef.current(answer.chapterId);
            return;
          }
          if (Date.now() < deadline) timer = setTimeout(ask, ASK_EVERY_MS);
        })
        // A read that failed is the same as one the DAW has not answered: it is asked again until the time is up, and the Booth opens as it would have.
        .catch(() => {
          if (live && Date.now() < deadline) timer = setTimeout(ask, ASK_EVERY_MS);
        });
    };
    ask();
    return () => {
      live = false;
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [ready, place]);
}

/**
 * Opening the Booth at a chapter: the DAW goes to that chapter's track as well, so the narrator can punch from where the Booth is. With only a
 * chapter it goes to the end of the track; with a line (`seconds`, where the line sits in the track) it goes there. Sent once per Booth, when the
 * DAW can follow (`canFollow`); a DAW that is not connected yet is waited for a short while, and one that never can follow is left alone without a
 * word, since a Booth opened without a DAW is not a failure. A refusal from a DAW that can follow is said, with nothing moved.
 *
 * `target` is null until the line is known (the chapter's words are read); `enabled` is false for a Booth that followed the DAW.
 */
export function useMoveDawOnOpen({
  enabled,
  chapterId,
  canFollow,
  target,
  say,
}: {
  enabled: boolean;
  chapterId: string;
  canFollow: boolean;
  target: { where: 'end' } | { where: 'at'; seconds: number } | null;
  say: (sentence: string) => void;
}) {
  const place = usePort('dawPlace');
  const done = useRef(false);
  const openedAt = useRef(Date.now());
  const sayRef = useRef(say);
  sayRef.current = say;
  const where = target?.where;
  const seconds = target?.where === 'at' ? target.seconds : 0;
  useEffect(() => {
    if (!enabled || done.current || chapterId === '' || where === undefined || !canFollow) return;
    done.current = true;
    // A DAW that connected long after the Booth opened is not moved: the narrator has been working by then.
    if (Date.now() - openedAt.current > ASK_FOR_MS) return;
    void place
      .dawGoToChapter(chapterId, where, seconds)
      .then((result) => {
        if (!result.ok) sayRef.current(result.refused ?? result.message);
      })
      .catch(() => sayRef.current('The DAW could not be moved to this chapter. Move it by hand, or press Check again.'));
  }, [enabled, chapterId, canFollow, where, seconds, place]);
}
