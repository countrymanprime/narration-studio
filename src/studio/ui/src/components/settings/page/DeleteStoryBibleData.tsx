import { useState } from 'react';
import { describeApiError } from '../../../api/errorMessage';
import type { GuideDeleted } from '../../../api/contracts/storyBible';
import { usePendingAction } from '../../../hooks/usePendingAction';
import { usePort } from '../../../ports/usePort';
import { Button } from '../../primitives/Button';
import { ConfirmDialog } from '../../primitives/ConfirmDialog';
import type { Notify } from '../../primitives/Toast';

const counted = (n: number, one: string, many: string) => `${n === 1 ? 'one' : n.toLocaleString()} ${n === 1 ? one : many}`;

/** The toast after Delete Story Bible data: what the host says it deleted, or that there was nothing. */
function deletedMessage({ entries, suggestions }: GuideDeleted): string {
  if (entries === 0 && suggestions === 0) return 'There were no Story Bible entries or scan suggestions to delete.';
  const parts = [entries > 0 && counted(entries, 'entry', 'entries'), suggestions > 0 && counted(suggestions, 'scan suggestion', 'scan suggestions')];
  return `Story Bible data deleted: ${parts.filter(Boolean).join(' and ')}.`;
}

/**
 * The confirm of Settings > Delete Story Bible data, the only place the Story Bible's data is deleted: names the project and counts what goes (the
 * entries and the scan's suggestions, read when it opens), says what stays and that there is no undo, and opens on Cancel. It stays open and busy until the host answers; a refusal
 * (a build or a scan is running) is a toast and the dialog stays, so Cancel is still the way out.
 */
function DeleteStoryBibleDataDialog({
  projectName,
  entries,
  suggestions,
  notify,
  onClose,
}: {
  projectName?: string;
  entries: number;
  suggestions: number;
  notify: Notify;
  onClose: () => void;
}) {
  const storyBible = usePort('storyBible');
  const deleting = usePendingAction();
  const project = projectName ? `“${projectName}”` : 'this project';
  const goes = [counted(entries, 'entry', 'entries'), suggestions > 0 ? counted(suggestions, 'scan suggestion', 'scan suggestions') : undefined]
    .filter(Boolean)
    .join(' and ');
  const remove = () =>
    deleting.run('delete', async () => {
      try {
        const deleted = await storyBible.guideDeleteAll();
        onClose();
        notify(deletedMessage(deleted));
      } catch (error) {
        notify(describeApiError(error), 'error');
      }
    });
  return (
    <ConfirmDialog
      title="Delete Story Bible data"
      body={
        <>
          <span className="block">
            Delete the Story Bible of {project}: {goes}, with every name, pronunciation, note, relationship, review flag and speaker colour, the types and the
            dialogue speakers?
          </span>
          <span className="mt-2 block">
            This cannot be undone. The script, takes, recordings, settings, voice samples and voice references stay. Add entry or Scan the manuscript starts the
            Story Bible again.
          </span>
        </>
      }
      confirmLabel="Delete Story Bible data"
      confirmVariant="danger"
      focusCancel
      pending={deleting.isPending('delete')}
      confirm={() => void remove()}
      cancel={onClose}
    />
  );
}

/** The Delete Story Bible data button of Settings > Project: it reads what would go, then asks first. */
export function DeleteStoryBibleData({ projectName, notify }: { projectName?: string; notify: Notify }) {
  const storyBible = usePort('storyBible');
  const extraction = usePort('extraction');
  const reading = usePendingAction();
  const [counts, setCounts] = useState<{ entries: number; suggestions: number } | null>(null);
  const open = () =>
    reading.run('read', async () => {
      try {
        const [entities, suggestions] = await Promise.all([storyBible.guideEntities(), extraction.extractionList()]);
        setCounts({ entries: entities.length, suggestions: suggestions.length });
      } catch (error) {
        notify(describeApiError(error), 'error');
      }
    });
  return (
    <>
      <Button variant="danger" disabled={reading.isPending('read')} onClick={() => void open()}>
        Delete Story Bible data…
      </Button>
      {counts && <DeleteStoryBibleDataDialog projectName={projectName} {...counts} notify={notify} onClose={() => setCounts(null)} />}
    </>
  );
}
