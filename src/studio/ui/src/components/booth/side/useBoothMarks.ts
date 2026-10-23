import { useEffect, useRef, useState } from 'react';
import type { Marks } from '../../../api/contracts/marks';
import { usePort } from '../../../ports/usePort';

const NONE: Marks = { types: [], marks: [] };

/**
 * The Script's marks and their types, read once when the Booth opens a chapter: the marked words, the notes under a paragraph and each
 * mark's thread. The Booth only reads them. A failed read leaves the text unmarked and is told through `onError`.
 */
export function useBoothMarks(onError: (message: string) => void): Marks {
  const marks = usePort('marks');
  const [list, setList] = useState<Marks>(NONE);
  const told = useRef(onError);
  told.current = onError;
  useEffect(() => {
    let live = true;
    marks.marksList().then(
      (next) => live && setList(next),
      (reason: unknown) => live && told.current(reason instanceof Error ? reason.message : String(reason)),
    );
    return () => {
      live = false;
    };
  }, [marks]);
  return list;
}
