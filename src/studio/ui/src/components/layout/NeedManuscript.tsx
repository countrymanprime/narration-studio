// The page with no manuscript (the mock's `ui/NeedManuscript.tsx`): a panel that says so and offers the import. The button either goes to
// Production, where the import lives (`onImport`), or is the import's own button (`importButton`, from `NeedManuscriptImport`), which
// opens the file dialog and the review in place. The mock also opens its import dialog by itself on the Script page; here that would be a
// page change nobody asked for (the "bounce" of issue 1720), so the button is the only way in.

import type { ReactNode } from 'react';
import { Heading } from '../primitives/Heading';
import { Button } from '../primitives/Button';
import { Panel } from '../primitives/Panel';

export function NeedManuscript({
  title,
  onImport,
  importButton,
  children,
}: {
  title: string;
  onImport?: () => void;
  importButton?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <>
      <Panel label={title}>
        <div className="flex flex-col items-center gap-3 px-4 py-12 text-center">
          <Heading title={title} />
          <p className="m-0 text-[var(--text-muted)]">This project has no manuscript yet. Import one to begin.</p>
          {importButton ?? (onImport && <Button onClick={onImport}>Import manuscript</Button>)}
        </div>
      </Panel>
      {children}
    </>
  );
}
