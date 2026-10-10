import { openModal } from './overlay'
import { Btn } from './primitives'

export interface ConfirmSpec {
  title: string
  body: string
  confirmLabel: string
  cancelLabel?: string
  /** Which button has the focus when the dialog opens. A destructive question starts on the safe answer. */
  focus?: 'confirm' | 'cancel'
  onConfirm: () => void
  /** The narrator said no, closed the dialog or pressed Escape. */
  onCancel?: () => void
}

/** A question with two answers. Escape and the cancel button are the same answer. */
export function confirmDialog(spec: ConfirmSpec): void {
  let answered = false
  openModal({
    label: spec.title,
    onClose: () => { if (!answered) spec.onCancel?.() },
    render: ({ close }) => (
      <>
        <div className="dh"><h2 style={{ fontSize: 24 }}>{spec.title}</h2></div>
        <div className="db"><p style={{ margin: 0 }}>{spec.body}</p></div>
        <div className="df">
          <Btn data-autofocus={spec.focus === 'cancel' ? '' : undefined} onClick={close}>{spec.cancelLabel ?? 'Cancel'}</Btn>
          <Btn className="primary" data-autofocus={spec.focus === 'confirm' ? '' : undefined} onClick={() => { answered = true; close(); spec.onConfirm() }}>{spec.confirmLabel}</Btn>
        </div>
      </>
    ),
  })
}
