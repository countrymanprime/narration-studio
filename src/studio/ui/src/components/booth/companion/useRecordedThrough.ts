import { useEffect, useRef, useState } from 'react';
import type { ChapterStatus } from '../../../api/contracts/manuscript';
import { recordedAtOf, type RecordedAt } from '../../../recordedThrough';
import { useReadChapters } from '../../../studio/useChapters';

/** What "This chapter" draws from the shared list: the chapter's stage and its measured recorded length (null when none). */
export type ThisChapterRead = { status: ChapterStatus; recordedSeconds: number | null };

/**
 * How far the chapter is recorded (`recordedThrough`, the host's one value every page shows), read when the Companion opens and again each time a
 * reading session ends, since the take it recorded moved it. It returns `recordedThrough` together with whether the chapter's track holds audio, from the SAME read
 * (`RecordedAt`), so the resume notice's percent never pairs a new through with an old audio flag, and the chapter's `status` and `recordedSeconds` (what "This chapter" prints as "Recorded 12:40" and its stage) from that same read, so the lines agree. `chapter` is undefined while the list is read, null when the list has no such chapter (or its first read failed). A failed re-read keeps what was read before.
 */
export function useRecordedThrough(
  chapterId: string,
  active: boolean,
): { recorded: RecordedAt | undefined; chapter: ThisChapterRead | null | undefined; reading: boolean } {
  const readChapters = useReadChapters();
  const ran = useRef(false);
  const [recorded, setRecorded] = useState<RecordedAt>();
  const [chapter, setChapter] = useState<ThisChapterRead | null>();
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
        setChapter(found ? { status: found.status, recordedSeconds: found.recordedSeconds ?? null } : null);
        setRead(true);
      },
      () => {
        if (!live) return;
        // A first read that fails says nothing was measured; a re-read that fails keeps the lines it had.
        setChapter((before) => before ?? null);
        setRead(true);
      },
    );
    return () => {
      live = false;
    };
  }, [readChapters, chapterId, active]);
  return { recorded, chapter, reading: !read };
}
