import { describeApiError } from '../../api/errorMessage';
import { useApi } from '../../api/ApiContext';
import type { GuideDeleted } from '../../api/contracts/storyBible';
import { usePendingAction } from '../../hooks/usePendingAction';
import { ConfirmDialog } from '../primitives/ConfirmDialog';
import type { Notify } from '../primitives/Toast';

const counted = (n: number, one: string, many: string) => `${n === 1 ? 'one' : n.toLocaleString()} ${n === 1 ? one : many}`;

/** The toast after Delete Story Bible data: what the host says it deleted, or that there was nothing. */
export function deletedMessage({ entries, suggestions }: GuideDeleted): string {
  if (entries === 0 && suggestions === 0) return 'There were no Story Bible entries or scan suggestions to delete.';
  const parts = [entries > 0 && counted(entries, 'entry', 'entries'), suggestions > 0 && counted(suggestions, 'scan suggestion', 'scan suggestions')];
  return `Story Bible data deleted: ${parts.filter(Boolean).join(' and ')}.`;
}

/**
 * The confirm of More actions > Delete Story Bible data: names the project and counts what goes (the entries and the scan's suggestions the
 * page has read), says what stays and that there is no undo, and opens on Cancel. It stays open and busy until the host answers; a refusal
 * (a build or a scan is running) is a toast and the dialog stays, so Cancel is still the way out.
 */
export function DeleteStoryBibleDataDialog({
  projectName,
  entries,
  suggestions,
  notify,
  onDeleted,
  onClose,
}: {
  projectName?: string;
  entries: number;
  suggestions: number;
  notify: Notify;
  /** After the host deleted: the page reads its entries, types and suggestions again. */
  onDeleted: () => void;
  onClose: () => void;
}) {
  const api = useApi();
  const deleting = usePendingAction();
  const project = projectName ? `“${projectName}”` : 'this project';
  const goes = [counted(entries, 'entry', 'entries'), suggestions > 0 ? counted(suggestions, 'scan suggestion', 'scan suggestions') : undefined]
    .filter(Boolean)
    .join(' and ');
  const remove = () =>
    deleting.run('delete', async () => {
      try {
        const deleted = await api.guideDeleteAll();
        onClose();
        notify(deletedMessage(deleted));
        onDeleted();
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
