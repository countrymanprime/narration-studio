import { useCallback, useEffect, useRef, useState } from 'react';
import type { DawCapabilities, DawResult } from '../../../api/contracts/daw';
import { overlay } from '../../../overlay/overlayService';
import { useCommand } from '../../../input/useCommand';
import type { DawClient } from '../../../ports/daw';
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

const NO_ANSWER = 'The DAW did not answer the save. Check that it is open, then try again.';
const NOT_SAVED = 'The project was not saved.';
/** The host's own timeout is shorter (15 s); this is for a call that never comes back at all. */
export const SAVE_GIVES_UP_MS = 30_000;
/** A toast holds a sentence, not a page: a longer answer is cut so it cannot cover the header. */
const MAX_TOAST = 400;

// One save at a time for the whole app, and a page opened again while one is unanswered shows it as running and reads when it is done.
let inFlight: Promise<boolean> | null = null;
/** Mounted Editing pages: told when a save starts, whoever started it (the button or Ctrl+S), so each shows it running and reads when it is done. */
const watchers = new Set<(running: Promise<boolean>) => void>();

/** The sentence for a toast: words the narrator can read, never blank (bidi controls alone are not words), never longer than MAX_TOAST. */
const sayable = (text: string | undefined, fallback: string): string => {
  const words = (text ?? '').replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069\s]/g, '') === '' ? fallback : (text as string).trim();
  return words.length > MAX_TOAST ? `${words.slice(0, MAX_TOAST - 1)}…` : words;
};

/** Starts the one save (a second call while one is unanswered does nothing) and says the answer in a toast, on whichever page the narrator is. */
function startSave(daw: DawClient): void {
  if (inFlight) return;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const silent = new Promise<DawResult>((resolve) => {
    timer = setTimeout(() => resolve({ ok: false, changed: false, message: NO_ANSWER, undoSteps: 0, refused: NO_ANSWER }), SAVE_GIVES_UP_MS);
  });
  const running = Promise.race([daw.saveProject(), silent])
    .catch((): DawResult => ({ ok: false, changed: false, message: NO_ANSWER, undoSteps: 0, refused: NO_ANSWER }))
    .then((result) => {
      clearTimeout(timer);
      inFlight = null;
      if (result.ok) overlay.toast(sayable(result.message, 'Saved the project.'));
      else overlay.toast(sayable(result.refused || result.message, NOT_SAVED), { tone: 'error' });
      return result.ok;
    });
  inFlight = running;
  watchers.forEach((watch) => watch(running));
}

/**
 * Ctrl+S (Cmd+S on macOS), from any page: the same save as the **Save in REAPER and read** button, with the same toast. The Editing page, when
 * open, shows it running and reads the chapter again. Returns the save, for the jump menu's row. No DAW, or one that cannot save from the app, is the port's refusal in an error toast.
 */
export function useSaveShortcut(): () => void {
  const daw = usePort('daw');
  const save = () => startSave(daw);
  useCommand('project.save', save);
  return save;
}

/**
 * Saves the DAW project on the narrator's click and then reads the chapter again, so a take recorded since the last save is there to edit. It never runs
 * on its own. A refusal is an error toast (the button is back to idle, so the narrator can fix the cause and press it again); a save is a toast
 * saying what it wrote. Two clicks do not send two saves, also across a page left and opened again, and a call that never answers ends in a refusal.
 */
export function useSaveInDaw(onReread: () => void): SaveInDaw {
  const daw = usePort('daw');
  const [saving, setSaving] = useState(false);
  const live = useRef(true);
  const reread = useRef(onReread);
  reread.current = onReread;

  const follow = useCallback((running: Promise<boolean>) => {
    setSaving(true);
    void running.then((saved) => {
      if (!live.current) return;
      setSaving(false);
      if (saved) reread.current();
    });
  }, []);

  useEffect(() => {
    live.current = true;
    // A save started on a page the narrator has left is still running: show it, and read when it is done.
    if (inFlight) follow(inFlight);
    watchers.add(follow);
    return () => {
      live.current = false;
      watchers.delete(follow);
    };
  }, [follow]);

  const onSave = useCallback(() => startSave(daw), [daw]);

  return { saving, onSave };
}
