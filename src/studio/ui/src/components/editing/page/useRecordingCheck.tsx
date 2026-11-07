import { useCallback, useMemo } from 'react';
import { usePort } from '../../../ports/usePort';
import type { ManuscriptChapter } from '../../../types';
import { openCheckRecordings } from '../../recordingcheck/openCheckRecordings';
import { forgetPeaks } from '../ribbon/useRibbonPeaks';

/** What the shared Check recordings button needs on the Editing page: this chapter, and the page's read of it once the dialog goes. */
export type EditingRecordingCheck = { chapterIds: string[]; onClosed: () => void };

/**
 * The recording check the Editing page offers beside "Not transcribed yet": Check recordings with this chapter ticked, the same dialog every
 * page opens, on demand and never on its own. When the dialog goes the page reads the chapter again, so what the check found shows without a
 * reload. Undefined when the page has no chapter record to check. `open` is for the page's command, which the DAW's gate does not reach (`run`
 * is disabled with the same sentence by the command's own reason).
 */
export function useRecordingCheck({
  chapter,
  onClosed,
}: {
  chapter: ManuscriptChapter | undefined;
  onClosed: () => void;
}): (EditingRecordingCheck & { open: () => void }) | undefined {
  const workspace = usePort('workspace');
  const id = chapter?.id;
  const closed = useCallback(() => {
    if (!id) return;
    // A check can re-align the chapter, so its kept waveform is read again next time.
    forgetPeaks(workspace, id);
    onClosed();
  }, [id, workspace, onClosed]);
  return useMemo(() => (id ? { chapterIds: [id], onClosed: closed, open: () => openCheckRecordings([id], { onClosed: closed }) } : undefined), [id, closed]);
}
