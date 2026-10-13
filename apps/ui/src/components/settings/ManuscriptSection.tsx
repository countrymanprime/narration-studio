import type { Bootstrap } from '../../types';
import { Panel } from '../primitives/Panel';
import { useManuscriptImport } from '../production/ManuscriptImport';
import type { Notify } from '../primitives/Toast';

/** The mock's "Imported Sep 12 · 29,222 words": the import's day, short, and the words a narrator reads. */
function importedLine(manuscript: NonNullable<Bootstrap['manuscript']>): string {
  const day = new Date(manuscript.importedAt);
  const when = Number.isNaN(day.getTime()) ? manuscript.importedAt : day.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `Imported ${when} · ${manuscript.narratableWordCount.toLocaleString('en-US')} words`;
}

/**
 * Replace manuscript in its one place (SNM-2). It mounts the same import flow the Production page uses, through the one
 * exported opener `useManuscriptImport`, so there is a single implementation of the flow: the confirm that names what a
 * replace clears, and no delivery profile on a replace (that is chosen on the first import only).
 */
export function ManuscriptSection({
  data,
  go,
  notify,
  refreshBootstrap,
}: {
  data: Bootstrap;
  go: (page: string) => void;
  notify: Notify;
  refreshBootstrap: () => Promise<void>;
}) {
  const { chooseButton, dialogs } = useManuscriptImport({ data, go, notify, refreshBootstrap });
  const manuscript = data.manuscript;
  return (
    <Panel title="Manuscript">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-sm text-[var(--text-muted)]">{manuscript ? importedLine(manuscript) : 'No manuscript yet'}</span>
        {chooseButton}
      </div>
      {dialogs}
    </Panel>
  );
}
