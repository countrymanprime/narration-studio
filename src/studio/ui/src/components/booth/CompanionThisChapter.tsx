import { useEffect, useRef, useState } from 'react';
import { useApi } from '../../api/ApiContext';
import { STATUS_LABELS, STATUS_TONE } from '../../chapterStatus';
import { Dot, toneColors } from '../primitives/StatusBadge';
import { clock } from '../../clock';
import type { ThisChapterRead } from './companion/useRecordedThrough';

/**
 * The companion's "This chapter" (mock 07: "Recorded 12:40 · check 97% coverage", "QC: not mastered · head room tone 0.3 s"):
 * the chapter's measured recorded length and its stage, from the one shared chapter list (`chapter`, read by `useRecordedThrough` with the resume notice's percent, so the
 * lines never disagree after a session), with the reason that holds the stage back, which only the Production overview computes (`readiness`, matched by id). The overview is
 * read when the companion opens and again when a reading session ends; an overview that cannot be read, or that lacks the chapter, leaves the two lines without a reason,
 * and a re-read that fails keeps the reason it had. The mock's check-coverage figure needs the closed-loop proofing session's own numbers, which the app does not have yet, so
 * it is not drawn; a chapter the list does not have says nothing was measured, and while the list is read nothing is drawn.
 */
export function CompanionThisChapter({
  chapterId,
  chapter,
  sessionActive = false,
}: {
  chapterId?: string;
  chapter?: ThisChapterRead | null;
  sessionActive?: boolean;
}) {
  const api = useApi();
  const [reason, setReason] = useState<{ chapterId?: string; text?: string }>({});
  // Re-read when a reading session ENDS (a take moved the stage and the length), not when one starts.
  const [ended, setEnded] = useState(0);
  const was = useRef(sessionActive);
  useEffect(() => {
    if (was.current && !sessionActive) setEnded((count) => count + 1);
    was.current = sessionActive;
  }, [sessionActive]);
  useEffect(() => {
    let live = true;
    void api
      .productionOverview()
      .then((overview) => live && setReason({ chapterId, text: overview.chapters.find((item) => item.id === chapterId)?.readiness?.reason }))
      .catch(() => live && setReason((before) => (before.chapterId === chapterId ? before : { chapterId })));
    return () => {
      live = false;
    };
  }, [api, chapterId, ended]);

  if (chapter === undefined) return null;
  if (chapter === null || chapterId === undefined) {
    return (
      <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
        Nothing measured for this chapter yet.
      </p>
    );
  }
  const seconds = chapter.recordedSeconds;
  const stageTone = toneColors(STATUS_TONE[chapter.status]).text;
  const why = reason.chapterId === chapterId ? reason.text : undefined;
  return (
    <ul className="space-y-1.5 text-sm">
      <li className="flex items-center gap-2">
        <Dot color={seconds === null ? toneColors('neutral').text : 'var(--ok)'} />
        {seconds === null ? 'Recorded length not measured' : `Recorded ${clock(seconds)}`}
      </li>
      <li className="flex items-center gap-2">
        <Dot color={stageTone} />
        <span>
          {STATUS_LABELS[chapter.status]}
          {why ? ` · ${why}` : ''}
        </span>
      </li>
    </ul>
  );
}
