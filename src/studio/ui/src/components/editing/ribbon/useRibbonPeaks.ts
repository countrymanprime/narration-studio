import { useEffect, useState } from 'react';
import type { WorkspacePeaks, WorkspacePeaksResult } from '../../../api/contracts/workspace';
import { useRingPrefetch } from '../../../hooks/useRingPrefetch';
import { usePort } from '../../../ports/usePort';
import { docSpan, placePeaks, type DocPeaks, type ItemClocks } from './docClock';

export type RibbonPeaks = { status: 'loading' } | { status: 'ready'; result: WorkspacePeaksResult } | { status: 'failed'; reason: string };

type Shared = { promise: Promise<WorkspacePeaksResult>; result?: WorkspacePeaksResult; bytes: number };
type Workspace = { workspacePeaks: (chapterId: string) => Promise<WorkspacePeaksResult> };
const reads = new WeakMap<object, Map<string, Shared>>();
/** The page's chapters and the one that is open, per port: what "far" means when a kept waveform has to leave. `fullAt` is how far the
 * nearest chapter was that had to leave since the narrator came to `current`: the background reads nothing that far out or further, or it
 * would read chapters only to put them out again. */
const places = new WeakMap<object, { ids: readonly string[]; current: string; fullAt: number }>();

/** How much waveform the page keeps: 16 MB of the host's peaks text, about 22 hours of audio (a chapter is about 0.7 MB an hour). Past
 * it the kept chapter furthest from the open one leaves. */
export const PEAKS_BUDGET_BYTES = 16 * 1024 * 1024;

const peaksBytes = (result: WorkspacePeaksResult): number =>
  result.items.reduce((n, item) => n + (item.peaks ? item.peaks.minMax.length + (item.peaks.rms?.length ?? 0) : 0), 0);
const keptBytes = (byChapter: Map<string, Shared>): number => [...byChapter.values()].reduce((n, entry) => n + entry.bytes, 0);

/** How many chapters `id` is from the open one; a chapter the page's list does not have (or no page has said its list) is furthest. */
function distance(workspace: object, id: string): number {
  const place = places.get(workspace);
  const at = place ? place.ids.indexOf(id) : -1;
  return place && at >= 0 ? Math.abs(at - place.ids.indexOf(place.current)) : Infinity;
}

/** Puts kept waveforms out, the furthest from the open chapter first (the longest kept first among equals), until the rest fit the
 * budget. The open chapter and `asked` (the one just read for the page) stay, and so does a read still out. A waveform on screen is held
 * by its ribbon, so putting its chapter out blanks nothing. */
function trim(workspace: object, byChapter: Map<string, Shared>, asked?: string): void {
  const place = places.get(workspace);
  const current = place?.current;
  const leaving = [...byChapter]
    .filter(([id, entry]) => entry.result && id !== asked && id !== current)
    .sort(([a], [b]) => distance(workspace, b) - distance(workspace, a));
  for (const [id] of leaving) {
    if (keptBytes(byChapter) <= PEAKS_BUDGET_BYTES) return;
    byChapter.delete(id);
    if (place) place.fullAt = Math.min(place.fullAt, distance(workspace, id));
  }
}

/** One host read per chapter and port, kept and shared by every ribbon, strip and background read that asks: the ribbon mounts again
 * whenever the cursor reaches another paragraph, and each of those used to read the whole chapter's audio again. A failed read is not
 * kept. A change to the chapter's audio (a new take, a check that re-aligned it) calls `forgetPeaks`. What is kept is bounded (`trim`). */
function sharedRead(workspace: Workspace, chapterId: string, background = false): Shared {
  const byChapter = reads.get(workspace) ?? new Map<string, Shared>();
  reads.set(workspace, byChapter);
  const kept = byChapter.get(chapterId);
  if (kept) return kept;
  const entry: Shared = { promise: workspace.workspacePeaks(chapterId), bytes: 0 };
  byChapter.set(chapterId, entry);
  entry.promise.then(
    (result) => {
      entry.result = result;
      if (byChapter.get(chapterId) !== entry) return;
      entry.bytes = peaksBytes(result);
      trim(workspace, byChapter, background ? undefined : chapterId);
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

/**
 * Reads every chapter's peaks in the background, nearest the open chapter first (`useRingPrefetch`: the one after it, the one before, then
 * two away, and on outwards), one at a time, so a step or a jump finds its waveform already there. A move to another chapter starts the
 * run again from that chapter; chapters already kept are not read again. Once the kept waveforms fill `PEAKS_BUDGET_BYTES` the furthest
 * kept chapter leaves for each nearer one read, and the run stops at the distance where chapters had to leave: what is kept is the
 * chapters around the narrator. It stops when the page closes.
 */
export function usePrefetchPeaks(chapterIds: readonly string[], currentId: string | undefined): void {
  const workspace = usePort('workspace');
  const key = chapterIds.join('\0');
  // Before the run of the same change starts (effects run in order), and before any read it makes can end.
  useEffect(() => {
    if (currentId === undefined) return;
    places.set(workspace, { ids: chapterIds, current: currentId, fullAt: Infinity });
    const byChapter = reads.get(workspace);
    if (byChapter) trim(workspace, byChapter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspace, key, currentId]);
  useRingPrefetch(chapterIds, currentId, {
    read: (id) => sharedRead(workspace, id, true).promise,
    kept: (id) => reads.get(workspace)?.get(id)?.result !== undefined,
    room: (id) => distance(workspace, id) < (places.get(workspace)?.fullAt ?? Infinity),
  });
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
