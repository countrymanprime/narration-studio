import { useCallback, useState, type ReactNode } from 'react';
import { overlay } from '../../../overlay/overlayService';
import type { ManuscriptChapter } from '../../../types';
import { RecordingCheck } from '../../production/RecordingCheck';
import { useCoverageRuns } from '../../recordingcheck/useCoverageRuns';

export interface RecordingCheckHost {
  /** Opens the check for the chapter; undefined when the page has no chapter record to check. */
  open: (() => void) | undefined;
  /** The check's slide-over while it is open, else null. */
  panel: ReactNode;
}

/**
 * The recording check the Editing page offers beside "Not transcribed yet": the same slide-over Proof and Production open, on demand
 * and never on its own. It follows the live check state, so a run left going is picked up, and when the slide-over closes the page reads the
 * chapter again, so what the check found shows without a reload.
 */
export function useRecordingCheck({
  chapter,
  onClosed,
  goToParagraph,
}: {
  chapter: ManuscriptChapter | undefined;
  onClosed: () => void;
  goToParagraph: (index: number) => void;
}): RecordingCheckHost {
  const [checking, setChecking] = useState(false);
  const runs = useCoverageRuns();
  const open = useCallback(() => setChecking(true), []);
  const close = useCallback(() => {
    setChecking(false);
    onClosed();
  }, [onClosed]);
  const panel =
    checking && chapter ? (
      <RecordingCheck
        key={chapter.id}
        chapter={chapter}
        coverage={runs.forChapter(chapter.id)}
        othersRunning={runs.othersRunning(chapter.id)}
        notify={(text, tone) => overlay.toast(text, tone ? { tone } : undefined)}
        close={close}
        goToParagraph={goToParagraph}
      />
    ) : null;
  return { open: chapter ? open : undefined, panel };
}
