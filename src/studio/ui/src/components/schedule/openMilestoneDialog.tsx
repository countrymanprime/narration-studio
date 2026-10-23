import { overlay } from '../../overlay/overlayService';
import { MilestoneDialog, type MilestoneDialogProps } from './MilestoneDialog';

/** Opens the milestone dialog through the overlay service, which owns its focus, stacking and Escape. A save that succeeds closes it. */
export function openMilestoneDialog({ onSave, ...props }: Omit<MilestoneDialogProps, 'onCancel'>): () => void {
  return overlay.open({
    kind: 'dialog',
    dismissOnOutsidePress: false,
    title: props.existing ? 'Edit milestone' : 'Add milestone',
    render: ({ close }) => (
      <MilestoneDialog
        {...props}
        onSave={async (draft) => {
          const problem = await onSave(draft);
          if (!problem) close();
          return problem;
        }}
        onCancel={close}
      />
    ),
  });
}
