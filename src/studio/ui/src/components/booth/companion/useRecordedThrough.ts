import { useEffect, useState } from 'react';
import type { RecordedThrough } from '../../../api/contracts/manuscript';
import { usePort } from '../../../ports/usePort';

/**
 * How far the chapter is recorded (`recordedThrough`, the host's one value every page shows), read when the Companion opens and again each time a
 * reading session ends, since the take it recorded moved it. A failed read keeps what was read before.
 */
export function useRecordedThrough(chapterId: string, active: boolean): { recorded: RecordedThrough | undefined; reading: boolean } {
  const manuscript = usePort('manuscript');
  const [recorded, setRecorded] = useState<RecordedThrough>();
  const [read, setRead] = useState(false);
  useEffect(() => {
    if (active) return;
    let live = true;
    manuscript.manuscriptChapters().then(
      (chapters) => {
        if (!live) return;
        setRecorded(chapters.find((chapter) => chapter.id === chapterId)?.recordedThrough);
        setRead(true);
      },
      () => live && setRead(true),
    );
    return () => {
      live = false;
    };
  }, [manuscript, chapterId, active]);
  return { recorded, reading: !read };
}
