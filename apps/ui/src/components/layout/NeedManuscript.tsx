// The page with no manuscript (the mock's `ui/NeedManuscript.tsx`): a panel that says so and offers the import. The import lives on
// Production, so the button goes there. The mock also opens its import dialog by itself on the Script page; here that would be a page
// change nobody asked for (the "bounce" of issue 1720), so the button is the only way in.

import { Heading } from '../primitives/Heading';
import { Button } from '../primitives/Button';
import { Panel } from '../primitives/Panel';

export function NeedManuscript({ title, onImport }: { title: string; onImport?: () => void }) {
  return (
    <Panel label={title}>
      <div className="flex flex-col items-center gap-3 px-4 py-12 text-center">
        <Heading title={title} />
        <p className="m-0 text-[var(--text-muted)]">This project has no manuscript yet. Import one to begin.</p>
        {onImport && <Button onClick={onImport}>Import manuscript</Button>}
      </div>
    </Panel>
  );
}
