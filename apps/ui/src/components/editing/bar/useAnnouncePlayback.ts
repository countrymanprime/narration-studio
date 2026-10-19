import { useEffect, useRef } from 'react';
import { overlay } from '../../../overlay/overlayService';

/**
 * Says "Playing" when the chapter or a selection starts playing and "Stopped" when it ends, through the overlay's polite announcer: the
 * Play button's icon is all a screen reader would otherwise have. Nothing is said for the state the page opens in. Playback only: the
 * Booth never speaks while a take records, so a start is not announced there.
 */
export function useAnnouncePlayback(playing: boolean): void {
  const was = useRef(playing);
  useEffect(() => {
    if (was.current === playing) return;
    was.current = playing;
    overlay.announce(playing ? 'Playing' : 'Stopped');
  }, [playing]);
}
