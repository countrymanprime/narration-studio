import { useEffect, useState } from 'react';
import { recordedAtOf, type RecordedAt } from '../../../recordedThrough';
import { usePort } from '../../../ports/usePort';

/**
 * How far the chapter is recorded (`recordedThrough`, the host's one value every page shows), read when the Companion opens and again each time a
 * reading session ends, since the take it recorded moved it. It returns `recordedThrough` together with whether the chapter's track holds audio, from the SAME read
 * (`RecordedAt`), so the resume notice's percent never pairs a new through with an old audio flag. A failed read keeps what was read before.
 */
export function useRecordedThrough(chapterId: string, active: boolean): { recorded: RecordedAt | undefined; reading: boolean } {
  const manuscript = usePort('manuscript');
  const [recorded, setRecorded] = useState<RecordedAt>();
  const [read, setRead] = useState(false);
  useEffect(() => {
    if (active) return;
    let live = true;
    manuscript.manuscriptChapters().then(
      (chapters) => {
        if (!live) return;
        const found = chapters.find((chapter) => chapter.id === chapterId);
        setRecorded(found ? recordedAtOf(found) : undefined);
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
