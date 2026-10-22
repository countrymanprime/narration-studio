import { useEffect, useState } from 'react';
import type { WorkspacePeaks, WorkspacePeaksResult } from '../../../api/contracts/workspace';
import { usePort } from '../../../ports/usePort';
import { docSpan, placePeaks, type DocPeaks, type ItemClocks } from './docClock';

export type RibbonPeaks = { status: 'loading' } | { status: 'ready'; result: WorkspacePeaksResult } | { status: 'failed'; reason: string };

type Shared = { promise: Promise<WorkspacePeaksResult>; result?: WorkspacePeaksResult };
type Workspace = { workspacePeaks: (chapterId: string) => Promise<WorkspacePeaksResult> };
const reads = new WeakMap<object, Map<string, Shared>>();

/** One host read per chapter and port, kept for the session and shared by every ribbon, strip and background read that asks: the ribbon
 * mounts again whenever the cursor reaches another paragraph, and each of those used to read the whole chapter's audio again. A failed read
 * is not kept. A change to the chapter's audio (a new take, a check that re-aligned it) calls `forgetPeaks`. */
function sharedRead(workspace: Workspace, chapterId: string): Shared {
  const byChapter = reads.get(workspace) ?? new Map<string, Shared>();
  reads.set(workspace, byChapter);
  const kept = byChapter.get(chapterId);
  if (kept) return kept;
  const entry: Shared = { promise: workspace.workspacePeaks(chapterId) };
  byChapter.set(chapterId, entry);
  entry.promise.then(
    (result) => {
      entry.result = result;
    },
    () => {
      if (byChapter.get(chapterId) === entry) byChapter.delete(chapterId);
    },
  );
  return entry;
}

/** Drops the kept read of one chapter (or of every chapter), so the next ask reads the audio again. */
export function forgetPeaks(workspace: object, chapterId?: string): void {
  if (chapterId === undefined) reads.delete(workspace);
  else reads.get(workspace)?.delete(chapterId);
}

/** How long the background read waits between chapters, so it never crowds a read the narrator is waiting for. */
const PREFETCH_GAP_MS = 150;

/**
 * Reads the other chapters' peaks in the background, one at a time, from the one after `currentId` and round to the ones before it, so the
 * next chapter's waveform is already there. It starts once the current chapter is read, and stops when the page closes.
 */
export function usePrefetchPeaks(chapterIds: readonly string[], currentId: string | undefined): void {
  const workspace = usePort('workspace');
  const key = chapterIds.join('\0');
  useEffect(() => {
    if (!currentId || chapterIds.length < 2) return;
    let live = true;
    const at = chapterIds.indexOf(currentId);
    const order = at < 0 ? [...chapterIds] : [...chapterIds.slice(at), ...chapterIds.slice(0, at)];
    void (async () => {
      for (const id of order) {
        if (!live) return;
        await sharedRead(workspace, id).promise.catch(() => undefined);
        if (live) await new Promise((resolve) => setTimeout(resolve, PREFETCH_GAP_MS));
      }
    })();
    return () => {
      live = false;
    };
    // The list's contents are the dependency: a new array with the same ids is not a new job.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspace, key, currentId]);
}

/** The chapter's peaks through the workspace port. A refused or failed call is a state, not an error: the ribbon says there is no audio and the page goes on. */
export function useRibbonPeaks(chapterId: string | undefined): RibbonPeaks {
  const workspace = usePort('workspace');
  const [state, setState] = useState<RibbonPeaks>(() => {
    const ready = chapterId ? reads.get(workspace)?.get(chapterId) : undefined;
    return ready?.result ? { status: 'ready', result: ready.result } : { status: 'loading' };
  });
  useEffect(() => {
    if (!chapterId) {
      setState({ status: 'loading' });
      return;
    }
    let live = true;
    const read = sharedRead(workspace, chapterId);
    setState(read.result ? { status: 'ready', result: read.result } : { status: 'loading' });
    read.promise.then(
      (result) => live && setState({ status: 'ready', result }),
      (e: unknown) => live && setState({ status: 'failed', reason: e instanceof Error && e.message ? e.message : 'The host did not return the waveform.' }),
    );
    return () => {
      live = false;
    };
  }, [workspace, chapterId]);
  return state;
}

/**
 * The entries of the line's own items when they are known, else every entry that covers part of `[t0, t1]`, each put on the document clock by its
 * item's `clocks` (an item no word is heard on has no place there and is left out); earliest first (a line can run across several audio items),
 * else why there is none: the host's reason for an item without peaks, else a plain one. `[t0, t1]` is on the document clock.
 */
export function pickEntries(
  state: RibbonPeaks,
  clocks: ItemClocks,
  t0: number,
  t1: number,
  items?: readonly number[],
): { peaks: DocPeaks[] } | { reason: string } {
  if (state.status === 'loading') return { reason: 'Reading the waveform.' };
  if (state.status === 'failed') return { reason: state.reason };
  const onClock = (e: { index: number; peaks: WorkspacePeaks }): DocPeaks[] =>
    placePeaks(e.peaks, clocks.get(e.index) ?? []).filter((d) => {
      const [from, to] = docSpan(d);
      return t1 > from && t0 < to;
    });
  const byTime = (a: DocPeaks, b: DocPeaks): number => docSpan(a)[0] - docSpan(b)[0];
  const hasPeaks = (e: { index: number; peaks?: WorkspacePeaks }): e is { index: number; peaks: WorkspacePeaks } => !!e.peaks;
  // Two items can cover the same stretch of their own recordings, so when the line's items are known only they are drawn: another item's audio
  // at the same seconds is a different shape. A line is often several items, so every one the window reaches is drawn, and a line none of
  // whose items has a waveform says why instead.
  const own = items && items.length > 0 ? state.result.items.filter((e) => items.includes(e.index)) : [];
  if (own.length > 0) {
    const drawn = own.filter(hasPeaks);
    if (drawn.length === 0) return { reason: own.find((e) => e.reason)?.reason ?? 'The host has no audio for this line.' };
    const hits = drawn.flatMap(onClock).sort(byTime);
    return hits.length ? { peaks: hits } : { reason: 'This line lies outside the audio the host read.' };
  }
  const withPeaks = state.result.items.filter(hasPeaks);
  const hits = withPeaks.flatMap(onClock).sort(byTime);
  if (hits.length) return { peaks: hits };
  if (withPeaks.length) return { reason: 'This line lies outside the audio the host read.' };
  return { reason: state.result.items.find((e) => e.reason)?.reason ?? 'The host has no audio for this chapter.' };
}
