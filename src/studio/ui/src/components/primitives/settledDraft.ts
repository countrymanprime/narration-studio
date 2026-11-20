import { useRef, useState, type KeyboardEvent } from 'react';

type Held = { over: string; text: string; typedDuringSave: boolean };

/**
 * The draft of a text box whose value is reported when the narrator is done, not on each key: typing changes only the draft, Enter or leaving the
 * box hands a changed draft to `settle`, and Escape puts the value back. A new `value` from outside replaces the draft. `settle` decides what
 * the draft is worth (it may report it, or refuse it and leave it in the box); `reset` puts the value back for a draft that needs no report.
 * A draft is handed over once: a second Enter, a held Enter or a blur after Enter sends nothing more until the narrator types again or the
 * value changes, so a save that is slow to answer is not sent again. When `settle` returns the save's promise, a draft typed before it ends
 * is the narrator's next edit and not the one being saved: it stands when the value changes, where any other draft is replaced.
 */
export function useSettledDraft(value: string, settle: (draft: string) => void | Promise<unknown>) {
  // The draft remembers the value it was typed over and stands only while that value does. It is read during render, not copied in by an effect:
  // an effect that mounts late (a key pressed in the first frame) would run after that key and put the value back over it.
  const [held, setHeld] = useState<Held | null>(null);
  const stands = held !== null && (held.over === value || held.typedDuringSave);
  if (held && held.over !== value) setHeld(held.typedDuringSave ? { over: value, text: held.text, typedDuringSave: false } : null);
  const draft = held && stands ? held.text : value;
  // Refs, not state: the keydowns of a held Enter can arrive before a render.
  const settled = useRef<{ over: string; text: string } | null>(null);
  const saveOut = useRef<Promise<unknown> | null>(null);
  const reset = () => {
    settled.current = null;
    setHeld(null);
  };
  const settleChanged = () => {
    if (draft === value) return;
    if (settled.current?.over === value && settled.current.text === draft) return;
    settled.current = { over: value, text: draft };
    const save = settle(draft);
    if (!(save instanceof Promise)) return;
    saveOut.current = save;
    const end = () => {
      if (saveOut.current === save) saveOut.current = null;
    };
    // Whoever started the save shows how it ended; here it only stops marking what is typed.
    save.then(end, end);
  };
  return {
    draft,
    setDraft: (text: string) => {
      settled.current = null;
      setHeld({ over: value, text, typedDuringSave: saveOut.current !== null });
    },
    reset,
    /** Spread onto the text box. */
    boxProps: {
      onBlur: settleChanged,
      onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => {
        if (event.key === 'Enter') settleChanged();
        if (event.key === 'Escape') reset();
      },
    },
  };
}
