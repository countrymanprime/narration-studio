import { useCallback, useState } from 'react';

/** Whether the strip is shown: off to begin with, flipped by the header button and the S key (the page binds `editing.strip` to `toggle`). */
export function useStripOpen(): { open: boolean; toggle: () => void } {
  const [open, setOpen] = useState(false);
  const toggle = useCallback(() => setOpen((o) => !o), []);
  return { open, toggle };
}
