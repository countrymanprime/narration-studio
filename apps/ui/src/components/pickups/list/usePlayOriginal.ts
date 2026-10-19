import { useEffect, useRef, useState } from 'react';
import type { PickupItem } from '../../../api/contracts/pickups';
import { useOverlay } from '../../../overlay/OverlayProvider';
import { usePort } from '../../../ports/usePort';
import { reasonSentence } from './pickupRows';
import { useRangePlayer } from '../../engine/useRangePlayer';
import { AFTER_SECONDS, BEFORE_SECONDS, originalSpot } from './originalAudio';

const ROLL = { pre: BEFORE_SECONDS, post: AFTER_SECONDS };

/**
 * "Hear the original in context" (PK-1): plays the chapter's own recording around a pickup's time, `BEFORE_SECONDS` before it to `AFTER_SECONDS`
 * after, through the player Proof's auditions use and the host's `/media` route. The DAW is not asked to play and its cursor does not move. The
 * chapter's linked track and its items are read when Play is pressed, not when the page opens, so a page with nothing played asks the host for
 * nothing more. A line that cannot be played says why in a message. Playing the same line again stops it.
 */
export function usePlayOriginal() {
  const overlay = useOverlay();
  const chapterTrackMap = usePort('chapterTrackMap');
  const tracks = usePort('tracks');
  const player = useRangePlayer(tracks.mediaUrl, ROLL);
  const [playing, setPlaying] = useState<string | null>(null);
  /* A press takes a number as it starts; an answer for an older press, read after a newer one, is dropped. */
  const presses = useRef(0);

  const toggle = async (pickup: PickupItem): Promise<void> => {
    const mine = ++presses.current;
    if (playing === pickup.id && player.isPlaying) {
      player.stop();
      setPlaying(null);
      return;
    }
    player.stop();
    setPlaying(null);
    const say = (text: string) => overlay.toast(text, { tone: 'error' });
    if (pickup.at === null) return say('This line has no place in the recording yet.');
    try {
      const match = await chapterTrackMap.chapterTrackMatch(pickup.chapterId);
      if (mine !== presses.current) return;
      if (!match.track || (match.status !== 'confirmed' && match.status !== 'matched')) {
        return say('This chapter has no track linked in the DAW, so there is no recording to play. Link it on Proof.');
      }
      const trackGuid = match.track.trackGuid;
      const project = await tracks.tracksList();
      if (mine !== presses.current) return;
      const track = project.tracks.find((candidate) => candidate.guid === trackGuid);
      if (!track) return say('The chapter’s track is not in the DAW project any more.');
      const spot = originalSpot(track.items, pickup.at);
      if (!spot.ok) return say(spot.reason);
      setPlaying(pickup.id);
      player.play({ sourceFile: spot.sourceFile, rangeStart: spot.at, rangeEnd: spot.at });
    } catch (error) {
      if (mine === presses.current) say(reasonSentence(error));
    }
  };

  /* The file would not load: say so, and the row's button goes back to Play. */
  useEffect(() => {
    if (!player.loadError || playing === null) return;
    setPlaying(null);
    overlay.toast('The recording could not be played. Check that its file is still where the DAW project keeps it.', { tone: 'error' });
  }, [player.loadError, playing, overlay]);

  /* The range ends by itself: the row's button goes back to Play. */
  return { playing: player.isPlaying ? playing : null, toggle };
}
