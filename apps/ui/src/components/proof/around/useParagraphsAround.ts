import { useEffect, useRef, useState } from 'react';
import type { ManuscriptApi, ManuscriptParagraph } from '../../../api/contracts/manuscript';
import { apiErrorMessage } from '../../../api/errorMessage';
import { paragraphsAround, type Around } from './paragraphsAround';

const GONE = 'The script no longer has this paragraph.';

/**
 * The paragraphs around one note, read through `manuscriptParagraphs` once per chapter while the page is open (a page that steps
 * through a chapter's notes asks the host once). `reason` is the host's sentence when the read failed, or says the paragraph is gone.
 * A note with no chapter or paragraph asks nothing and answers nothing.
 */
export function useParagraphsAround(
  api: Pick<ManuscriptApi, 'manuscriptParagraphs'>,
  chapterId: string | null | undefined,
  paragraphId: string | null | undefined,
  words?: { text: string; ordinal?: number },
): { around: Around | undefined; reason: string | undefined } {
  const cache = useRef(new Map<string, Promise<ManuscriptParagraph[]>>());
  const live = useRef(api);
  live.current = api;
  const [answer, setAnswer] = useState<{ key: string; around?: Around; reason?: string }>();
  const key = chapterId && paragraphId ? `${chapterId}\n${paragraphId}\n${words?.text ?? ''}\n${words?.ordinal ?? 0}` : '';

  useEffect(() => {
    if (!chapterId || !paragraphId) return;
    let current = true;
    let read = cache.current.get(chapterId);
    if (!read) {
      read = live.current.manuscriptParagraphs(chapterId);
      cache.current.set(chapterId, read);
      // A failed read is not kept: the next note in the chapter asks again.
      read.catch(() => cache.current.delete(chapterId));
    }
    read.then(
      (paragraphs) => {
        if (!current) return;
        const around = paragraphsAround(paragraphs, paragraphId, words);
        setAnswer({ key, around, reason: around ? undefined : GONE });
      },
      (error: unknown) => current && setAnswer({ key, reason: `The script could not be read: ${apiErrorMessage(error)}` }),
    );
    return () => {
      current = false;
    };
    // `key` carries the chapter, the paragraph and the words.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return answer && answer.key === key ? { around: answer.around, reason: answer.reason } : { around: undefined, reason: undefined };
}
