import { useEffect, useState } from 'react';
import { useApi } from '../../../api/ApiContext';
import type { RecordedThrough } from '../../../api/contracts/manuscript';

/**
 * How far the chapter is recorded (`recordedThrough`, the host's one value every page shows), read when the Companion opens and again each time a
 * reading session ends, since the take it recorded moved it. A failed read keeps what was read before.
 */
export function useRecordedThrough(chapterId: string, active: boolean): { recorded: RecordedThrough | undefined; reading: boolean } {
  const api = useApi();
  const [recorded, setRecorded] = useState<RecordedThrough>();
  const [read, setRead] = useState(false);
  useEffect(() => {
    if (active) return;
    let live = true;
    api.manuscriptChapters().then(
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
  }, [api, chapterId, active]);
  return { recorded, reading: !read };
}
