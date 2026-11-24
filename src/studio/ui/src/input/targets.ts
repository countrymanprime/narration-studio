/**
 * Elements that already own a keystroke before any command sees it (docs/architecture/studio-shell-and-registries.md, moved here from
 * `useFollowCursor.ts`): a field, a widget Space activates, or an ARIA role whose arrow keys move a
 * selection or a value rather than the page. `useFollowCursor.ts` re-exports these three so `isScrollKey` and its
 * tests keep working unchanged.
 */
export const EDITABLE = 'input, textarea, select, [contenteditable]:not([contenteditable="false"])';
/** An element that scrolls its own content and keeps every plain key for that: the toast's text while it overflows (arrows, Page Up/Down, Home/End and Space scroll it; none reaches the page's commands). */
export const OWNS_KEYS = '[data-owns-keys]';
export const SPACE_ACTIVATES = 'button, a[href], summary, [role="button"], [role="checkbox"], [role="switch"]';
export const KEY_WIDGET_ROLES = new Set([
  'combobox',
  'grid',
  'listbox',
  'menu',
  'menuitem',
  'menuitemcheckbox',
  'menuitemradio',
  'option',
  'radio',
  'radiogroup',
  'slider',
  'spinbutton',
  'tab',
  'tablist',
  'textbox',
  'tree',
  'treeitem',
]);

/**
 * Whether the element's own role makes it a widget that keeps the keys. A read-only textbox holds no text to edit, so its arrows,
 * Delete and Space are the page's: the Editing script is one (`role="textbox" aria-readonly="true"`, so a screen reader reads it as text).
 */
export function ownsKeysByRole(element: Element): boolean {
  const role = element.getAttribute('role');
  if (!role || !KEY_WIDGET_ROLES.has(role)) return false;
  return !(role === 'textbox' && element.getAttribute('aria-readonly') === 'true');
}

/**
 * Whether a gesture's target already owns the key: a field, a widget Space activates, or a `KEY_WIDGET_ROLES` role.
 * The router (`router.tsx`) applies this only to a gesture with no modifier held (Solution Detail, "Router"); a
 * modified gesture like Alt+ArrowLeft reaches its command regardless of target, matching `App.tsx`'s nav shortcuts
 * today. This is the same check the old Booth control bar's `isWidgetTarget` and `useFollowCursor`'s `isScrollKey`
 * made by hand.
 */
export function isGuardedTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  if (target.closest(EDITABLE) || target.closest(SPACE_ACTIVATES) || target.closest(OWNS_KEYS)) return true;
  return ownsKeysByRole(target);
}

/**
 * A popup that owns the keyboard while it shows: a popover, a menu, a list of choices, a dialog or an alert dialog (a Base UI
 * popover's popup is a `dialog`). A tooltip is not one: it is a read-only note and never takes the keys.
 */
const KEY_LAYER = '[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"], [data-popover-popup]';

const HIDDEN = '[hidden], [inert], [aria-hidden="true"]';
// A Base UI popup stays in the page, marked `data-ending-style`, until its exit has run, and the exit waits for a frame (late on a loaded machine). The
// popup that closed on a key still owns that key (the pedal's Space closes it and must not also reach the page), but a key pressed after it has closed
// owns nothing: it belongs to the page, and focus is still on a control inside the popup until the popup is gone (#3906, #3931).
const CLOSING = '[data-ending-style]';
// What the live checks below skip: hidden, or already closing. The pedal's Space (usePedalSpace) and the router must agree on whether a popup is still there:
// the router reads what the key met when it began and ignores a closing popup, so a pedal that counted it would toggle the take and the router would too (#3976).
const GONE = `${HIDDEN}, ${CLOSING}`;

/** Whether a popup that owns the keyboard is on screen (not hidden, inert, aria-hidden or closing). */
export function keyLayerOpen(root: ParentNode = document): boolean {
  return Array.from(root.querySelectorAll(KEY_LAYER)).some((layer) => !layer.closest(GONE));
}

/** What a keydown met when it began, before anything it triggered could close a popup: whether a popup that has not begun closing owns the keys, and whether its target is inside one that has. */
export type KeyContext = { layerOpen: boolean; targetClosing: boolean };

const keyContexts = new WeakMap<Event, KeyContext>();
let watching = false;

/** Notes each keydown's `KeyContext` at the window's capture phase, ahead of every listener that could close a popup. Once; a no-op without a window. */
export function watchKeyContext(): void {
  if (watching || typeof window === 'undefined') return;
  watching = true;
  window.addEventListener(
    'keydown',
    (event) => {
      const target = event.target;
      const open = keyLayerOpen();
      keyContexts.set(event, { layerOpen: open, targetClosing: target instanceof Element && target.closest(CLOSING) !== null });
    },
    true,
  );
}

/** The `KeyContext` noted for a keydown, or undefined for one the watch did not see. */
export function keyContextOf(event: Event): KeyContext | undefined {
  return keyContexts.get(event);
}

const SOFT_LAYER = '[role="menu"], [data-popover-popup]';
const MODAL_LAYER = '[role="alertdialog"], [role="dialog"]:not([data-popover-popup])';

/** Whether a menu or popover (a popup the page behind stays usable under, closed by Escape) is on screen. */
export function softLayerOpen(root: ParentNode = document): boolean {
  return Array.from(root.querySelectorAll(SOFT_LAYER)).some((layer) => !layer.closest(GONE));
}

/** The topmost dialog or alert dialog on screen (not hidden, inert, aria-hidden or closing), or null. */
export function openModalLayer(root: ParentNode = document): HTMLElement | null {
  return (
    Array.from(root.querySelectorAll<HTMLElement>(MODAL_LAYER))
      .filter((layer) => !layer.closest(GONE))
      .pop() ?? null
  );
}

/** Whether a dialog or an alert dialog, a question the narrator has to answer, is on screen. */
export function modalLayerOpen(root: ParentNode = document): boolean {
  return openModalLayer(root) !== null;
}

const TEXT_INPUT_TYPES = new Set(['text', 'search', 'email', 'url', 'tel', 'password']);

/** Whether the element takes typed text, so a Space on it is a space in the text. A select, a slider, a checkbox or a button does not. */
export function takesTypedText(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target instanceof HTMLTextAreaElement) return true;
  if (target instanceof HTMLInputElement) return TEXT_INPUT_TYPES.has(target.type);
  return target.isContentEditable || target.closest('[contenteditable]:not([contenteditable="false"])') !== null;
}
