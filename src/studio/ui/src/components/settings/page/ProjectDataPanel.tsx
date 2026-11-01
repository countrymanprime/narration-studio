import { useState } from 'react';
import { describeApiError } from '../../../api/errorMessage';
import { usePendingAction } from '../../../hooks/usePendingAction';
import { usePort } from '../../../ports/usePort';
import { Button } from '../../primitives/Button';
import { ConfirmDialog } from '../../primitives/ConfirmDialog';
import type { Notify } from '../../primitives/Toast';

/** The Clear button and its confirm, without a panel: the Settings page's Clear derived data row draws this. */
export function ClearProjectData({ notify, onProjectDataCleared, label }: { notify: Notify; onProjectDataCleared: () => Promise<void>; label: string }) {
  const manuscript = usePort('manuscript');
  const [confirming, setConfirming] = useState(false);
  const clearing = usePendingAction();
  return (
    <>
      <Button variant="danger" onClick={() => setConfirming(true)}>
        {label}
      </Button>
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
    </>
  );
}
