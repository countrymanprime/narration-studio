import { useEffect, useRef } from 'react';
import type { OverlayService } from '../../../overlay/overlayService';
import { START_TOPIC } from '../record/RecordSetup';
import { TAKE_TOPIC } from '../record/useRecordControl';

/**
 * Takes a message away once it has stopped being true. A refusal the narrator was shown (the reasons Record had while it could not start)
 * and the messages about REAPER starting are about Record not being ready; once it is, they are history, and a toast that says "REAPER is not
 * answering" over a Record that works only misleads.
 */
export function useStaleToasts(
  overlay: Pick<OverlayService, 'getSnapshot' | 'dismissToast' | 'dismissTopic'>,
  { ready, reason, recording = false }: { ready: boolean; reason: string; recording?: boolean },
): void {
  // A take that ended without the narrator's Stop was said once; a new take makes that old.
  useEffect(() => {
    if (recording) overlay.dismissTopic(TAKE_TOPIC);
  }, [overlay, recording]);
  // Every reason Record has had since it was last ready: a toast saying one of them is what to take away.
  const seen = useRef(new Set<string>());
  useEffect(() => {
    if (reason) seen.current.add(reason);
    if (!ready || reason) return;
    overlay.dismissTopic(START_TOPIC);
    for (const toast of overlay.getSnapshot().toasts) if (seen.current.has(toast.text)) overlay.dismissToast(toast.id);
    seen.current.clear();
  }, [overlay, ready, reason]);
}
