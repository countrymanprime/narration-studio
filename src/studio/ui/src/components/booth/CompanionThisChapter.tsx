import { useEffect, useRef, useState } from 'react';
import { useApi } from '../../api/ApiContext';
import type { ProductionChapter } from '../../api/contracts/production';
import { STATUS_LABELS, STATUS_TONE } from '../../chapterStatus';
import { Dot, toneColors } from '../primitives/StatusBadge';
import { clock } from '../../clock';

/**
 * The companion's "This chapter" (mock 07: "Recorded 12:40 · check 97% coverage", "QC: not mastered · head room tone 0.3 s"):
 * what the Production board already knows about the chapter - its measured recorded length and its stage with the reason that
 * holds it back - read when it opens and again when a reading session ends; a re-read that fails keeps the lines it had. The recorded length is the caller's `recordedSeconds` when it has one: the resume notice's percent
 * comes from that same read, so the two lines never disagree after a session (a take moves both). The mock's check-coverage figure needs the closed-loop proofing session's own
 * numbers, which the app does not have yet, so it is not drawn; a chapter with nothing measured says so.
 */
export function CompanionThisChapter({
  chapterId,
  recordedSeconds,
  sessionActive = false,
}: {
  chapterId?: string;
  recordedSeconds?: number | null;
  sessionActive?: boolean;
}) {
  const api = useApi();
  const [state, setState] = useState<{ loaded: boolean; chapter?: ProductionChapter }>({ loaded: false });
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
      .then((overview) => live && setState({ loaded: true, chapter: overview.chapters.find((item) => item.id === chapterId) }))
      .catch(() => live && setState((before) => (before.loaded ? before : { loaded: true })));
    return () => {
      live = false;
    };
  }, [api, chapterId, ended]);

  if (!state.loaded) return null;
  const { chapter } = state;
  if (!chapter) {
    return (
      <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
        Nothing measured for this chapter yet.
      </p>
    );
  }
  const seconds = recordedSeconds !== undefined ? recordedSeconds : chapter.recordedSeconds;
  const stageTone = toneColors(STATUS_TONE[chapter.status]).text;
  const reason = chapter.readiness?.reason;
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
          {reason ? ` · ${reason}` : ''}
        </span>
      </li>
    </ul>
  );
}
