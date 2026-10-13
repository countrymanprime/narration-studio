import { overlay } from '../../../overlay/overlayService';
import { ReportDialog, type ReportDialogProps } from './ReportDialog';

/** Opens the status report dialog through the overlay service, which owns its focus, stacking and Escape; the opener gets focus back on close. */
export function openReportDialog(props: Omit<ReportDialogProps, 'onClose'>): () => void {
  return overlay.open({
    kind: 'dialog',
    dismissOnOutsidePress: true,
    title: 'Export status report',
    render: ({ close }) => <ReportDialog {...props} onClose={close} />,
  });
}
