import { useRef, useState } from 'react';

type Save = (value: string) => void | Promise<unknown>;

/**
 * The value a control shows while its save is out: the one on its way, then the stored one again once the save ends, kept or refused. `send`
 * compares with what is shown, not with what is stored, so going back to the stored value while a save is out is sent after it, and a second
 * press of the value being saved sends nothing. It returns the save it started, if `onChange` returned one.
 */
export function useValueInFlight(value: string, onChange: Save): { shown: string; send: (next: string) => void | Promise<unknown> } {
  const [sent, setSent] = useState<{ value: string; save: number } | null>(null);
  const saves = useRef(0);
  const shown = sent?.value ?? value;
  const send = (next: string): void | Promise<unknown> => {
    if (next === shown) return undefined;
    const started = onChange(next);
    if (!(started instanceof Promise)) return undefined;
    const save = ++saves.current;
    setSent({ value: next, save });
    // Only the latest save stops the showing: an earlier one that ends while a later one is out leaves the later value up.
    const end = () => setSent((now) => (now?.save === save ? null : now));
    // Whoever started the save shows how it ended; here it only stops showing the value as on its way.
    started.then(end, end);
    return started;
  };
  return { shown, send };
}
