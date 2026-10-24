import { useEffect, useState } from 'react';
import { usePort } from '../../../ports/usePort';
import { WORDS_PER_PAGE, wordsPerPageOf } from './pageBreaks';

/**
 * Booth.words_per_page through the settings port, at project scope: WORDS_PER_PAGE until it is read, and while it cannot be (the pages
 * still break, at the default). Settings changes it; the Booth reads it when it opens.
 */
export function useWordsPerPage(): number {
  const system = usePort('system');
  const [perPage, setPerPage] = useState(WORDS_PER_PAGE);
  useEffect(() => {
    let live = true;
    system.settingsForScope('project').then(
      (fields) => live && setPerPage(wordsPerPageOf(fields)),
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [system]);
  return perPage;
}
