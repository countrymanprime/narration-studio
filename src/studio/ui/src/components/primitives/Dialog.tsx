/** Focuses the first of these that takes it: a disabled control, or one that left the page, does not, and focus must not fall to <body> for want of one. */
function focusFirst(targets: readonly (HTMLElement | null | undefined)[]): void {
  for (const target of targets) {
    if (!target?.isConnected) continue;
    target.focus({ preventScroll: true });
    if (document.activeElement === target) return;
  }
}

import { countDialogOpen, markDialogClosed, rememberClosedTarget } from './dialogClosed';
import { ECHO_WINDOW_MS } from './echoGuard';
import { AlertDialog } from '@base-ui/react/alert-dialog';
import { Dialog as BaseDialog } from '@base-ui/react/dialog';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faXmark } from '@fortawesome/free-solid-svg-icons';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { HINT_POPUP_SELECTOR } from './hintLayer';
import { IconButton } from './IconButton';
import { OVERLAY_TITLE_CLASS } from './panelStyles';
import { POPOVER_POPUP_SELECTOR } from './Popover';
import { routeTabAcrossToasts, useToastsClearOfModal } from './Toast';

// Portals attach in the order the layers opened, so a modal later in the document is above this one.
function hasModalAbove(popup: HTMLElement): boolean {
  return Array.from(document.querySelectorAll('[role="dialog"], [role="alertdialog"]')).some(
    (other) => other !== popup && !popup.contains(other) && Boolean(popup.compareDocumentPosition(other) & Node.DOCUMENT_POSITION_FOLLOWING),
  );
}

type DialogProps = {
  title: string;
  // Shows the header Close button and lets Escape close the dialog.
  onClose?: () => void;
  // Escape only, for a dialog whose header has no Close button (WorkDialog closes from its action row once the job ends).
  onEscape?: () => void;
  // false: Escape is ignored even though there is an `onClose`. For a dialog whose close would abort work in flight (a
  // running download): the header button and Cancel are the deliberate ways out, a stray key is not.
  escapeCloses?: boolean;
  // The width, from one scale (DIALOG_WIDTHS), never wider than the window less 1rem a side, and at most 80dvh tall (less where that would reach within 4.75rem of the bottom edge): 'confirm' (a question
  // and its answers, the default for an alert), 'form' (a few fields, the default otherwise), 'palette' (the jump menu), 'wide' (a table
  // or a list of rows with controls). 'full' fills the viewport with a fixed 1rem margin on every side and scrolls its body, for a surface
  // that needs the whole window (the teleprompter reading modal). Modality (focus trap, Escape, initial focus, hidden siblings) is
  // unchanged by size: every size is the one shell docs/design/design-system.md#base-ui-wrappers describes.
  size?: DialogSize;
  // 'top' (the default): the popup hangs from the top of the window, 8vh down as the research mock's `.scrim` places every dialog, 12vh for
  // `palette` (the jump menu), so a dialog whose content grows or shrinks between states (a preview, then a result) keeps its title and Close
  // where they were (alignment audit ENX-16). 'center' centres it in the window. A full-size dialog fills the window either way.
  placement?: 'center' | 'top';
  // Draws no header row and no Close button, for a surface whose first row is its own field (the jump menu, D98). The title
  // still names the dialog, visually hidden; Escape closes through `onClose` or `onEscape`. The body has no padding.
  headerless?: boolean;
  // false: the body does not scroll and is a column the content lays out itself, so a dialog with one long list can scroll just that list (the
  // manuscript import review). Default true: the body scrolls when its content is tall.
  bodyScroll?: boolean;
  // Whether a press on the backdrop (or anywhere outside the popup) calls `onClose`. Required, so each dialog decides (issue 1706):
  // true for reference or transient surfaces with nothing to lose (the shortcut sheet, a detail view, a picker that applies each
  // choice at once, the jump menu); false for a confirm, a form with input, or a job, where a stray click must not discard
  // anything. A dialog with no `onClose` (work in flight) never dismisses either way.
  dismissOnOutsidePress: boolean;
  // null when there is nothing to press (a running job that cannot be cancelled): no empty action row is drawn.
  actions: ReactNode;
  // 'between': the first action at the left (a Cancel or a secondary way out), the rest at the right; a lone action sits at the right
  // either way. 'end': every action at the right.
  actionsAlign?: 'between' | 'end';
  // A region between the body and `actions` that never scrolls with it: the read-aloud dialog's
  // control bar, kept visible in every scroll position. Absent, most dialogs draw nothing here. Unlike `actions` it has no padding or alignment opinion of its own - a toolbar lays out its own row.
  footer?: ReactNode;
  // Where focus returns on close when the element that had it at open is gone (the menu item that ran, then closed). Absent: the page's <main>.
  returnFocus?: () => HTMLElement | null;
  // True: when the element that had focus is gone or was <body>, leave focus there on close instead of moving it into the page's <main>. For a question
  // that interrupts a page where a stray Enter on the first control would do harm (the Booth's "Stop recording?").
  stayOnBody?: boolean;
  /** Enter and Space do nothing in the dialog while this is true (a press that reaches a button is not taken): for a question whose first moments must not be answered by the second press of a double press. */
  holdEnter?: boolean;
  children: ReactNode;
} & (
  | { variant?: 'dialog'; description?: ReactNode }
  // 'alert' is an alertdialog: it interrupts and wants an answer (every ConfirmDialog). What it asks is what
  // `aria-describedby` points at, so an alert without a description is refused at the type level.
  | { variant: 'alert'; description: ReactNode }
);

export type DialogSize = 'confirm' | 'form' | 'palette' | 'wide' | 'full';

// The width scale (alignment audit cause B: every dialog was 70vw, so a one-line confirm was 1,006 px wide at 1440 and 271 px at 390).
// The popup is `w-full` inside a viewport padded 1rem a side, so a width also never exceeds the window less 2rem.
export const DIALOG_WIDTHS: Record<Exclude<DialogSize, 'full'>, string> = {
  confirm: 'max-w-[28rem]',
  form: 'max-w-[36rem]',
  palette: 'max-w-[40rem]',
  wide: 'max-w-[56rem]',
};

// The popup hangs 8vh down (12vh for the palette), so this leaves at least 4.75rem under it for a toast (`ToastRegion`).
const DIALOG_MAX_HEIGHT = 'min(80dvh, calc(92dvh - 4.75rem))';

// The one horizontal inset of the header, the body and the action row.
const INSET = 'px-[var(--space-6)]';

// An empty description (a job message that has not arrived yet) would leave `aria-describedby` pointing at nothing, and an
// empty `actions` would draw a padded blank row under the body.
const hasContent = (node: ReactNode): boolean => node !== undefined && node !== null && node !== false && node !== '';

// The control a dialog was opened from, remembered for a moment as it goes away: the same dialog opened again straight after (Ctrl+K, Escape, Ctrl+K in quick
// succession) finds focus on nothing, since the first has not handed it back yet, and would take the page for its opener (#3416). Only the same dialog
// (its title): another dialog opened from the page, a page-wide key's or a confirm that stays on <body>, has no business returning to this opener.
const RECENT_OPENER_MS = 600;
let recentOpener: { element: HTMLElement; at: number; title: string } | null = null;
function openerAtMount(title: string): HTMLElement | null {
  const active = document.activeElement;
  const nowhere = !(active instanceof HTMLElement) || active === document.body;
  if (nowhere && recentOpener && recentOpener.title === title && Date.now() - recentOpener.at < RECENT_OPENER_MS && recentOpener.element.isConnected)
    return recentOpener.element;
  return active instanceof HTMLElement ? active : null;
}

// The one modal shell. Base UI supplies the behaviour: the page behind is hidden from
// assistive technology and unreachable by Tab, Tab loops inside, focus moves in on open and comes back on close. This
// wrapper owns the policy on top of it:
// - Escape closes a dialog that has somewhere to go (`onClose`, or `onEscape` when there is no header button) and is
//   ignored otherwise or when `escapeCloses` is false, so work in flight is never dismissed by a stray key.
// - A press on the backdrop closes it only when the dialog says so with `dismissOnOutsidePress` (a reference sheet, a picker, the jump
//   menu); a confirm, a form or a job says false, so an accidental click on the scrim cannot discard it.
// - Focus lands on the body region (so a screen reader reads the message first) unless a child asked for focus with
//   `autoFocus`, and returns to the element that opened the dialog, or into the page's <main> when that is gone.
// Dialogs are mounted conditionally (`{open && <Dialog />}`), so `open` is always true here and the parent's unmount is
// the close; no exit animation exists to wait for.

export function Dialog({
  title,
  onClose,
  onEscape,
  escapeCloses = true,
  description,
  variant = 'dialog',
  size,
  placement,
  headerless = false,
  bodyScroll = true,
  dismissOnOutsidePress,
  actions,
  actionsAlign = 'between',
  footer,
  returnFocus,
  stayOnBody = false,
  holdEnter = false,
  children,
}: DialogProps) {
  // Both families share their parts; typing them as one keeps the wrapper a single shell.
  const Parts = (variant === 'alert' ? AlertDialog : BaseDialog) as typeof BaseDialog;
  const popupRef = useRef<HTMLDivElement>(null);
  // Whether this dialog opened holding Enter and Space back, and which of them were pressed down inside the hold (see the popup's key handlers).
  const [openedHolding] = useState(holdEnter);
  const begunInHold = useRef(new Set<string>());
  useEffect(() => {
    const forget = () => begunInHold.current.clear();
    window.addEventListener('blur', forget);
    return () => window.removeEventListener('blur', forget);
  }, []);
  const openedAt = useRef(Date.now());
  const bodyRef = useRef<HTMLDivElement>(null);
  // What had focus when the dialog mounted: the button that opened it.
  const [opener] = useState(() => openerAtMount(title));
  const dismiss = escapeCloses ? (onClose ?? onEscape) : undefined;
  const width = size ?? (variant === 'alert' ? 'confirm' : 'form');
  const top = (placement ?? 'top') === 'top';
  // Toasts keep to the window's bottom-right corner while a dialog is open, under its action row, rather than rising above the page's bottom bars.
  // A full-size dialog covers that corner whatever the toast does, and the jump menu has no action row.
  useToastsClearOfModal(width !== 'full' && width !== 'palette');

  const initialFocus = () => {
    const focused = document.activeElement;
    // An `autoFocus` child has already taken focus by now; leave it there.
    if (focused instanceof HTMLElement && focused !== popupRef.current && popupRef.current?.contains(focused)) return focused;
    return bodyRef.current;
  };
  // A scrolling body keeps a stable gutter for its bar (styles.css), so its content ends that much short of the header's and the action row's;
  // they keep the same gutter, so Close, the body's controls and the last action share one right edge (alignment audit XSC-36).
  const edgeGutter = bodyScroll ? 'overflow-hidden [scrollbar-gutter:stable]' : '';
  // Whether Base UI handed focus back as the dialog closed; when the dialog goes with its parent instead, this stays false (see the cleanup below).
  const handedBack = useRef(false);
  const latest = useRef({ returnFocus, stayOnBody, title });
  latest.current = { returnFocus, stayOnBody, title };
  useEffect(() => countDialogOpen(), []);
  // The slide-over behind this dialog ignores the second press of a double click on one of its buttons, and one opened as this closes returns focus to
  // where this dialog would have (dialogClosed.ts).
  useEffect(
    () => () => {
      markDialogClosed();
      rememberClosedTarget(() => {
        if (opener && opener !== document.body && opener.isConnected && opener.tagName !== 'MAIN') return opener;
        return latest.current.returnFocus?.() ?? null;
      });
    },
    [opener],
  );
  // A dialog that is removed together with the thing around it (a link made takes away the notice that opened its dialog, chip and all) never gets its
  // close hand-back, and focus would fall to <body>. Hand it back the same way, a tick later, only when focus is on nothing.
  useEffect(
    () => () => {
      if (opener && opener !== document.body && opener.isConnected) recentOpener = { element: opener, at: Date.now(), title: latest.current.title };
      if (handedBack.current) return;
      window.setTimeout(() => {
        const active = document.activeElement;
        if (active && active !== document.body && active.isConnected) return;
        if (latest.current.stayOnBody && (!opener || opener === document.body)) return;
        const named = latest.current.returnFocus?.();
        const useOpener = opener?.isConnected && opener !== document.body && !(opener.tagName === 'MAIN' && named?.isConnected);
        focusFirst([useOpener ? opener : named, document.querySelector<HTMLElement>('main')]);
      }, 0);
    },
    [opener],
  );
  const finalFocus = () => {
    handedBack.current = true;
    const named = returnFocus?.();
    // The action that closed this dialog already moved focus to its destination (a jump menu result focuses what it went to): leave it there.
    const now = document.activeElement;
    const landmark = now instanceof HTMLElement && now.tagName === 'MAIN' && named?.isConnected;
    if (now instanceof HTMLElement && now !== document.body && !landmark && !popupRef.current?.contains(now) && !now.closest('[data-base-ui-focus-guard]'))
      return false;
    let target: HTMLElement | null;
    // A dialog that opened by itself had the page's landmark for an opener, which is nowhere a narrator was: the page's own named opener wins over it.
    if (opener?.isConnected && opener !== document.body && !(opener.tagName === 'MAIN' && named?.isConnected)) target = opener;
    else if (stayOnBody && (!opener || opener === document.body)) return false;
    else {
      // The opener is gone (the click removed it, or one dialog replaced another): where the opener says, then the landmark. <main> is focusable
      // (tabIndex -1) but not tabbable, so handed to Base UI it would pick its first tabbable, the header's project button (#2902): focus it here.
      target = named?.isConnected ? named : document.querySelector<HTMLElement>('main');
    }
    if (!target) return true;
    const back = target;
    // Focus is handed back here, a tick after the popup has gone, not by Base UI at unmount: the action that closed the dialog may move focus
    // in an effect after that (the Script reader focuses the chapter's heading), and a hand-back that came later would take it away (#2902).
    // Only focus that is on nothing (the body, or the removed popup) is handed back; focus on anything else, another dialog included, stays.
    window.setTimeout(() => {
      const active = document.activeElement;
      const nowhere =
        !active || active === document.body || !active.isConnected || popupRef.current?.contains(active) || (landmark && active.tagName === 'MAIN');
      // The page may have drawn its landmark again meanwhile, or the opener may be a control that is off now (the Booth's Record before a link is made):
      // <main> is the last stop, so focus does not fall to <body>.
      if (nowhere) focusFirst([back, document.querySelector<HTMLElement>('main')]);
    }, 0);
    return false;
  };

  return (
    <Parts.Root
      open
      disablePointerDismissal={!dismissOnOutsidePress}
      onOpenChange={(_open, details) => {
        if (details.reason === 'outside-press') {
          // The second click of a double click on whatever opened this dialog lands on the backdrop: it is not a dismissal.
          if (Date.now() - openedAt.current < ECHO_WINDOW_MS) return;
          if (onClose) onClose();
          return;
        }
        if (details.reason !== 'escape-key') return;
        // Another modal opened above this one: Escape is its to answer, even while focus has not yet moved into it (the key
        // then lands in this dialog first, and Base UI would stop it here and close the layer underneath).
        if (popupRef.current && hasModalAbove(popupRef.current)) {
          details.cancel();
          details.allowPropagation();
          return;
        }
        // Escape belongs to a hint or a Popover that is showing (a tooltip, a device picker, a settings panel inside the
        // dialog), and to a handler that already took it.
        if (!dismiss || details.event.defaultPrevented || document.querySelector(HINT_POPUP_SELECTOR) || document.querySelector(POPOVER_POPUP_SELECTOR))
          details.cancel();
        else dismiss();
      }}
    >
      <Parts.Portal>
        {/* forceRender: Base UI leaves out the backdrop of a dialog opened inside another dialog or a SlideOver (a Drawer), which
            left the page undimmed behind a confirm opened from a panel (chapter-track-link-control/06 draws it dimmed). */}
        <Parts.Backdrop data-dialog-backdrop forceRender className="fixed inset-0 z-[var(--z-dialog)] bg-[var(--backdrop)]" />
        <Parts.Viewport
          // A press on the dim area around the popup (and on the backdrop under it) is a press on nothing that can take focus, so the browser would move focus to
          // <body> while the dialog stays open (a dialog that ignores outside presses) and the next Tab would start from the page behind it. Keep focus where it is.
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) event.preventDefault();
          }}
          className={`fixed inset-0 z-[var(--z-dialog)] flex justify-center p-4 [@media(max-height:400px)]:p-2 ${top && width !== 'full' ? `items-start ${width === 'palette' ? 'pt-[12vh]' : 'pt-[8vh]'}` : 'items-center'}`}
        >
          <Parts.Popup
            ref={popupRef}
            // Present while Enter and Space are held back (`holdEnter`): what a test waits on instead of a guessed delay. Not exposed to assistive technology.
            data-enter-held={holdEnter ? '' : undefined}
            initialFocus={initialFocus}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                // Held back while `holdEnter`. After it, an auto-repeat is never a press in a dialog that opened holding (a held Enter's repeat, ~500 ms in, would
                // answer a question nobody has read), while a fresh press of the same key is one, whether or not its earlier keyup ever arrived.
                if (holdEnter) begunInHold.current.add(event.key);
                else if (!event.repeat) begunInHold.current.delete(event.key);
                if (holdEnter || (openedHolding && event.repeat)) event.preventDefault();
              }
              routeTabAcrossToasts(event, popupRef.current);
            }}
            onKeyUp={(event) => {
              // A Space press completes on keyup in some engines: held too, so a press begun inside the window cannot answer after it.
              if (event.key === ' ' && (holdEnter || begunInHold.current.has(' '))) event.preventDefault();
              begunInHold.current.delete(event.key);
            }}
            // Focus leaving the popup altogether ends what the hold remembers: a keyup that went elsewhere never arrives here. Moving between its controls does not.
            onBlur={(event) => {
              if (!popupRef.current?.contains(event.relatedTarget as Node | null)) begunInHold.current.clear();
            }}
            finalFocus={finalFocus}
            className={`flex w-full flex-col overflow-hidden rounded-[var(--radius-card)] border focus:outline-none ${
              width === 'full' ? 'max-w-[calc(100vw-2rem)]' : DIALOG_WIDTHS[width]
            }`}
            style={{
              height: width === 'full' ? 'calc(100dvh - 2rem)' : undefined,
              // At most 80dvh, and ending at least 4.75rem above the window's bottom edge, the room a toast keeps there while a dialog is open.
              maxHeight: width === 'full' ? 'calc(100dvh - 2rem)' : DIALOG_MAX_HEIGHT,
              background: 'var(--surface)',
              borderColor: 'var(--line-strong)',
              boxShadow: 'var(--shadow-lg)',
            }}
          >
            {/* 59 px and a 1 px divider in every mock, with or without the Close button. */}
            {headerless ? (
              <Parts.Title className="sr-only">{title}</Parts.Title>
            ) : (
              <div
                className={`flex min-h-[3.75rem] flex-none items-center justify-between gap-3 border-b border-[var(--border)] ${INSET} ${edgeGutter} py-[0.85rem] [@media(max-height:400px)]:min-h-0 [@media(max-height:400px)]:py-2`}
              >
                <Parts.Title title={title} className={`flex-1 ${OVERLAY_TITLE_CLASS} [@media(max-height:400px)]:line-clamp-3`}>
                  {title}
                </Parts.Title>
                {onClose && (
                  <IconButton label="Close" onClick={onClose}>
                    <FontAwesomeIcon icon={faXmark} />
                  </IconButton>
                )}
              </div>
            )}
            {/* tabIndex: the body scrolls when content is tall, and a scrolling region must be reachable by keyboard. */}
            <div
              ref={bodyRef}
              tabIndex={bodyScroll ? 0 : undefined}
              className={`min-h-0 flex-1 overflow-x-hidden ${bodyScroll ? 'scroll-y-edges overflow-y-auto' : 'flex flex-col overflow-y-hidden'} ${headerless ? '' : INSET} break-words focus-visible:ring-2 focus-visible:ring-[var(--focus)] focus-visible:outline-none focus-visible:ring-inset`}
            >
              {/* The vertical padding is on this wrapper, not the scroll box, so a sticky table head (`TableHead sticky`) sticks at the body's
                  top edge, under the header's divider, and rows do not show above it (alignment audit ENX-23). A headerless body (the jump menu)
                  keeps 8 px under its last row, which touched the edge (XSL-16, R3SL-7). The scroll box shades the edge that has more beyond it
                  (`scroll-y-edges`), so a row cut by the action row reads as more to scroll (R3GL-3, R3EN2-13). */}
              <div
                data-dialog-content
                className={`${bodyScroll ? '' : 'flex min-h-0 flex-1 flex-col'} ${headerless ? 'pb-2' : 'py-[var(--space-6)] [@media(max-height:400px)]:py-2'}`}
              >
                {hasContent(description) && (
                  <Parts.Description render={typeof description === 'string' ? <p /> : <div />} className="mb-3 text-sm text-[var(--text-muted)] last:mb-0">
                    {description}
                  </Parts.Description>
                )}
                {children}
              </div>
            </div>
            {hasContent(footer) && (
              <div className="flex-none border-t" style={{ borderColor: 'var(--border)' }}>
                {footer}
              </div>
            )}
            {hasContent(actions) && (
              <div
                data-dialog-actions
                // The mocks' action row is 66 px under its divider (12 above a 38 px button, 16 below; the min-height counts the divider). Button is 32 px
                // so the row keeps the mocks' height and centres the buttons in the 38 px band. The actions wrap onto a second line rather than
                // squeezing their labels, and keep to the right; 'between' pushes the first of several to the left.
                className={`flex min-h-[4.1875rem] flex-none flex-wrap items-center justify-end gap-2 border-t ${INSET} ${edgeGutter} pt-3 pb-4 [@media(max-height:400px)]:min-h-0 [@media(max-height:400px)]:py-2 ${actionsAlign === 'between' ? '[&>:first-child:not(:only-child)]:mr-auto' : ''}`}
                style={{ borderColor: 'var(--border)' }}
              >
                {actions}
              </div>
            )}
          </Parts.Popup>
        </Parts.Viewport>
      </Parts.Portal>
    </Parts.Root>
  );
}
