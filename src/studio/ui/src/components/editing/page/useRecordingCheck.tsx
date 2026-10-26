import { useCallback } from 'react';
import { usePort } from '../../../ports/usePort';
import type { ManuscriptChapter } from '../../../types';
import { openCheckRecordings } from '../../recordingcheck/openCheckRecordings';
import { forgetPeaks } from '../ribbon/useRibbonPeaks';

/**
 * The recording check the Editing page offers beside "Not transcribed yet": Check recordings with this chapter ticked, the same dialog every
 * page opens, on demand and never on its own. When the dialog goes the page reads the chapter again, so what the check found shows without a
 * reload. Undefined when the page has no chapter record to check.
 */
export function useRecordingCheck({ chapter, onClosed }: { chapter: ManuscriptChapter | undefined; onClosed: () => void }): (() => void) | undefined {
  const workspace = usePort('workspace');
  const id = chapter?.id;
  const open = useCallback(() => {
    if (!id) return;
    openCheckRecordings([id], {
      onClosed: () => {
        // A check can re-align the chapter, so its kept waveform is read again next time.
        forgetPeaks(workspace, id);
        onClosed();
      },
    });
  }, [id, workspace, onClosed]);
  return id ? open : undefined;
}
