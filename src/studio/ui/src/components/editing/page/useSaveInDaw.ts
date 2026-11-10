import { useCallback, useEffect, useRef, useState } from 'react';
import type { DawCapabilities, DawResult } from '../../../api/contracts/daw';
import { overlay } from '../../../overlay/overlayService';
import { usePort } from '../../../ports/usePort';

/** What the **Save in REAPER and read** button shows: whether a click is being answered, the refusal the last click got and what the last save wrote. */
export interface SaveInDaw {
  saving: boolean;
  /** The sentence the last click was refused with; null once the next click starts, and after a save. */
  refusal: string | null;
  /** The DAW's sentence for the last save (what the saved project holds); null before one and after a refusal. */
  saved: string | null;
  onSave: () => void;
}

/** The DAW has no way to save from the app (not built for it, or never will be), so no button is offered. A DAW that is merely not connected still gets one: its click answers why. */
export const canSaveFromApp = (caps: DawCapabilities | null): boolean => {
  const level = caps?.capabilities.save_project?.level;
  return level === 'supported' || level === 'experimental';
};

const NO_ANSWER = 'The DAW did not answer the save. Check that it is open, then try again.';

/**
 * Saves the DAW project on the narrator's click and then reads the chapter again, so a take recorded since the last save is there to edit. It never runs
 * on its own. A refusal stays in `refusal` (the notice words it beside the button) and is also a toast; a save is a toast saying what it wrote. Two
 * clicks do not send two saves: the second is ignored while the first is answered.
 */
export function useSaveInDaw(chapterId: string, onReread: () => void): SaveInDaw {
  const daw = usePort('daw');
  const [saving, setSaving] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const busy = useRef(false);
  // What a save said belongs to the chapter it was clicked on.
  useEffect(() => {
    setRefusal(null);
    setSaved(null);
  }, [chapterId]);
  const live = useRef(true);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);

  const onSave = useCallback(() => {
    if (busy.current) return;
    busy.current = true;
    setSaving(true);
    setRefusal(null);
    setSaved(null);
    daw
      .saveProject()
      .catch((): DawResult => ({ ok: false, changed: false, message: NO_ANSWER, undoSteps: 0, refused: NO_ANSWER }))
      .then((result) => {
        busy.current = false;
        if (!live.current) return;
        setSaving(false);
        if (result.ok) {
          setSaved(result.message);
          overlay.toast(result.message);
          onReread();
          return;
        }
        const sentence = result.refused ?? result.message;
        setRefusal(sentence);
        overlay.toast(sentence, { tone: 'error' });
      });
  }, [daw, onReread]);

  return { saving, refusal, saved, onSave };
}
