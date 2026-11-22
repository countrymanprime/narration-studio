import { useEffect, useRef, useState } from 'react';
import { recordedAtOf, type RecordedAt } from '../../../recordedThrough';
import { useReadChapters } from '../../../studio/useChapters';

/**
 * How far the chapter is recorded (`recordedThrough`, the host's one value every page shows), read when the Companion opens and again each time a
 * reading session ends, since the take it recorded moved it. It returns `recordedThrough` together with whether the chapter's track holds audio, from the SAME read
 * (`RecordedAt`), so the resume notice's percent never pairs a new through with an old audio flag, and `recordedSeconds` (what "This chapter" prints as "Recorded 12:40") from that same read, so the two lines agree. A failed read keeps what was read before.
 */
export function useRecordedThrough(
  chapterId: string,
  active: boolean,
): { recorded: RecordedAt | undefined; recordedSeconds: number | null | undefined; reading: boolean } {
  const readChapters = useReadChapters();
  const ran = useRef(false);
  const [recorded, setRecorded] = useState<RecordedAt>();
  const [seconds, setSeconds] = useState<number | null>();
  const [read, setRead] = useState(false);
  useEffect(() => {
    if (active) return;
    let live = true;
    // Active ends when a take ends: that read is of what the take changed, so it reads now; the first one serves what the store holds.
    const fresh = ran.current;
    ran.current = true;
    readChapters(fresh).then(
      (chapters) => {
        if (!live) return;
        const found = chapters.find((chapter) => chapter.id === chapterId);
        setRecorded(found ? recordedAtOf(found) : undefined);
        setSeconds(found ? (found.recordedSeconds ?? null) : undefined);
        setRead(true);
      },
      () => live && setRead(true),
    );
    return () => {
      live = false;
    };
  }, [readChapters, chapterId, active]);
  return { recorded, recordedSeconds: seconds, reading: !read };
}
