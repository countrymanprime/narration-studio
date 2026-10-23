import type { ReactNode } from 'react';
import { Heading } from '../../primitives/Heading';
import { IconButton } from '../../primitives/IconButton';
import { Panel } from '../../primitives/Panel';

/** The state of a project with no manuscript (the mock's NoManuscript). The import button is the existing `useManuscriptImport` one, given as a prop. */
export function NoManuscript({ projectName, importButton, onSetDueDate }: { projectName: string; importButton: ReactNode; onSetDueDate: () => void }) {
  return (
    <div className="flex flex-col gap-4">
      <header>
        <Heading title="Production">{projectName}</Heading>
      </header>
      <Panel label="Import your manuscript">
        <div className="flex flex-col items-center gap-3 px-4 py-12 text-center">
          <h2 className="font-['Barlow_Condensed',sans-serif] text-[1.25rem] font-semibold">Start by importing your manuscript</h2>
          <p className="max-w-[52ch] text-[0.875rem] text-[var(--text-muted)]">
            The app reads your manuscript, finds the chapters, and works out how much finished audio, recording and editing that means.
          </p>
          <div className="flex items-center gap-2">
            {importButton}
            <IconButton action="calendar" label="Set a due date" onClick={onSetDueDate} />
          </div>
        </div>
      </Panel>
    </div>
  );
}
