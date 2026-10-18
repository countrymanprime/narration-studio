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

type ManuscriptProps = {
  data: Bootstrap;
  go: (page: string) => void;
  notify: Notify;
  refreshBootstrap: () => Promise<void>;
};

/**
 * Replace manuscript in its one place (SNM-2), without a panel around it: the Settings page's Manuscript row draws it in its control column. It
 * mounts the same import flow the Production page uses, through the one exported opener `useManuscriptImport`, so there is a single
 * implementation of the flow: the confirm that names what a replace clears, and no delivery profile on a replace (that is chosen on the
 * first import only).
 */
export function ManuscriptBody({ data, go, notify, refreshBootstrap }: ManuscriptProps) {
  const { chooseButton, dialogs } = useManuscriptImport({ data, go, notify, refreshBootstrap });
  const manuscript = data.manuscript;
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-sm text-[var(--text-muted)]">{manuscript ? importedLine(manuscript) : 'No manuscript yet'}</span>
        {chooseButton}
      </div>
      {dialogs}
    </>
  );
}

/** The panel form of {@link ManuscriptBody}, kept for the old page and its stories. */
export function ManuscriptSection(props: ManuscriptProps) {
  return (
    <Panel title="Manuscript">
      <ManuscriptBody {...props} />
    </Panel>
  );
}
