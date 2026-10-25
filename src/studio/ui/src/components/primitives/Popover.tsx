import { Popover as BasePopover } from '@base-ui/react/popover';
import { useRef, type ReactElement, type ReactNode } from 'react';
import { POPUP_MOTION_CLASSES } from './overlayMotion';

// A layer above a dialog carries this attribute on its popup, so Dialog.tsx's Escape handler can tell that a key is
// meant for the popover that is showing (device pickers, a settings panel) and not for the dialog it sits in - the
// same reasoning as a hint's HINT_POPUP_ATTRIBUTE (hintLayer.ts), for a popup with real, focusable content instead of
// a read-only hover note.
export const POPOVER_POPUP_ATTRIBUTE = 'data-popover-popup';
export const POPOVER_POPUP_SELECTOR = `[${POPOVER_POPUP_ATTRIBUTE}]`;

// An interactive popup over other content: a click opens it, focus moves into it, Escape closes it and returns focus to
// the trigger, and a press outside closes it too (the read-aloud dialog's microphone device list and Settings
// panel; docs/design/design-system.md#base-ui-wrappers wraps Base UI's Popover). Unlike the hint-style popup behind Tooltip's info icon (hover/focus,
// read-only, focus never moves in), this one is for a control a person operates. Sits above the dialog layer
// (--z-dialog-popover, between the dialog and a hint), so it works when opened from inside a full-size dialog.
export function Popover({
  trigger,
  label,
  side = 'bottom',
  // The mocks right-align a popover to its trigger (read-aloud-control-bar/03 and 04).
  align = 'end',
  open,
  defaultOpen,
  onOpenChange,
  fitToWindow = false,
  focusPopup = false,
  children,
}: {
  // The trigger's own element (a `Button`, an `IconButton`), the same `render` pattern as `Menu` and `TooltipTarget`.
  trigger: ReactElement;
  // The popup's accessible name (its content is often controls, not a sentence a `aria-describedby` could read).
  label: string;
  side?: 'top' | 'bottom' | 'left' | 'right';
  align?: 'start' | 'center' | 'end';
  // Uncontrolled by default (Base UI keeps the open state); pass both to control it (closing it once a session starts).
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  // Keep the popup inside the window, in the window's own bounds and even when its trigger has scrolled out of view or the window shrank under it:
  // a trigger in a scrolling panel (a dot in the Editing script) would otherwise leave the popup past the window's edge.
  fitToWindow?: boolean;
  // Open with focus on the popup itself rather than its first control, so a key pressed just after opening (Enter from a footswitch) presses
  // nothing inside: for a popup whose first control can take the narrator elsewhere. Tab still moves into the controls.
  focusPopup?: boolean;
  children: ReactNode;
}) {
  const popup = useRef<HTMLDivElement>(null);
  // The bars fixed along the bottom of the page (the Booth's footer and its setup notice) count as the window's edge: a popup opened above them
  // stops short of them and scrolls inside itself rather than covering Record and the timer (alignment audit XBO-8). Their height is the one the
  // toasts keep clear of, `--toast-clear` on <html> (useToastClearance).
  const bottomBars = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--toast-clear')) || 0;
  return (
    // Focus stays inside while it is open (Tab cycles, it never walks out to a page that would keep the popover up); the page behind stays clickable.
    <BasePopover.Root open={open} defaultOpen={defaultOpen} onOpenChange={onOpenChange} modal="trap-focus">
      <BasePopover.Trigger render={trigger} />
      <BasePopover.Portal>
        {/* Measured on read-aloud-control-bar/03 and 04: 12 px from the trigger, 16 px padding, radius 8, at least 336 px wide. */}
        <BasePopover.Positioner
          side={side}
          align={align}
          sideOffset={12}
          collisionPadding={{ top: 8, right: 8, left: 8, bottom: 8 + bottomBars }}
          collisionBoundary={fitToWindow ? document.documentElement : undefined}
          sticky={fitToWindow}
          className="z-[var(--z-dialog-popover)]"
        >
          <BasePopover.Popup
            ref={popup}
            initialFocus={focusPopup ? popup : undefined}
            aria-label={label}
            {...{ [POPOVER_POPUP_ATTRIBUTE]: '' }}
            className={`max-h-[var(--available-height)] w-max max-w-[calc(100vw-1rem)] min-w-[min(21rem,calc(100vw-1rem))] overflow-y-auto rounded-[var(--radius-card)] border border-[var(--line-strong)] bg-[var(--surface)] p-4 shadow-[var(--shadow-lg)] outline-none ${POPUP_MOTION_CLASSES}`}
          >
            {children}
          </BasePopover.Popup>
        </BasePopover.Positioner>
      </BasePopover.Portal>
    </BasePopover.Root>
  );
}
