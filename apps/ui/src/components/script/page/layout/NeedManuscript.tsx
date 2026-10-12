// The page with no manuscript (the mock's `ui/NeedManuscript.tsx` and `ensureImportPrompt`): a panel that says so and offers the
// import, and the import opened once by itself. "Once" is per app session, as the mock's flag is: the page mounting again (a route
// change, a re-render) does not open it again. The import lives on Production, so opening it goes there.

import { useEffect } from 'react';
import { Button } from '../../../primitives/Button';
import { Panel } from '../../../primitives/Panel';

/** How long after the page draws the import opens by itself, so the empty state is seen first. */
export const IMPORT_PROMPT_DELAY_MS = 400;

let prompted = false;

/** Whether the import has opened by itself this session: tests and stories run many sessions in one module. */
export function setImportPrompted(value: boolean): void {
  prompted = value;
}

export function NeedManuscript({ title, onImport }: { title: string; onImport: () => void }) {
  useEffect(() => {
    if (prompted) return;
    const timer = setTimeout(() => {
      prompted = true;
      onImport();
    }, IMPORT_PROMPT_DELAY_MS);
    return () => clearTimeout(timer);
    // The first draw only: a new `onImport` is the same import.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <Panel label={title}>
      <div className="flex flex-col items-center gap-3 px-4 py-12 text-center">
        <h2 className="m-0 text-lg font-semibold">{title}</h2>
        <p className="m-0 text-[var(--text-muted)]">This project has no manuscript yet. Import one to begin.</p>
        <Button onClick={onImport}>Import manuscript</Button>
      </div>
    </Panel>
  );
}
