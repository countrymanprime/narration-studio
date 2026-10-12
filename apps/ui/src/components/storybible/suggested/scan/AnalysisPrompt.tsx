import { useState } from 'react';
import { Button } from '../../../primitives/Button';
import { Checkbox } from '../../../primitives/Checkbox';

export type ScanChoice = 'basic' | 'download' | 'import';

/**
 * The body of "Scan the manuscript" on the first scan with nothing downloaded: three ways forward, none required. The title, the Close
 * button and Escape are the overlay's, and closing changes nothing. "Don't ask again" is handed to `choose` with the choice, so it is
 * saved before the chosen action runs.
 */
export function AnalysisPrompt({ choose, busy = false }: { choose: (choice: ScanChoice, never: boolean) => void; busy?: boolean }) {
  const [never, setNever] = useState(false);
  return (
    <div className="flex flex-col gap-3" data-analysis-prompt>
      <p className="m-0 text-sm text-[var(--text-muted)]">A scan finds more with the optional analysis tools. Nothing downloads until you agree.</p>
      <div className="flex flex-col items-start gap-2">
        <Button autoFocus disabled={busy} onClick={() => choose('basic', never)}>
          Use basic scan now
        </Button>
        <Button variant="secondary" disabled={busy} aria-haspopup="dialog" onClick={() => choose('download', never)}>
          Download better analysis…
        </Button>
        <Button variant="secondary" disabled={busy} aria-haspopup="dialog" onClick={() => choose('import', never)}>
          Import from a file instead
        </Button>
      </div>
      <Checkbox checked={never} onChange={setNever}>
        Don’t ask again
      </Checkbox>
    </div>
  );
}
