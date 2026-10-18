/**
 * Elements that already own a keystroke before any command sees it (docs/architecture/studio-shell-and-registries.md, moved here from
 * `useFollowCursor.ts`): a field, a widget Space activates, or an ARIA role whose arrow keys move a
 * selection or a value rather than the page. `useFollowCursor.ts` re-exports these three so `isScrollKey` and its
 * tests keep working unchanged.
 */
export const EDITABLE = 'input, textarea, select, [contenteditable]:not([contenteditable="false"])';
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
  if (target.closest(EDITABLE) || target.closest(SPACE_ACTIVATES)) return true;
  return ownsKeysByRole(target);
}

/**
 * A popup that owns the keyboard while it shows: a popover, a menu, a list of choices, a dialog or an alert dialog (a Base UI
 * popover's popup is a `dialog`). A tooltip is not one: it is a read-only note and never takes the keys.
 */
const KEY_LAYER = '[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"], [data-popover-popup]';

/** Whether a popup that owns the keyboard is on screen (not hidden, inert or aria-hidden). */
export function keyLayerOpen(root: ParentNode = document): boolean {
  return Array.from(root.querySelectorAll(KEY_LAYER)).some((layer) => !layer.closest('[hidden], [inert], [aria-hidden="true"]'));
}

const HIDDEN = '[hidden], [inert], [aria-hidden="true"]';
const SOFT_LAYER = '[role="menu"], [data-popover-popup]';
const MODAL_LAYER = '[role="alertdialog"], [role="dialog"]:not([data-popover-popup])';

/** Whether a menu or popover (a popup the page behind stays usable under, closed by Escape) is on screen. */
export function softLayerOpen(root: ParentNode = document): boolean {
  return Array.from(root.querySelectorAll(SOFT_LAYER)).some((layer) => !layer.closest(HIDDEN));
}

/** Whether a dialog or an alert dialog, a question the narrator has to answer, is on screen. */
export function modalLayerOpen(root: ParentNode = document): boolean {
  return Array.from(root.querySelectorAll(MODAL_LAYER)).some((layer) => !layer.closest(HIDDEN));
}

const TEXT_INPUT_TYPES = new Set(['text', 'search', 'email', 'url', 'tel', 'password']);

/** Whether the element takes typed text, so a Space on it is a space in the text. A select, a slider, a checkbox or a button does not. */
export function takesTypedText(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target instanceof HTMLTextAreaElement) return true;
  if (target instanceof HTMLInputElement) return TEXT_INPUT_TYPES.has(target.type);
  return target.isContentEditable || target.closest('[contenteditable]:not([contenteditable="false"])') !== null;
}
