import { useCallback, useEffect, useRef, useState } from 'react';
import type { DawCapabilities, DawResult } from '../../../api/contracts/daw';
import { overlay } from '../../../overlay/overlayService';
import { usePort } from '../../../ports/usePort';

/** What the **Save in REAPER and read** button shows: whether a click is being answered. The answer itself is a toast. */
export interface SaveInDaw {
  saving: boolean;
  onSave: () => void;
}

/** The DAW has no way to save from the app (not built for it, or never will be), so no button is offered. A DAW that is merely not connected still gets one: its click answers why. */
export const canSaveFromApp = (caps: DawCapabilities | null): boolean => {
  const level = caps?.capabilities.save_project?.level;
  return level === 'supported' || level === 'experimental';
};

// One save at a time for the whole app: a page that is left and opened again while a save is unanswered must not send a second.
let inFlight = false;

const NO_ANSWER = 'The DAW did not answer the save. Check that it is open, then try again.';

/**
 * Saves the DAW project on the narrator's click and then reads the chapter again, so a take recorded since the last save is there to edit. It never runs
 * on its own. A refusal is an error toast (the button is back to idle, so the narrator can fix the cause and press it
 * again); a save is a toast saying what it wrote. Two clicks do not send two saves: the second is ignored while the first is answered.
 */
export function useSaveInDaw(onReread: () => void): SaveInDaw {
  const daw = usePort('daw');
  const [saving, setSaving] = useState(false);
  const live = useRef(true);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);

  const onSave = useCallback(() => {
    if (inFlight) return;
    inFlight = true;
    setSaving(true);
    daw
      .saveProject()
      .catch((): DawResult => ({ ok: false, changed: false, message: NO_ANSWER, undoSteps: 0, refused: NO_ANSWER }))
      .then((result) => {
        inFlight = false;
        if (live.current) setSaving(false);
        if (result.ok) {
          overlay.toast(result.message);
          if (live.current) onReread();
          return;
        }
        // The answer is said even when the narrator has left Editing, and a refusal with no words still says nothing was saved.
        overlay.toast(result.refused || result.message || 'The project was not saved.', { tone: 'error' });
      });
  }, [daw, onReread]);

  return { saving, onSave };
}
