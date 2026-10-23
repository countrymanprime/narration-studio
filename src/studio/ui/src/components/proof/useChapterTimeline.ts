import { useEffect, useMemo, useState } from 'react';
import type { TrackItem } from '../../api/contracts/tracks';
import type { WorkspaceItem } from '../../api/contracts/workspace';
import { usePort } from '../../ports/usePort';
import { joinPeaks, joinedDuration, type PeaksSegment } from './frame/peaksJoin';
import { useChapterPeaks } from './frame/useChapterPeaks';
import { buildPlaylist } from './playlist';

/** The chapter's recording on the app's timeline: its items' segments with peaks, its length, and where a project second falls on it. */
export type ChapterTimeline = {
  segments: PeaksSegment[];
  total: number;
  /** A project second (what a note's `time_range` holds) as seconds into the chapter's timeline, or null when no item covers it. */
  toTimeline: (projectSeconds: number) => number | null;
};

const EMPTY: ChapterTimeline = { segments: [], total: 0, toTimeline: () => null };

/**
 * Reads the chapter's track items (through the chapter-to-track map), its alignment's items and its peaks, and lays them on the timeline the Proof waveform
 * window draws. Undefined while the items load; a chapter with no mapped track or no playable item is an empty timeline.
 */
export function useChapterTimeline(chapterId: string | undefined): ChapterTimeline | undefined {
  const trackMap = usePort('chapterTrackMap');
  const tracks = usePort('tracks');
  const workspace = usePort('workspace');
  const peaks = useChapterPeaks(chapterId);
  const [loaded, setLoaded] = useState<{ chapterId: string; items: TrackItem[]; aligned: WorkspaceItem[] }>();

  useEffect(() => {
    if (!chapterId) return;
    let live = true;
    // The alignment names each item's index, which is what the peaks are keyed by; a chapter not yet aligned draws flat lines.
    Promise.all([trackMap.chapterTrackMapList(), tracks.tracksList(), workspace.workspaceAlignment(chapterId).catch(() => undefined)])
      .then(([mapping, project, alignment]) => {
        const trackGuid = mapping.mappings.find((entry) => entry.chapterId === chapterId)?.trackGuid;
        const items = project.tracks.find((track) => track.guid === trackGuid)?.items ?? [];
        if (live) setLoaded({ chapterId, items, aligned: alignment?.items ?? [] });
      })
      .catch(() => live && setLoaded({ chapterId, items: [], aligned: [] }));
    return () => {
      live = false;
    };
  }, [trackMap, tracks, workspace, chapterId]);

  const current = loaded?.chapterId === chapterId ? loaded : undefined;
  return useMemo(() => {
    if (!current) return undefined;
    const playlist = buildPlaylist(current.items);
    if (playlist.length === 0) return EMPTY;
    const segments = joinPeaks(playlist, current.aligned, peaks);
    const byGuid = new Map(current.items.map((item) => [item.guid, item] as const));
    const toTimeline = (seconds: number): number | null => {
      for (const segment of playlist) {
        const item = byGuid.get(segment.itemGuid);
        if (!item || seconds < item.position || seconds > item.position + item.length) continue;
        return segment.elapsedStart + (seconds - item.position) * (item.playRate || 1);
      }
      return null;
    };
    return { segments, total: joinedDuration(segments), toTimeline };
  }, [current, peaks]);
}
