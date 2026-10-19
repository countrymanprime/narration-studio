import { useEffect, useState } from 'react';
import { usePort } from '../../../ports/usePort';

/** How many backups the DAW holds for the chapter, for the drawer's tab. Zero until read, and when the table cannot be. `again` makes the page read it anew. */
export function useBackupsCount(chapterId: string, enabled: boolean, again: unknown): number {
  const daw = usePort('daw');
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    daw.backups().then(
      (all) => live && setCount(all.filter((b) => b.chapterId === chapterId).length),
      () => live && setCount(0),
    );
    return () => {
      live = false;
    };
  }, [daw, chapterId, enabled, again]);
  return enabled ? count : 0;
}
