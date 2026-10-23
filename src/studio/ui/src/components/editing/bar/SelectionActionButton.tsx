import type { ReactNode } from 'react';
import type { IconName } from '../../../icons.catalog';
import { Icon } from '../../primitives/Icon';
import { IconButton } from '../../primitives/IconButton';
import { TooltipTarget } from '../../primitives/Tooltip';

/**
 * The button a selection action draws. With a `reason` it is disabled but stays focusable, and the reason is its hint and its description (the
 * mock's rule: a control the DAW cannot do stays, with its own reason), so a slice never hides an action the narrator might look for.
 */
export function SelectionActionButton({
  icon,
  label,
  hint,
  reason,
  onClick,
  children,
}: {
  icon?: IconName;
  label: string;
  /** What the hint says when the action is available, e.g. "Mute, keep the audio (M)". */
  hint?: string;
  reason?: string;
  onClick: (element: HTMLElement) => void;
  /** Replaces the icon, e.g. the scissors with the word "Delete" beside it. */
  children?: ReactNode;
}) {
  const text = reason ? `${hint ?? label} — ${reason}` : (hint ?? label);
  return (
    <TooltipTarget text={text}>
      <IconButton label={label} aria-description={reason ? text : undefined} disabledReason={reason} onClick={(event) => onClick(event.currentTarget)}>
        {children ?? (icon ? <Icon name={icon} /> : null)}
      </IconButton>
    </TooltipTarget>
  );
}
