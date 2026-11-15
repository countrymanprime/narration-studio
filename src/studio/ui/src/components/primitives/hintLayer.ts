// Every hint popup (a tooltip, or the popup behind an info icon) carries this attribute, so a dialog can tell that Escape
// is meant for the hint that is showing and not for the dialog it sits in.
export const HINT_POPUP_ATTRIBUTE = 'data-hint-popup';
const HINT_POPUP_SELECTOR = `[${HINT_POPUP_ATTRIBUTE}]`;

// The control each tooltip belongs to, so a dialog can tell whose Escape it is: a tooltip left over from the control that opened the dialog (it stays in the page for a
// moment after focus moves away: the opener's blur starts a zero-delay timer that closes it and it leaves the page a little later: about 25 ms at normal speed, longer on a slow machine, #3509) is behind the dialog and
// does not take the dialog's Escape; one on a control inside the dialog does (#3500).
const hintHosts = new WeakMap<Element, Element>();
export function rememberHintHost(popup: Element | null, host: Element | null): void {
  if (popup && host) hintHosts.set(popup, host);
}

/** Whether a hint showing now is the one Escape is meant for inside `dialog`: a hint on something inside it, or one whose owner is not known. */
export function hintOwnsEscape(dialog: Element | null): boolean {
  for (const popup of document.querySelectorAll(HINT_POPUP_SELECTOR)) {
    const host = hintHosts.get(popup);
    if (!host || !dialog || dialog.contains(host)) return true;
  }
  return false;
}

// Everything a hint looks like: one place, so a tooltip and an info-icon popup cannot drift apart.
export const HINT_POPUP_CLASSES =
  'w-max max-w-60 motion-ok:animate-[tooltip-in_var(--motion-fast)_var(--ease-enter)] rounded-[0.4rem] bg-[var(--text)] px-[0.65rem] py-2 text-[0.78rem] leading-[1.35] text-[var(--bg)] shadow-[var(--shadow-lg)]';
