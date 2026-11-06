import { useEffect, useMemo, useState } from 'react';
import { usePort } from '../../ports/usePort';
import type { ManuscriptChapter, TranscriptState } from '../../types';

/**
 * What Compare shows for one chapter besides the live run: the last completed comparison (offered for review without running again, which needs no
 * linked project file), whether the narrator is reviewing it, and how many of the shown results are this chapter's. The Proof page's Compare panel and the
 * chapter view (`/proof/:chapterId`) both read it here, so the two routes tell the same story.
 */
export function useChapterCompare(chapter: ManuscriptChapter | undefined, transcript: TranscriptState) {
  const transcriptPort = usePort('transcript');
  const [lastCompleted, setLastCompleted] = useState<TranscriptState>();
  const [reviewingLast, setReviewingLast] = useState(false);

  useEffect(() => {
    void transcriptPort
      .transcriptLastCompleted()
      .then(setLastCompleted)
      .catch(() => {});
  }, [transcriptPort]);

  // A run covers the selected REAPER audio, so rows for other chapters are left out.
  const results = reviewingLast ? lastCompleted : transcript.phase === 'success' ? transcript : undefined;
  const foundHere = useMemo(() => (chapter ? (results?.rows ?? []).filter((row) => row.chapter === chapter.title).length : 0), [results?.rows, chapter]);

  return { lastCompleted, reviewingLast, setReviewingLast, foundHere };
}
