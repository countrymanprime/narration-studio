import type { ReactNode } from 'react';
import { Button } from './Button';
import { Dialog } from './Dialog';
import { TooltipTarget } from './Tooltip';

// A third action (Discard & continue) needs both its label and its handler: a button without a name is unusable to a
// screen reader, so the type refuses one without the other.
type DangerAction = { danger?: undefined; dangerLabel?: undefined } | { danger: () => void; dangerLabel: string };

// A second, quieter way forward beside the confirm (the Story Bible asks to download a language model, and offers to build without one this
// once): the same rule, a label needs its handler.
type SecondaryAction = { secondary?: undefined; secondaryLabel?: undefined } | { secondary: () => void; secondaryLabel: string };

type ConfirmDialogProps = {
  title: string;
  // What the dialog asks. A string or richer content; it is the dialog's accessible description.
  body: ReactNode;
  confirmLabel: string;
  confirm: () => void;
  // 'danger' draws the confirm button red for an action that destroys data (D12: clear project data, remove a local
  // voice or model, delete an entry, merge and delete the source, replace and reset).
  confirmVariant?: 'primary' | 'danger';
  cancel: () => void;
  // The decline button's name when "Cancel" does not say what staying means ("Keep recording", the Booth's leave question).
  cancelLabel?: string;
  // false: Escape does not decline. For a confirm that has turned into a running download, where declining aborts the
  // download: the header button and Cancel stay as the deliberate ways out.
  escapeCancels?: boolean;
  // The confirmed action is running: the confirm button says so and ignores a press, and nothing else in the dialog can be pressed,
  // so the action cannot be confirmed twice or walked away from half done. The caller closes the dialog when the action ends.
  pending?: boolean;
  /** While set, the confirm waits for something the narrator must see first: it is off, this reason is its hint and, since a disabled
   * button cannot take focus, the name of its tab stop; a press sends nothing. Cancel still works. */
  confirmBlockedReason?: string;
  // Focus opens on the decline button, not the message: for a question whose safe answer is to stay (Keep recording).
  focusCancel?: boolean;
  // Closing leaves focus on <body> when that is where it was, rather than in the page's <main> (see `Dialog`).
  stayOnBody?: boolean;
  // Where focus goes on close when the button that opened the dialog is gone (the confirmed action removed it): see `Dialog`.
  returnFocus?: () => HTMLElement | null;
  children?: ReactNode;
} & DangerAction &
  SecondaryAction;

// Every confirm interrupts and needs an answer, so it is an alertdialog: Escape and Cancel decline, a press on the
// backdrop does nothing.
export function ConfirmDialog({
  title,
  body,
  confirmLabel,
  confirm,
  confirmVariant = 'primary',
  dangerLabel,
  danger,
  secondaryLabel,
  secondary,
  cancel,
  cancelLabel = 'Cancel',
  escapeCancels = true,
  pending = false,
  confirmBlockedReason,
  focusCancel = false,
  stayOnBody = false,
  returnFocus,
  children,
}: ConfirmDialogProps) {
  return (
    <Dialog
      title={title}
      variant="alert"
      dismissOnOutsidePress={false}
      onClose={pending ? undefined : cancel}
      escapeCloses={escapeCancels && !pending}
      stayOnBody={stayOnBody}
      returnFocus={returnFocus}
      description={body}
      actions={
        <>
          <Button variant="secondary" disabled={pending} onClick={cancel} autoFocus={focusCancel}>
            {cancelLabel}
          </Button>
          <div className="flex gap-2">
            {danger && (
              <Button variant="danger-solid" disabled={pending} onClick={danger}>
                {dangerLabel}
              </Button>
            )}
            {secondary && (
              <Button variant="secondary" disabled={pending} onClick={secondary}>
                {secondaryLabel}
              </Button>
            )}
            {/* A confirm that destroys data is the filled red, heavier than Cancel's outline (alignment audit R4SB-4, R3SB1-14). */}
            {confirmBlockedReason ? (
              <TooltipTarget text={confirmBlockedReason}>
                <Button variant={confirmVariant === 'danger' ? 'danger-solid' : 'primary'} disabled>
                  {confirmLabel}
                </Button>
              </TooltipTarget>
            ) : (
              <Button variant={confirmVariant === 'danger' ? 'danger-solid' : 'primary'} pending={pending} onClick={confirm}>
                {confirmLabel}
              </Button>
            )}
          </div>
        </>
      }
    >
      {children}
    </Dialog>
  );
}
