import { useEffect, useState } from 'react';
import type { WorkspacePeaks, WorkspacePeaksResult } from '../../../api/contracts/workspace';
import { usePort } from '../../../ports/usePort';
import { entrySpan } from './peaksWindow';

export type RibbonPeaks = { status: 'loading' } | { status: 'ready'; result: WorkspacePeaksResult } | { status: 'failed'; reason: string };

/** The chapter's peaks through the workspace port. A refused or failed call is a state, not an error: the ribbon says there is no audio and the page goes on. */
export function useRibbonPeaks(chapterId: string | undefined): RibbonPeaks {
  const workspace = usePort('workspace');
  const [state, setState] = useState<RibbonPeaks>({ status: 'loading' });
  useEffect(() => {
    setState({ status: 'loading' });
    if (!chapterId) return;
    let live = true;
    workspace.workspacePeaks(chapterId).then(
      (result) => live && setState({ status: 'ready', result }),
      (e: unknown) => live && setState({ status: 'failed', reason: e instanceof Error && e.message ? e.message : 'The host did not return the waveform.' }),
    );
    return () => {
      live = false;
    };
  }, [workspace, chapterId]);
  return state;
}

/** The entry that covers `[t0, t1]`, else why there is none: the host's reason for an item without peaks, else a plain one. */
export function pickEntry(state: RibbonPeaks, t0: number, t1: number): { peaks: WorkspacePeaks } | { reason: string } {
  if (state.status === 'loading') return { reason: 'Reading the waveform.' };
  if (state.status === 'failed') return { reason: state.reason };
  const withPeaks = state.result.items.filter((e): e is typeof e & { peaks: WorkspacePeaks } => !!e.peaks);
  const hit = withPeaks.find((e) => {
    const [from, to] = entrySpan(e.peaks);
    return t1 > from && t0 < to;
  });
  if (hit) return { peaks: hit.peaks };
  if (withPeaks.length) return { reason: 'This line lies outside the audio the host read.' };
  return { reason: state.result.items.find((e) => e.reason)?.reason ?? 'The host has no audio for this chapter.' };
}
