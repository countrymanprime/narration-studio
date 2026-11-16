import { useEffect, useRef, useState } from 'react';
import { usePort } from '../ports/usePort';
import { useDawCapabilities } from './useDawCapabilities';

/**
 * Booth.follow_chapter_in_daw (Settings, on by default): whether the DAW follows the chapter the narrator is working on. `undefined` until the
 * setting is read, so nothing moves before it is known; a setting that cannot be read is the default, on. This is the one switch for the DAW
 * following the Booth, Editing and Pickups.
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
 * The DAW follows the page: opening a chapter on a page that works on one chapter's tracks (Editing, Pickups scoped to a chapter) selects that
 * chapter's folder and the tracks inside it in the DAW and puts the cursor where its audio starts. It is sent once per chapter, when the setting
 * is on and the DAW can follow (`follow_position`), so a DAW that is not connected, or one that connects later, is followed from that moment and a
 * DAW that never can is left alone without a word. A refusal (a chapter with no linked track, a track the DAW no longer has) moves nothing and
 * says nothing: the page's own DAW notices say why. `chapterId` is undefined or '' for a page with no chapter in view.
 */
export function useMirrorChapterInDaw(chapterId: string | undefined): void {
  const place = usePort('dawPlace');
  const follow = useFollowChapterInDaw();
  const { caps } = useDawCapabilities();
  const canFollow = !!caps?.capabilities.follow_position?.available;
  const sent = useRef<string | null>(null);
  const wanted = follow === true && canFollow && chapterId ? chapterId : null;
  useEffect(() => {
    if (wanted === null) {
      sent.current = null;
      return;
    }
    if (sent.current === wanted) return;
    sent.current = wanted;
    // The newest chapter wins: a call for a chapter the narrator has already left is not undone, the next one moves the DAW on.
    place.dawGoToChapter(wanted, 'start', 0).catch(() => undefined);
  }, [wanted, place]);
}
