import { useState, type KeyboardEvent } from 'react';

/**
 * The draft of a text box whose value is reported when the narrator is done, not on each key: typing changes only the draft, Enter or leaving the
 * box hands a changed draft to `settle`, and Escape puts the value back. A new `value` from outside replaces the draft. `settle` decides what
 * the draft is worth (it may report it, or refuse it and leave it in the box); `reset` puts the value back for a draft that needs no report.
 */
export function useSettledDraft(value: string, settle: (draft: string) => void) {
  // The draft remembers the value it was typed over and stands only while that value does. It is read during render, not copied in by an effect:
  // an effect that mounts late (a key pressed in the first frame) would run after that key and put the value back over it.
  const [held, setHeld] = useState<{ over: string; text: string } | null>(null);
  if (held && held.over !== value) setHeld(null);
  const draft = held && held.over === value ? held.text : value;
  const reset = () => setHeld(null);
  const settleChanged = () => {
    if (draft !== value) settle(draft);
  };
  return {
    draft,
    setDraft: (text: string) => setHeld({ over: value, text }),
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
