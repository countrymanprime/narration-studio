import { useEffect, useRef, useState } from 'react';
import type { WorkspacePeaks, WorkspacePeaksResult } from '../../../api/contracts/workspace';
import { useRingPrefetch } from '../../../hooks/useRingPrefetch';
import { usePort } from '../../../ports/usePort';
import { docSpan, placePeaks, type DocPeaks, type ItemClocks } from './docClock';

export type RibbonPeaks = { status: 'loading' } | { status: 'ready'; result: WorkspacePeaksResult } | { status: 'failed'; reason: string };

type Shared = { promise: Promise<WorkspacePeaksResult>; result?: WorkspacePeaksResult; bytes: number; at: number };

/** How long an answer with a gap (an item whose recording the host is still reading: `pending`) is trusted before it is read again (#4042). Any other reason will not change by asking again. */
export const UNANSWERED_RETRY_MS = 15_000;

const hasGap = (result: WorkspacePeaksResult): boolean => result.items.some((item) => !item.peaks && item.pending);
type Workspace = { workspacePeaks: (chapterId: string) => Promise<WorkspacePeaksResult> };
const reads = new WeakMap<object, Map<string, Shared>>();
/** The page's chapters and the one that is open, per port: what "far" means when a kept waveform has to leave. */
const places = new WeakMap<object, { ids: readonly string[]; current: string }>();
/** The size of every waveform read, per port, kept after the waveform itself has left: the background reads a chapter only when it will fit,
 * so it does not read one just to put it out again. */
const sizes = new WeakMap<object, Map<string, number>>();

/** How much waveform the page keeps beside the open chapter's own: 16 MB of the host's peaks text, about 22 hours of audio (a chapter
 * is about 0.7 MB an hour). Past it the kept chapter furthest from the open one leaves. */
export const PEAKS_BUDGET_BYTES = 16 * 1024 * 1024;

const peaksBytes = (result: WorkspacePeaksResult): number =>
  result.items.reduce((n, item) => n + (item.peaks ? item.peaks.minMax.length + (item.peaks.rms?.length ?? 0) : 0), 0);

/** How many chapters `id` is from the open one; a chapter the page's list does not have (or no page has said its list) is furthest. */
function distance(workspace: object, id: string): number {
  const place = places.get(workspace);
  const at = place ? place.ids.indexOf(id) : -1;
  return place && at >= 0 ? Math.abs(at - place.ids.indexOf(place.current)) : Infinity;
}

/** The bytes of the kept waveforms no further from the open chapter than `within`, the open chapter's own left out. */
function keptBytes(workspace: object, byChapter: Map<string, Shared>, within = Infinity): number {
  const current = places.get(workspace)?.current;
  let bytes = 0;
  for (const [id, entry] of byChapter) if (id !== current && distance(workspace, id) <= within) bytes += entry.bytes;
  return bytes;
}

/** Puts kept waveforms out until the rest fit the budget: the furthest from the open chapter first and, among chapters as far, the last
 * read first (so a chapter just read never puts out one that was there and as near). The open chapter stays; with no page list, the
 * longest kept leaves first and `asked` (the one just read) stays. A read still out stays. A waveform on screen is held by its ribbon, so
 * putting its chapter out blanks nothing. */
function trim(workspace: object, byChapter: Map<string, Shared>, asked?: string): void {
  const place = places.get(workspace);
  const kept = [...byChapter].filter(([id, entry]) => entry.result && id !== (place ? place.current : asked));
  const leaving = place ? kept.reverse().sort(([a], [b]) => distance(workspace, b) - distance(workspace, a)) : kept;
  for (const [id] of leaving) {
    if (keptBytes(workspace, byChapter) <= PEAKS_BUDGET_BYTES) return;
    byChapter.delete(id);
  }
}

/** One host read per chapter and port, kept and shared by every ribbon, strip and background read that asks: the ribbon mounts again
 * whenever the cursor reaches another paragraph, and each of those used to read the whole chapter's audio again. A failed read is not
 * kept. A change to the chapter's audio (a new take, a check that re-aligned it) calls `forgetPeaks`. What is kept is bounded (`trim`). */
function sharedRead(workspace: Workspace, chapterId: string): Shared {
  const byChapter = reads.get(workspace) ?? new Map<string, Shared>();
  reads.set(workspace, byChapter);
  const kept = byChapter.get(chapterId);
  if (kept && !(kept.result && hasGap(kept.result) && Date.now() - kept.at > UNANSWERED_RETRY_MS)) return kept;
  const entry: Shared = { promise: workspace.workspacePeaks(chapterId), bytes: 0, at: Date.now() };
  byChapter.set(chapterId, entry);
  entry.promise.then(
    (result) => {
      entry.result = result;
      entry.at = Date.now();
      if (byChapter.get(chapterId) !== entry) return;
      entry.bytes = peaksBytes(result);
      const known = sizes.get(workspace) ?? new Map<string, number>();
      sizes.set(workspace, known.set(chapterId, entry.bytes));
      trim(workspace, byChapter, chapterId);
    },
    () => {
      if (byChapter.get(chapterId) === entry) byChapter.delete(chapterId);
    },
  );
  return entry;
}

const listeners = new WeakMap<object, Set<(chapterId?: string) => void>>();

/** Drops the kept read of one chapter (or of every chapter), so the next ask reads the audio again; a ribbon showing that chapter asks again at once. */
export function forgetPeaks(workspace: object, chapterId?: string): void {
  listeners.get(workspace)?.forEach((listener) => listener(chapterId));
  if (chapterId === undefined) {
    reads.delete(workspace);
    sizes.delete(workspace);
  } else {
    reads.get(workspace)?.delete(chapterId);
    sizes.get(workspace)?.delete(chapterId);
  }
}

/**
 * Reads every chapter's peaks in the background, nearest the open chapter first (`useRingPrefetch`: the one after it, the one before, then
 * two away, and on outwards), one at a time, so a step or a jump finds its waveform already there. A move to another chapter starts the
 * run again from that chapter; chapters already kept are not read again. What is kept beside the open chapter is bounded by
 * `PEAKS_BUDGET_BYTES` and is the chapters around the narrator: a chapter is read only when it fits beside the kept chapters that are as near or
 * nearer (the further ones leave for it), by its size when it was read before and by the average of the chapters read so far when not.
 * It stops when the page closes.
 */
export function usePrefetchPeaks(chapterIds: readonly string[], currentId: string | undefined): void {
  const workspace = usePort('workspace');
  const key = chapterIds.join('\0');
  // Before the run of the same change starts (effects run in order), and before any read it makes can end.
  useEffect(() => {
    if (currentId === undefined) return;
    places.set(workspace, { ids: chapterIds, current: currentId });
    const byChapter = reads.get(workspace);
    if (byChapter) trim(workspace, byChapter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspace, key, currentId]);
  useRingPrefetch(chapterIds, currentId, {
    read: (id) => sharedRead(workspace, id).promise,
    kept: (id) => reads.get(workspace)?.get(id)?.result !== undefined,
    room: (id) => {
      const byChapter = reads.get(workspace) ?? new Map<string, Shared>();
      // A chapter never read is taken to be as large as the ones read so far, on average.
      const known = sizes.get(workspace);
      const size = known?.get(id) ?? (known?.size ? [...known.values()].reduce((a, b) => a + b, 0) / known.size : 0);
      return keptBytes(workspace, byChapter, distance(workspace, id)) + size <= PEAKS_BUDGET_BYTES;
    },
  });
}

/** The chapter's peaks through the workspace port. A refused or failed call is a state, not an error: the ribbon says there is no audio and the page goes on. */
export function useRibbonPeaks(chapterId: string | undefined): RibbonPeaks {
  const workspace = usePort('workspace');
  const [state, setState] = useState<RibbonPeaks>(() => {
    const ready = chapterId ? reads.get(workspace)?.get(chapterId) : undefined;
    return ready?.result ? { status: 'ready', result: ready.result } : { status: 'loading' };
  });
  // The read runs again, keeping the shown answer until the new one lands, when the host was still reading a recording (a quiet spell later, while the
  // ribbon stays open) and when the chapter's kept waveform was forgotten (a check re-aligned it). The counter re-runs the effect.
  const [again, setAgain] = useState(0);
  const last = useRef<{ again: number; chapterId: string | undefined }>({ again: 0, chapterId });
  useEffect(() => {
    const listen = (forgotten?: string): void => {
      if (forgotten === undefined || forgotten === chapterId) setAgain((n) => n + 1);
    };
    const set = listeners.get(workspace) ?? new Set();
    listeners.set(workspace, set);
    set.add(listen);
    return () => {
      set.delete(listen);
    };
  }, [workspace, chapterId]);
  useEffect(() => {
    if (!chapterId) {
      setState({ status: 'loading' });
      return;
    }
    let live = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    // A re-run of the same chapter keeps the shown answer; a step to another chapter never shows the one it left.
    const retry = again !== last.current.again && last.current.chapterId === chapterId;
    last.current = { again, chapterId };
    const later = (): void => {
      timer = setTimeout(() => setAgain((n) => n + 1), UNANSWERED_RETRY_MS + 100);
    };
    const read = sharedRead(workspace, chapterId);
    if (!retry) setState(read.result ? { status: 'ready', result: read.result } : { status: 'loading' });
    read.promise.then(
      (result) => {
        if (!live) return;
        setState({ status: 'ready', result });
        if (hasGap(result)) later();
      },
      (e: unknown) => {
        if (!live) return;
        // A failed read of the same chapter does not take away what is drawn: the next quiet spell asks again.
        if (retry) {
          setState((shown) => {
            if (shown.status === 'ready') later();
            return shown.status === 'ready'
              ? shown
              : { status: 'failed', reason: e instanceof Error && e.message ? e.message : 'The host did not return the waveform.' };
          });
          return;
        }
        setState({ status: 'failed', reason: e instanceof Error && e.message ? e.message : 'The host did not return the waveform.' });
      },
    );
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [workspace, chapterId, again]);
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
): { peaks: DocPeaks[] } | { reason: string; reading?: boolean } {
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
    if (drawn.length === 0)
      return { reason: own.find((e) => e.reason)?.reason ?? 'The host has no audio for this line.', ...(own.some((e) => e.pending) ? { reading: true } : {}) };
    const hits = drawn.flatMap(onClock).sort(byTime);
    return hits.length ? { peaks: hits } : { reason: 'This line lies outside the audio the host read.' };
  }
  const withPeaks = state.result.items.filter(hasPeaks);
  const hits = withPeaks.flatMap(onClock).sort(byTime);
  if (hits.length) return { peaks: hits };
  if (withPeaks.length) return { reason: 'This line lies outside the audio the host read.' };
  return {
    reason: state.result.items.find((e) => e.reason)?.reason ?? 'The host has no audio for this chapter.',
    ...(state.result.items.some((e) => e.pending) ? { reading: true } : {}),
  };
}
