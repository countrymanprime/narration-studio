import { useEffect, useMemo, useState } from 'react';
import type { DawCapabilities, DawLiveItem } from '../../../api/contracts/daw';
import type { WorkspaceItem } from '../../../api/contracts/workspace';
import { usePort } from '../../../ports/usePort';
import type { PlaylistSegment } from '../../proof/playlist';
import type { ClosedCut } from './clockMap';
import { relocate, type LiveItem } from './liveItems';
import { useVisible } from './useDawPlayPosition';

/** While the DAW plays, its items are read again this often: an edit made in the DAW during a play lands on the next read. */
export const LIVE_ITEMS_REFRESH_MS = 5000;

export interface FollowMap {
  playlist: readonly PlaylistSegment[];
  items: readonly WorkspaceItem[];
  cuts: readonly ClosedCut[];
}

const audible = (it: DawLiveItem): LiveItem | null =>
  it.muted || it.sourceFile === ''
    ? null
    : { guid: it.guid, sourceFile: it.sourceFile, position: it.position, length: it.length, sourceStart: it.sourceStart, playRate: it.playRate };

/**
 * The map the follow-along uses to turn the DAW's play head into a word: the playlist, items and closing cuts as the saved project had them, put
 * onto the items the DAW has now (`relocate`) once they have been read. The saved project knows none of the narrator's edits since the alignment
 * was read (a move, a trim, a rate, a section deleted, a split whose right half has a GUID it never saw), and following it lands on the wrong
 * sentence or none. The DAW is read on mount, when the window is shown again and when the DAW starts playing, and every 5 s while it plays. A DAW that
 * cannot be read, or a track with nothing the playlist's files are on, leaves the saved map as it was.
 */
export function useLiveFollowMap(chapterId: string, saved: FollowMap, caps: DawCapabilities | null): FollowMap {
  const sync = usePort('dawTransportSync');
  const visible = useVisible();
  const enabled = !!caps?.reachable && !!caps.capabilities['transport_sync']?.available && !!caps.capabilities['track_state']?.available;
  const [items, setItems] = useState<LiveItem[] | null>(null);

  useEffect(() => {
    setItems(null);
    if (!enabled || !visible) return;
    let alive = true;
    let reading = false;
    let playing = false;
    const read = (): void => {
      if (reading) return;
      reading = true;
      sync.dawLiveItems(chapterId).then(
        (answer) => {
          reading = false;
          if (alive) setItems(answer.available ? answer.items.flatMap((it) => audible(it) ?? []) : null);
        },
        () => {
          reading = false;
        },
      );
    };
    read();
    const stop = sync.subscribeDawPosition((pos) => {
      const now = pos.playing && !pos.recording;
      if (now && !playing) read();
      playing = now;
    });
    const timer = setInterval(() => {
      if (playing) read();
    }, LIVE_ITEMS_REFRESH_MS);
    return () => {
      alive = false;
      stop();
      clearInterval(timer);
    };
  }, [sync, chapterId, enabled, visible]);

  const { playlist, items: savedItems, cuts } = saved;
  return useMemo(() => {
    if (items === null) return saved;
    const moved = relocate(playlist, items, cuts);
    return moved.playlist.length === 0 ? saved : moved;
    // `saved` is its three parts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, playlist, savedItems, cuts]);
}
