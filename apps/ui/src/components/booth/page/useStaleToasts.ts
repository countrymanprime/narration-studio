import { useEffect, useRef } from 'react';
import type { OverlayService } from '../../../overlay/overlayService';

/** The topic of what the setup notice's buttons say ("starting", "linked", "could not be started"); gone once Record is ready. */
export const SETUP_TOPIC = 'daw-setup';

/**
 * Takes a message away once it has stopped being true. A refusal the narrator was shown (the reasons Record had while it could not start)
 * and the setup notice's own messages are about Record not being ready; once it is, they are history, and a toast that says "REAPER is not
 * answering" over a Record that works only misleads.
 */
export function useStaleToasts(
  overlay: Pick<OverlayService, 'getSnapshot' | 'dismissToast' | 'dismissTopic'>,
  { ready, reason }: { ready: boolean; reason: string },
): void {
  // Every reason Record has had since it was last ready: a toast saying one of them is what to take away.
  const seen = useRef(new Set<string>());
  useEffect(() => {
    if (reason) seen.current.add(reason);
    if (!ready || reason) return;
    overlay.dismissTopic(SETUP_TOPIC);
    for (const toast of overlay.getSnapshot().toasts) if (seen.current.has(toast.text)) overlay.dismissToast(toast.id);
    seen.current.clear();
  }, [overlay, ready, reason]);
}
