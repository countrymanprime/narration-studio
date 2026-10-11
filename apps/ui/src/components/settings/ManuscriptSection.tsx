import type { Bootstrap } from '../../types';
import { Panel } from '../primitives/Panel';
import { useManuscriptImport } from '../production/ManuscriptImport';
import type { Notify } from '../primitives/Toast';

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
    <Panel title="Manuscript" subtitle={manuscript ? `Imported ${manuscript.importedAt}` : 'No manuscript yet'} actions={chooseButton} className="mb-4">
      {dialogs}
    </Panel>
  );
}
