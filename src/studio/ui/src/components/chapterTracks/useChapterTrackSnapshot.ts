import { useCallback } from 'react';
import type { TrackMapping } from '../../types';
import type { TracksProject } from '../../api/contracts/tracks';
import { usePort } from '../../ports/usePort';
import { LIVE_TRACKS_TIMEOUT_MS } from '../engine/useLiveTracks';

/**
 * One reading of the project's tracks and the chapter links, for a page that reads them once when it opens or plays (Editing, Proof, Pickups'
 * play of the original) and not on the shared state's timer: the page's own work must not change under the narrator every few seconds. It is
 * the state's reader, not a second one: the tracks are REAPER's as they are now when it has the linked project open, else the saved file's
 * (`tracksLive`, with the saved file's items for a track REAPER has too), so a track renamed or deleted and not yet saved is seen here as in the
 * Engine list and the Booth, and one failed or unanswered read (after LIVE_TRACKS_TIMEOUT_MS) rejects the same way for every page (#3366).
 * `tracks: false` reads the links alone.
 */
export function useChapterTrackSnapshot(): (options?: { tracks?: boolean }) => Promise<{ project: TracksProject | undefined; mappings: TrackMapping[] }> {
  const tracks = usePort('tracks');
  const trackMap = usePort('chapterTrackMap');
  return useCallback(
    async ({ tracks: withTracks = true } = {}) => {
      let timer = 0;
      const limit = new Promise<never>((_, reject) => {
        timer = window.setTimeout(() => reject(new Error('REAPER did not answer.')), LIVE_TRACKS_TIMEOUT_MS);
      });
      try {
        const [mapping, live] = await Promise.race([Promise.all([trackMap.chapterTrackMapList(), withTracks ? tracks.tracksLive() : undefined]), limit]);
        return { project: live?.project, mappings: mapping.mappings };
      } finally {
        window.clearTimeout(timer);
      }
    },
    [tracks, trackMap],
  );
}
