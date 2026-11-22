import { useEffect, useRef, useState, type KeyboardEvent } from 'react';

type Held = { over: string; text: string; typedDuringSave: boolean };

type Options = {
  /**
   * Reads a draft as the text it is saved as (a number clamped into its range and moved onto its step), or `null` for a draft that has none,
   * which puts the value back. With it the box shows what a settle read, not what was typed: the text being saved while its save is out, then
   * `value` again once it ends, kept or refused. A draft is compared with that text, so going back to the stored value while a save is out is
   * sent after it.
   */
  read?: (draft: string) => string | null;
  /** A box taken away while it holds a draft settles it, as leaving the box does: a dialog dismissed by a press outside gives no blur. */
  settleOnUnmount?: boolean;
};

/**
 * The draft of a text box whose value is reported when the narrator is done, not on each key: typing changes only the draft, Enter or leaving the
 * box hands a changed draft to `settle`, and Escape puts the value back. A new `value` from outside replaces the draft. `settle` decides what
 * the draft is worth (it may report it, or refuse it and leave it in the box); `reset` puts the value back for a draft that needs no report.
 * A draft is handed over once: a second Enter, a held Enter or a blur after Enter sends nothing more until the narrator types again or the
 * value changes, so a save that is slow to answer is not sent again. When `settle` returns the save's promise, a draft typed before it ends
 * is the narrator's next edit and not the one being saved: it stands when the value changes, where any other draft is replaced.
 */
export function useSettledDraft(value: string, settle: (draft: string) => void | Promise<unknown>, { read, settleOnUnmount = false }: Options = {}) {
  // With `read`, the text a save `settle` returned is carrying, and that save.
  const [sent, setSent] = useState<{ text: string; save: Promise<unknown> } | null>(null);
  const standing = sent?.text ?? value;
  // The draft remembers the value it was typed over and stands only while that value does. It is read during render, not copied in by an effect:
  // an effect that mounts late (a key pressed in the first frame) would run after that key and put the value back over it.
  const [held, setHeld] = useState<Held | null>(null);
  const stands = held !== null && (held.over === standing || held.typedDuringSave);
  if (held && held.over !== standing) setHeld(held.typedDuringSave ? { over: standing, text: held.text, typedDuringSave: false } : null);
  const draft = held && stands ? held.text : standing;
  // Refs, not state: the keydowns of a held Enter can arrive before a render.
  const settled = useRef<{ over: string; text: string } | null>(null);
  const saveOut = useRef<Promise<unknown> | null>(null);
  // The draft as of the last event, for the unmount: state is a render behind when Escape and the unmount come in one event.
  const live = useRef<string | null>(null);
  live.current = held && stands ? held.text : null;
  const drop = () => {
    live.current = null;
    setHeld(null);
  };
  const reset = () => {
    settled.current = null;
    drop();
  };
  const settleChanged = (typed: string) => {
    const text = read ? read(typed) : typed;
    // With `read` the box shows what the draft read as from here: the value, or the text on its way.
    if (read) drop();
    if (text === null || text === standing) return;
    if (settled.current?.over === standing && settled.current.text === text) return;
    settled.current = { over: standing, text };
    const save = settle(text);
    if (!(save instanceof Promise)) return;
    saveOut.current = save;
    if (read) setSent({ text, save });
    const end = () => {
      if (saveOut.current === save) saveOut.current = null;
      // Only the latest save gives the box back to `value`: an earlier one that ends while a later one is out leaves the later text up.
      if (read) setSent((now) => (now?.save === save ? null : now));
    };
    // Whoever started the save shows how it ended; here it only stops marking what is typed.
    save.then(end, end);
  };
  const latestSettle = useRef(settleChanged);
  latestSettle.current = settleChanged;
  useEffect(
    () => () => {
      if (settleOnUnmount && live.current !== null) latestSettle.current(live.current);
    },
    [settleOnUnmount],
  );
  return {
    draft,
    /** The value as it stands: with `read`, the text a save is carrying while it is out; otherwise `value`. */
    standing,
    setDraft: (text: string) => {
      settled.current = null;
      live.current = text;
      setHeld({ over: standing, text, typedDuringSave: saveOut.current !== null });
    },
    reset,
    /** Settles `text` as Enter settles a draft (an arrow step). */
    settleText: settleChanged,
    /** Spread onto the text box. */
    boxProps: {
      onBlur: () => settleChanged(draft),
      onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => {
        if (event.key === 'Enter') settleChanged(draft);
        if (event.key === 'Escape') reset();
      },
    },
  };
}
