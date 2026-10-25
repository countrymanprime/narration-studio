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
      {/* The frame a failed read draws (`LoadError`): the page's title at the gutter, where every other state of the page has it, then the card in
          a 48 rem column, its sentence and button left-aligned. The mock centres them in a card the width of the page, 1,670 px wide around
          a 400 px message at 1920, with the title inside it (alignment audit XPF-26, R3PF-16, R3MS-6, XMS-22). */}
      <div className="max-w-3xl space-y-4">
        <Heading title={title} />
        <Panel label={title}>
          <div className="flex flex-col items-start gap-3">
            <p className="m-0 text-[var(--text-muted)]">This project has no manuscript yet. Import one to begin.</p>
            {importButton ?? (onImport && <Button onClick={onImport}>Import manuscript</Button>)}
          </div>
        </Panel>
      </div>
      {children}
    </>
  );
}
