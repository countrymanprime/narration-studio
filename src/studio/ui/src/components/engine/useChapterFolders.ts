import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChapterFolders } from '../../api/contracts/chapterTrackMap';
import { describeApiError } from '../../api/errorMessage';
import { usePort } from '../../ports/usePort';
import type { Notify } from '../primitives/Toast';

/**
 * Whether a linked chapter's track sits inside another linked chapter's folder in the DAW (#2838), and the repair that moves it out.
 * Checked when the Chapter links panel shows, whenever the links change (`revision`), and when the window gets focus, since the
 * narrator can change the folders in REAPER at any time. A check writes nothing; `repair` sends the moves the last check listed, and
 * the DAW writes only when it plans the same ones (else `stale`, and the panel checks again).
 */
/** What the folder check depends on in the links: each chapter and its track. A re-read that brings the same links is the same key, so it
 * does not check REAPER again. */
export function linksKey(mappings: readonly { chapterId: string; trackGuid: string }[]): string {
  return mappings
    .map((mapping) => `${mapping.chapterId}=${mapping.trackGuid}`)
    .sort()
    .join('|');
}

export function useChapterFolders({ revision, notify }: { revision: unknown; notify: Notify }) {
  const trackMap = usePort('chapterTrackMap');
  const [check, setCheck] = useState<ChapterFolders | null>(null);
  const [repairing, setRepairing] = useState(false);
  const asked = useRef(0);

  const recheck = useCallback(() => {
    const ask = ++asked.current;
    trackMap.chapterFoldersCheck().then(
      (answer) => ask === asked.current && setCheck(answer),
      // A check that fails says the folders were not checked, and why, with Check again: never a nesting the DAW did not report.
      (reason: unknown) =>
        ask === asked.current && setCheck({ outcome: 'refused', reason: 'failed', message: describeApiError(reason), moves: [], expected: [] }),
    );
  }, [trackMap]);

  useEffect(() => {
    recheck();
  }, [recheck, revision]);

  useEffect(() => {
    window.addEventListener('focus', recheck);
    return () => window.removeEventListener('focus', recheck);
  }, [recheck]);

  // `opened` is the check the narrator confirmed: exactly its chapters are sent, and the DAW answers stale if it would move others now.
  const repair = useCallback(
    (opened: ChapterFolders) => {
      if (repairing || opened.outcome !== 'nested') return;
      setRepairing(true);
      const folders = [...new Set(opened.moves.map((move) => move.fromName))].join(', ');
      trackMap
        .chapterFoldersRepair(opened.expected)
        .then((answer) => {
          if (answer.outcome === 'repaired' && answer.expected.length > 0) {
            const count = answer.expected.length;
            notify(
              `Moved ${count} ${count === 1 ? 'chapter' : 'chapters'} out of ${folders} in REAPER. One Undo in REAPER takes it back; save the project in REAPER to keep it.`,
              'info',
            );
          } else if (answer.outcome === 'repaired') {
            // Nothing moved (no chapter was nested any more): no undo to speak of (qa-breaker).
            notify('No chapter needed moving.', 'info');
          } else {
            notify(answer.message ?? 'Nothing was moved.', answer.outcome === 'stale' ? 'info' : 'error');
          }
        })
        .catch((reason: unknown) => notify(describeApiError(reason), 'error'))
        .finally(() => {
          setRepairing(false);
          recheck();
        });
    },
    [repairing, trackMap, notify, recheck],
  );

  return { check, repairing, repair, recheck };
}
