// The Script route's deep links (App.tsx `goToScript`): "#p<index>" lands on a paragraph by its book-wide index and "#c<chapter>" on a
// chapter by id or title, from Proof, the Story Bible's Appears in and the jump menu. The old page read them; the mock has no URLs, so this
// keeps the links that already point here working. The credits cards read "#credits-opening" and "#credits-closing" (`ScriptCredits.tsx`).

import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { ManuscriptChapter } from '../../../../api/contracts/manuscript';
import { isListableChapter } from '../../../../state';

type Target = { chapterId: string; paragraphId?: string } | 'reference' | null;

const safeDecode = (text: string): string | null => {
  try {
    return decodeURIComponent(text);
  } catch {
    return null;
  }
};

/** Whether a hash is shaped like a paragraph or chapter link (and not the credits cards' or another anchor). */
export const isDeepLinkShaped = (hash: string): boolean => /^#p\d+$/.test(hash) || (hash.startsWith('#c') && !hash.startsWith('#credits-'));

/** What a hash points at among every chapter the host lists, reference chapters included; null for a hash that is not a deep link. */
export function deepLinkTarget(hash: string, chapters: readonly ManuscriptChapter[]): Target {
  let chapter: ManuscriptChapter | undefined;
  let paragraphId: string | undefined;
  if (/^#p\d+$/.test(hash)) {
    const index = Number(hash.slice(2));
    chapter = chapters.find((item) => item.paragraphIds?.some((row) => row.index === index));
    paragraphId = chapter?.paragraphIds?.find((row) => row.index === index)?.id;
  } else if (hash.startsWith('#c') && !hash.startsWith('#credits-')) {
    const wanted = safeDecode(hash.slice(2));
    if (wanted !== null) chapter = chapters.find((item) => item.id === wanted) ?? chapters.find((item) => item.title === wanted);
  }
  if (!chapter) return null;
  if (!isListableChapter(chapter)) return 'reference';
  return paragraphId ? { chapterId: chapter.id, paragraphId } : { chapterId: chapter.id };
}

/** Goes to the hash's paragraph or chapter once, then takes the hash off the address so Back does not land on it again. */
export function useDeepLink({
  chapters,
  goTo,
  notify,
}: {
  chapters: readonly ManuscriptChapter[];
  goTo: (target: { chapterId: string; paragraphId?: string }) => void;
  notify: (message: string) => void;
}): void {
  const { hash } = useLocation();
  const navigate = useNavigate();
  const handled = useRef('');
  useEffect(() => {
    if (!hash) {
      handled.current = '';
      return;
    }
    if (handled.current === hash) return;
    const target = deepLinkTarget(hash, chapters);
    if (target === null) {
      // A link shaped like a chapter or line that the manuscript lacks (removed since the link was made) is said so, once the list is read:
      // before then an empty list would call every link stale.
      if (!isDeepLinkShaped(hash) || chapters.length === 0) return;
      handled.current = hash;
      notify("That link points to a chapter or line that isn't in this manuscript.");
      navigate('/script', { replace: true });
      return;
    }
    handled.current = hash;
    if (target === 'reference') notify("That link points to reference material, which isn't shown in the manuscript reader.");
    else goTo(target);
    navigate('/script', { replace: true });
  }, [hash, chapters, goTo, notify, navigate]);
}
