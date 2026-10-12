// The Script route's deep links (App.tsx `goToScript`): "#p<index>" lands on a paragraph by its book-wide index and "#c<chapter>" on a
// chapter by id or title, from Proof, the Story Bible's Appears in and the jump menu. The old page read them; the mock has no URLs, so this
// keeps the links that already point here working. The credits cards read "#credits-opening" and "#credits-closing" (`ScriptCredits.tsx`).

import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { ManuscriptChapter } from '../../../../api/contracts/manuscript';
import { isListableChapter } from '../../../../state';

type Target = { chapterId: string; paragraphId?: string } | 'reference' | null;

/** What a hash points at among every chapter the host lists, reference chapters included; null for a hash that is not a deep link. */
export function deepLinkTarget(hash: string, chapters: readonly ManuscriptChapter[]): Target {
  let chapter: ManuscriptChapter | undefined;
  let paragraphId: string | undefined;
  if (/^#p\d+$/.test(hash)) {
    const index = Number(hash.slice(2));
    chapter = chapters.find((item) => item.paragraphIds?.some((row) => row.index === index));
    paragraphId = chapter?.paragraphIds?.find((row) => row.index === index)?.id;
  } else if (hash.startsWith('#c') && !hash.startsWith('#credits-')) {
    const wanted = decodeURIComponent(hash.slice(2));
    chapter = chapters.find((item) => item.id === wanted) ?? chapters.find((item) => item.title === wanted);
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
    if (target === null) return;
    handled.current = hash;
    if (target === 'reference') notify("That link points to reference material, which isn't shown in the manuscript reader.");
    else goTo(target);
    navigate('/script', { replace: true });
  }, [hash, chapters, goTo, notify, navigate]);
}
