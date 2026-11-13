import { useEffect, useRef, useState } from 'react';
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
 * Booth.follow_chapter_in_daw (Settings, on by default): whether going to a chapter in the Booth moves the DAW there too. `undefined` until
 * the setting is read, so nothing moves before it is known; a setting that cannot be read is the default, on. This is the one switch for
 * the Booth moving the DAW; a further DAW-follows-the-Booth behaviour reads it here too.
 */
export function useFollowChapterInDaw(): boolean | undefined {
  const system = usePort('system');
  const [follow, setFollow] = useState<boolean | undefined>(undefined);
  useEffect(() => {
    let live = true;
    system.settingsForScope('global').then(
      (fields) => live && setFollow(fields.Booth?.find((field) => 'follow_chapter_in_daw' === field.key)?.effectiveValue !== 'false'),
      () => live && setFollow(true),
    );
    return () => {
      live = false;
    };
  }, [system]);
  return follow;
}

/**
 * Going to a chapter in the Booth: the DAW goes to that chapter's track as well, so the narrator can punch from where the Booth is. With only a
 * chapter it goes to the end of the track; with a line (`seconds`, where the line sits in the track) it goes there. Sent once per Booth, when the
 * DAW can follow (`canFollow`); a DAW that is not connected yet is waited for a short while, and one that never can follow is left alone without a
 * word, since a Booth opened without a DAW is not a failure. A refusal from a DAW that can follow is said, with nothing moved.
 *
 * The Booth page mounts this once per chapter (the session is keyed by it), so every chapter the narrator goes to is moved to; the track selected
 * is the chapter's folder and the tracks inside it (go_to). `follow` is Booth.follow_chapter_in_daw: off, or not read yet, moves nothing.
 *
 * `target` is null until the line is known (the chapter's words are read); `enabled` is false for a chapter the Booth opened on by itself (the one
 * it followed the DAW to, or last left), where the DAW already is.
 */
export function useMoveDawOnOpen({
  enabled,
  follow,
  chapterId,
  canFollow,
  target,
  say,
}: {
  enabled: boolean;
  follow: boolean | undefined;
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
    if (!enabled || follow !== true || done.current || chapterId === '' || where === undefined || !canFollow) return;
    done.current = true;
    // A DAW that connected long after the Booth opened is not moved: the narrator has been working by then.
    if (Date.now() - openedAt.current > ASK_FOR_MS) return;
    void place
      .dawGoToChapter(chapterId, where, seconds)
      .then((result) => {
        if (!result.ok) sayRef.current(result.refused ?? result.message);
      })
      .catch(() => sayRef.current('The DAW could not be moved to this chapter. Move it by hand, or press Check again.'));
  }, [enabled, follow, chapterId, canFollow, where, seconds, place]);
}
