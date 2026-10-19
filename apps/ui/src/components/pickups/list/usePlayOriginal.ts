import { useCallback, useEffect, useRef, useState } from 'react';
import { useApi } from '../../../api/ApiContext';
import type { PickupItem } from '../../../api/contracts/pickups';
import type { TrackItem } from '../../../api/contracts/tracks';
import { usePort } from '../../../ports/usePort';
import { useRangePlayer } from '../../engine/useRangePlayer';
import { buildPlaylist, segmentAtElapsed } from '../../proof/playlist';

/** Seconds of the recording heard before and after the line's place. */
export const ORIGINAL_AROUND = 3;
/** Why a line cannot be heard: the host gave it no place in the recording. */
export const NO_PLACE = 'This line has no place in the recording yet.';
const NO_AUDIO = 'The recording of this chapter is not in the project, so the original cannot be played.';

/** Where a pickup falls in the chapter's source audio: the file and the second in it. `at` is a project second; `time` is a second on the app's own line over the played files. */
export function sourceSpot(items: readonly TrackItem[], pickup: Pick<PickupItem, 'at' | 'time'>): { sourceFile: string; seconds: number } | undefined {
  const playable = items.filter((item) => item.supported && item.sourceAvailable && item.sourceFile !== '');
  if (pickup.at !== null) {
    const hit = playable.find((item) => pickup.at! >= item.position && pickup.at! <= item.position + item.length);
    if (hit) return { sourceFile: hit.sourceFile, seconds: hit.sourceStart + (pickup.at - hit.position) * (hit.playRate || 1) };
  }
  if (pickup.time !== null) {
    const found = segmentAtElapsed(buildPlaylist(playable), pickup.time);
    if (found) return { sourceFile: found.segment.sourceFile, seconds: found.segment.sourceStart + Math.max(0, pickup.time - found.segment.elapsedStart) };
  }
  return undefined;
}

/**
 * Plays a pickup's place in the source recording with `ORIGINAL_AROUND` seconds either side, through the range player the Proof takes use (no DAW
 * call, no project change). One line plays at a time; pressing the playing line again stops it. A refusal comes back as a sentence.
 */
export function usePlayOriginal(onRefused: (sentence: string) => void) {
  const api = useApi();
  const trackMap = usePort('chapterTrackMap');
  const tracks = usePort('tracks');
  const player = useRangePlayer(api.mediaUrl, { pre: ORIGINAL_AROUND, post: ORIGINAL_AROUND });
  const [playingId, setPlayingId] = useState<string | null>(null);
  const live = useRef({ onRefused, playingId });
  live.current = { onRefused, playingId };

  const unavailable = useCallback((pickup: PickupItem): string | undefined => (pickup.at === null && pickup.time === null ? NO_PLACE : undefined), []);

  const play = useCallback(
    async (pickup: PickupItem): Promise<void> => {
      if (live.current.playingId === pickup.id) {
        player.stop();
        setPlayingId(null);
        return;
      }
      try {
        const [mapping, project] = await Promise.all([trackMap.chapterTrackMapList(), tracks.tracksList()]);
        const guid = mapping.mappings.find((entry) => entry.chapterId === pickup.chapterId)?.trackGuid;
        const spot = sourceSpot(project.tracks.find((track) => track.guid === guid)?.items ?? [], pickup);
        if (!spot) return live.current.onRefused(NO_AUDIO);
        setPlayingId(pickup.id);
        player.play({ sourceFile: spot.sourceFile, rangeStart: spot.seconds, rangeEnd: spot.seconds });
      } catch (error) {
        setPlayingId(null);
        live.current.onRefused(error instanceof Error && error.message ? error.message : NO_AUDIO);
      }
    },
    [player, trackMap, tracks],
  );

  /* The range ends by itself or the file fails: the button goes back to Play, and a failed file says so. */
  const { isPlaying, loadError } = player;
  useEffect(() => {
    if (isPlaying) return;
    setPlayingId(null);
    if (loadError) live.current.onRefused(NO_AUDIO);
  }, [isPlaying, loadError]);
  return { playingId: isPlaying ? playingId : null, play, unavailable };
}
