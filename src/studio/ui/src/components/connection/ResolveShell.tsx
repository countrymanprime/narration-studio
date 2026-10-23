import type { ReactNode } from 'react';
import { Button } from '../primitives/Button';
import { Dialog } from '../primitives/Dialog';

export type ResolveAction = {
  label: string;
  onPress: () => void;
  pending?: boolean;
  /** Why the action is off; the button stays focusable and the reason is on the page, not only in a hint. */
  disabled?: boolean;
};

/**
 * The frame both resolve dialogs share: the header X is the way out (no Cancel), one primary action that fixes the problem and one
 * secondary (Check again). A press outside closes it too, since nothing here is lost by closing.
 */
export function ResolveShell({
  title,
  description,
  primary,
  secondary,
  onClose,
  returnFocus,
  children,
}: {
  title: string;
  description: string;
  primary: ResolveAction;
  secondary: ResolveAction;
  onClose: () => void;
  returnFocus?: () => HTMLElement | null;
  children: ReactNode;
}) {
  const button = (action: ResolveAction, variant: 'primary' | 'secondary') => (
    <Button
      variant={variant}
      pending={action.pending}
      {...(action.disabled ? { 'aria-disabled': true } : {})}
      onClick={action.disabled ? undefined : action.onPress}
    >
      {action.label}
    </Button>
  );
  return (
    <Dialog
      title={title}
      description={description}
      onClose={onClose}
      dismissOnOutsidePress
      returnFocus={returnFocus}
      actionsAlign="end"
      actions={
        <>
          {button(secondary, 'secondary')}
          {button(primary, 'primary')}
        </>
      }
    >
      <div className="mt-3 flex flex-col gap-3 text-sm">{children}</div>
    </Dialog>
  );
}
