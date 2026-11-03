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
export function useChapterFolders({ revision, notify }: { revision: unknown; notify: Notify }) {
  const trackMap = usePort('chapterTrackMap');
  const [check, setCheck] = useState<ChapterFolders | null>(null);
  const [repairing, setRepairing] = useState(false);
  const asked = useRef(0);

  const recheck = useCallback(() => {
    const ask = ++asked.current;
    trackMap.chapterFoldersCheck().then(
      (answer) => ask === asked.current && setCheck(answer),
      // A check that fails shows nothing: the notice is only ever drawn for a nesting the DAW reported, never for a guess.
      () => ask === asked.current && setCheck(null),
    );
  }, [trackMap]);

  useEffect(() => {
    recheck();
  }, [recheck, revision]);

  useEffect(() => {
    window.addEventListener('focus', recheck);
    return () => window.removeEventListener('focus', recheck);
  }, [recheck]);

  const repair = useCallback(() => {
    if (repairing || check?.outcome !== 'nested') return;
    setRepairing(true);
    const folders = [...new Set(check.moves.map((move) => move.fromName))].join(', ');
    trackMap
      .chapterFoldersRepair(check.expected)
      .then((answer) => {
        if (answer.outcome === 'repaired') {
          const count = answer.expected.length;
          notify(
            `Moved ${count} ${count === 1 ? 'chapter' : 'chapters'} out of ${folders} in REAPER. One Undo in REAPER takes it back; save the project in REAPER to keep it.`,
            'info',
          );
        } else {
          notify(answer.message ?? 'Nothing was moved.', answer.outcome === 'stale' ? 'info' : 'error');
        }
      })
      .catch((reason: unknown) => notify(describeApiError(reason), 'error'))
      .finally(() => {
        setRepairing(false);
        recheck();
      });
  }, [repairing, check, trackMap, notify, recheck]);

  return { check, repairing, repair, recheck };
}
