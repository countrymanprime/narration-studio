import { useEffect, useRef } from 'react';
import { overlay } from '../../../overlay/overlayService';
import { ANNOUNCE_SETTLE_MS } from '../script/useAnnounceCursor';

/**
 * Says "Playing" when the chapter or a selection starts playing and "Stopped" when it ends, through the overlay's polite announcer: the
 * Play button's icon is all a screen reader would otherwise have. Nothing is said for the state the page opens in. A stop moves the cursor,
 * and the cursor's own announcement would replace this one (the announcer holds a single sentence), so "Stopped" waits until just after
 * the cursor has settled. Playback only: the Booth never speaks while a take records, so a start is not announced there.
 */
export function useAnnouncePlayback(playing: boolean): void {
  const was = useRef(playing);
  useEffect(() => {
    if (was.current === playing) return;
    was.current = playing;
    if (playing) return void overlay.announce('Playing');
    const timer = setTimeout(() => overlay.announce('Stopped'), ANNOUNCE_SETTLE_MS + 50);
    return () => clearTimeout(timer);
  }, [playing]);
}
