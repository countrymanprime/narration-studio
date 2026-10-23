import { useEffect, useRef, useState } from 'react';
import type { ChapterSyncState } from '../../../api/contracts/chapterSync';
import type { CoverageState } from '../../../api/contracts/coverage';
import { describeApiError } from '../../../api/errorMessage';
import { overlay } from '../../../overlay/overlayService';
import { usePort } from '../../../ports/usePort';
import { BackgroundCheckStatus } from './BackgroundCheckStatus';
import { BackgroundChecksNotice } from './BackgroundChecksNotice';
import { needsNotice, startedToast } from './backgroundCheckText';

const TOOL = 'RecordingCoverage';

/** A chapter's title from the chapter sync rows, or a plain word when the rows have not arrived. */
function titleIn(titles: ReadonlyMap<string, string>, chapterId: string | undefined): string {
  return (chapterId && titles.get(chapterId)) || 'a chapter';
}

/**
 * Background recording checks, app-wide (#2251): the first-time notice before the host checks anything on its own, a toast when
 * a background check starts (`job:ended` already says when it ends), and the progress that stays on screen whatever page the
 * narrator is on, with Pause and Cancel. `chapterSync` is App's one `chaptersync:state` subscription.
 */
export function BackgroundChecks({ chapterSync }: { chapterSync: ChapterSyncState | undefined }) {
  const coverage = usePort('coverage');
  const system = usePort('system');
  const [running, setRunning] = useState<CoverageState>();
  const [answering, setAnswering] = useState(false);
  const announced = useRef(new Set<string>());
  const background = chapterSync?.background;
  const backgroundRef = useRef(background);
  backgroundRef.current = background;
  const titles = useRef(new Map<string, string>());
  for (const row of chapterSync?.chapters ?? []) titles.current.set(row.chapterId, row.chapterTitle);
  const titleOf = (chapterId: string | undefined) => titleIn(titles.current, chapterId);

  useEffect(() => {
    let active = true;
    const apply = (state: CoverageState) => {
      if (!active) return;
      const mine = state.background === true && state.phase === 'running';
      setRunning((current) => (mine ? state : current?.runId === state.runId || !state.runId ? undefined : current));
      if (mine && state.runId && !announced.current.has(state.runId)) {
        announced.current.add(state.runId);
        overlay.toast(startedToast(titleIn(titles.current, state.chapterId), state, backgroundRef.current));
      }
    };
    const unsubscribe = coverage.subscribeCoverage(apply);
    // A failed seed leaves the pill on what the events say next.
    coverage.coverageState().then(apply, () => undefined);
    return () => {
      active = false;
      unsubscribe();
    };
  }, [coverage]);

  const save = (values: Record<string, string | null>) => system.saveSettings(TOOL, 'global', values);
  const answer = (allow: boolean) => {
    setAnswering(true);
    void save(allow ? { background_checks_confirmed: 'true' } : { background_checks_confirmed: 'true', background_checks: 'false' })
      .then(() => {
        if (!allow) overlay.toast('Background checks are off. Turn them on in Settings › Speech › Recording check.');
      })
      .catch((error) => overlay.toast(describeApiError(error), { tone: 'error' }))
      .finally(() => setAnswering(false));
  };
  const resume = () =>
    void save({ background_checks: null })
      .then(() => overlay.toast('Background checks resumed.'))
      .catch((error) => overlay.toast(describeApiError(error), { tone: 'error' }));
  const pause = () => {
    const wasRunning = running;
    void save({ background_checks: 'false' })
      .then(() => (wasRunning ? coverage.coverageCancel() : undefined))
      .then(() =>
        overlay.toast(wasRunning ? 'Background checks paused. The audio already checked is kept.' : 'Background checks paused.', {
          action: { label: 'Resume', onAction: resume },
        }),
      )
      .catch((error) => overlay.toast(describeApiError(error), { tone: 'error' }));
  };
  const cancel = () =>
    void coverage
      .coverageCancel()
      .then(() => overlay.toast('Background check cancelled. It starts again when the chapter changes.'))
      .catch((error) => overlay.toast(describeApiError(error), { tone: 'error' }));

  return (
    <>
      <BackgroundCheckStatus background={background} running={running} title={titleOf(running?.chapterId)} onPause={pause} onCancel={cancel} />
      {background && needsNotice(background) && !chapterSync?.ask && (
        <BackgroundChecksNotice background={background} busy={answering} onAllow={() => answer(true)} onNotNow={() => answer(false)} />
      )}
    </>
  );
}
