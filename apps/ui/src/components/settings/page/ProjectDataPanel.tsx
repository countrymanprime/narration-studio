import { useState } from 'react';
import { describeApiError } from '../../../api/errorMessage';
import { usePendingAction } from '../../../hooks/usePendingAction';
import { usePort } from '../../../ports/usePort';
import { Button } from '../../primitives/Button';
import { ConfirmDialog } from '../../primitives/ConfirmDialog';
import { Panel } from '../../primitives/Panel';
import type { Notify } from '../../primitives/Toast';

/**
 * Settings > Project data, kept as built: clears what the project derived from its manuscript, after a confirm that
 * stays open and busy until the call ends and cannot be confirmed twice (ADR 0075). Settings remain.
 */
export function ProjectDataPanel({ notify, onProjectDataCleared }: { notify: Notify; onProjectDataCleared: () => Promise<void> }) {
  const manuscript = usePort('manuscript');
  const [confirming, setConfirming] = useState(false);
  const clearing = usePendingAction();
  return (
    <div id="settings-project-data" className="scroll-mt-4">
      <Panel title="Project data" subtitle="This project">
        <div className="space-y-4 text-sm">
          <p className="m-0" style={{ color: 'var(--text-muted)' }}>
            Clearing removes the imported manuscript and stored source, Story Bible, proofing artifacts, reader notes/bookmarks, and saved comparison results.
            Settings remain.
          </p>
          <Button variant="danger" onClick={() => setConfirming(true)}>
            Clear derived project data…
          </Button>
        </div>
      </Panel>
      {confirming && (
        <ConfirmDialog
          title="Clear derived project data?"
          body="This permanently removes the imported manuscript and stored source, Story Bible and proofing data, reader notes/bookmarks, and saved comparison results for this project. Settings will remain."
          confirmLabel="Clear project data"
          confirmVariant="danger"
          pending={clearing.isPending('clear')}
          confirm={() =>
            void clearing.run('clear', async () => {
              try {
                await manuscript.clearProjectData();
                setConfirming(false);
                notify('Derived project data cleared.');
                await onProjectDataCleared();
              } catch (error) {
                notify(describeApiError(error), 'error');
              }
            })
          }
          cancel={() => setConfirming(false)}
        />
      )}
    </div>
  );
}
