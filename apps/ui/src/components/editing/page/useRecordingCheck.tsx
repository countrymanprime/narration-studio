import { useCallback, useEffect, useState, type ReactNode } from 'react';
import type { CoverageState } from '../../../api/contracts/coverage';
import { overlay } from '../../../overlay/overlayService';
import { usePort } from '../../../ports/usePort';
import type { ManuscriptChapter } from '../../../types';
import { RecordingCheck } from '../../production/RecordingCheck';

const IDLE: CoverageState = { phase: 'idle', percent: 0, message: '' };

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
  const coveragePort = usePort('coverage');
  const [checking, setChecking] = useState(false);
  const [coverage, setCoverage] = useState<CoverageState>(IDLE);
  useEffect(() => coveragePort.subscribeCoverage(setCoverage), [coveragePort]);
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
        coverage={coverage}
        notify={(text, tone) => overlay.toast(text, tone ? { tone } : undefined)}
        close={close}
        goToParagraph={goToParagraph}
      />
    ) : null;
  return { open: chapter ? open : undefined, panel };
}
