import { useCallback, useEffect, useRef, useState } from 'react';
import type { CleanupRow } from './cleanupRows';

/** How many of the selected findings Preview plays. */
const PREVIEW_COUNT = 3;
/** Seconds of the recording heard before and after each finding. */
const PREVIEW_AROUND = 2;
/** What Preview says when the page lends no playback. */
const NO_PLAYBACK = 'Nothing can play here: this page has no playback.';

/** The part of the page's playback Preview calls: the one the take's Play uses. */
export interface PreviewPlayback {
  playing: boolean;
  /** Plays from `from` seconds into the chapter, on to `to`. */
  playFrom: (from: number, to?: number) => void;
  stop: () => void;
}

export interface PreviewPlay {
  /** The sentence for a preview in progress, else null. */
  status: string | null;
  /** Why Preview cannot play, once asked to; else null. */
  reason: string | null;
  start: (rows: readonly CleanupRow[], total: number) => void;
  stop: () => void;
}

/** The window a finding plays: its start and end, widened by `PREVIEW_AROUND` seconds, never before the chapter begins. */
const windowOf = (row: CleanupRow): [number, number] => [Math.max(0, row.sec - PREVIEW_AROUND), row.end + PREVIEW_AROUND];

/**
 * Plays the first `PREVIEW_COUNT` of the rows in order, one `playFrom` each, the next when the page's playback goes quiet. Stop, and
 * Escape while it runs, stop it. Without playback it only says why. A range the playback would not start ends the preview.
 */
export function usePreviewPlay(playback: PreviewPlayback | undefined): PreviewPlay {
  const [queue, setQueue] = useState<{ windows: [number, number][]; at: number; total: number } | null>(null);
  const [reason, setReason] = useState<string | null>(null);
  const heard = useRef(false);
  const live = useRef(playback);
  useEffect(() => {
    live.current = playback;
  });

  const halt = useCallback(() => {
    setQueue(null);
    heard.current = false;
  }, []);

  const playAt = useCallback(
    (windows: [number, number][], at: number, total: number) => {
      const w = windows[at];
      if (!w || !live.current) return halt();
      heard.current = false;
      setQueue({ windows, at, total });
      live.current.playFrom(w[0], w[1]);
    },
    [halt],
  );

  const playing = playback?.playing ?? false;
  useEffect(() => {
    if (!queue) return;
    if (playing) {
      heard.current = true;
      return;
    }
    // Quiet: a range ended, so play the next; or it never started, so the preview ends.
    if (heard.current) playAt(queue.windows, queue.at + 1, queue.total);
    else halt();
  }, [playing, queue, playAt, halt]);

  useEffect(() => {
    if (!queue) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      live.current?.stop();
      halt();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [queue, halt]);

  const start = useCallback(
    (rows: readonly CleanupRow[], total: number) => {
      if (!live.current) return setReason(NO_PLAYBACK);
      setReason(null);
      const windows = rows.slice(0, PREVIEW_COUNT).map(windowOf);
      if (windows.length) playAt(windows, 0, total);
    },
    [playAt],
  );

  const stop = useCallback(() => {
    live.current?.stop();
    halt();
  }, [halt]);

  const status = queue ? `Playing the first ${queue.windows.length} of ${queue.total} selected, with ${PREVIEW_AROUND} s before and after.` : null;
  return { status, reason, start, stop };
}
