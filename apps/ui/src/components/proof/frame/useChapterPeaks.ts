import { useEffect, useState } from 'react';
import type { WorkspacePeaksResult } from '../../../api/contracts/workspace';
import { usePort } from '../../../ports/usePort';

/** The chapter's peaks from the host, or undefined while they load (or when the call fails: the waveform then draws flat lines). */
export function useChapterPeaks(chapterId: string | undefined): WorkspacePeaksResult | undefined {
  const workspace = usePort('workspace');
  const [result, setResult] = useState<WorkspacePeaksResult | undefined>();
  useEffect(() => {
    setResult(undefined);
    if (!chapterId) return;
    let live = true;
    workspace.workspacePeaks(chapterId).then(
      (peaks) => {
        if (live) setResult(peaks);
      },
      () => {},
    );
    return () => {
      live = false;
    };
  }, [workspace, chapterId]);
  return result;
}
