import { faLayerGroup } from '@fortawesome/free-solid-svg-icons';
import { useEffect, useRef } from 'react';
import { describeApiError } from '../../api/errorMessage';
import type { ChapterSyncApi } from '../../api/contracts/chapterSync';
import { useChapterSync } from '../../hooks/useChapterSync';
import type { Notify } from '../primitives/Toast';
import { chapterSyncBatchToastText } from './chapterSyncToastText';

/**
 * Chapter sync's two page-level reactions, for whichever page lists chapters: one toast per batch that linked something (with
 * Undo for every link in it), and `onState` on every `chaptersync:state` after the first, which may mean the saved project or a
 * stored result changed, so the page reads its chapters again. Returns the live state, as `useChapterSync` does.
 */
export function useChapterSyncToast({
  api,
  notify,
  trackName,
  onState,
}: {
  api: Pick<ChapterSyncApi, 'chapterSyncState' | 'subscribeChapterSync' | 'chapterSyncUndo'>;
  notify: Notify;
  /** A linked track's saved-project name from the page's last links read; `undefined` falls back to naming the chapter alone. */
  trackName: (trackGuid: string) => string | undefined;
  /** Called for each `chaptersync:state` after the first. */
  onState: () => void;
}) {
  const state = useChapterSync(api);
  // The latest callbacks, so a new closure on each render does not re-run the effects below.
  const latest = useRef({ notify, trackName, onState });
  latest.current = { notify, trackName, onState };

  // `lastBatchAt` guards against re-toasting the same batch on a re-render.
  const lastBatchAt = useRef<string>(undefined);
  useEffect(() => {
    const batch = state?.batch;
    if (!batch || batch.linked.length === 0 || lastBatchAt.current === batch.at) return;
    lastBatchAt.current = batch.at;
    const { notify: say, trackName: name } = latest.current;
    say(
      chapterSyncBatchToastText(batch, name),
      'info',
      {
        label: 'Undo',
        onAction: () => {
          void Promise.all(batch.linked.map((link) => api.chapterSyncUndo(link.trackGuid))).catch((error) =>
            latest.current.notify(describeApiError(error), 'error'),
          );
        },
      },
      faLayerGroup,
    );
  }, [state?.batch, api]);

  const sawState = useRef(false);
  useEffect(() => {
    if (!state) return;
    if (!sawState.current) {
      sawState.current = true;
      return;
    }
    latest.current.onState();
  }, [state]);

  return state;
}
