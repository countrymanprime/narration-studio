import type { ManuscriptContentKind } from '../../api/contracts/manuscript';
import { ConfirmDialog } from '../primitives/ConfirmDialog';

/**
 * "Remove <chapter> from recording?" a reclassification, not
 * a delete (docs/design/design-system.md#base-ui-wrappers reserves the red confirm for destructive ones), so the confirm button stays the ordinary primary
 * colour. A chapter is removed as `reference` ("not a chapter", a part title, an epigraph or a false split); there is no other kind to choose.
 */
export function RemoveFromRecordingDialog({
  chapterTitle,
  busy,
  onConfirm,
  onCancel,
}: {
  chapterTitle: string;
  busy: boolean;
  onConfirm: (kind: ManuscriptContentKind) => void;
  onCancel: () => void;
}) {
  return (
    <ConfirmDialog
      title={`Remove ${chapterTitle} from recording?`}
      body={
        <p>
          It leaves the chapter table, totals, the reader and the teleprompter. Its text stays in the manuscript, and its track link is cleared. You can restore
          it below the table.
        </p>
      }
      confirmLabel="Remove from recording"
      confirm={() => onConfirm('reference')}
      cancel={onCancel}
      pending={busy}
    />
  );
}
