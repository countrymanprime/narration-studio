/**
 * The one-shot "this changed" highlight: the row, cell or entry an action changed is tinted with `--accent-soft` and settles to
 * nothing over `--motion-highlight` (styles.css `changed-highlight`). Put it on an element while its "changed" flag is set.
 * Under reduced motion (Windows, or `data-motion="reduce"`) the tint is static for as long as the flag is set and clears with it,
 * so the state still reads without movement. It never loops; it replaces Tailwind's `animate-pulse` (docs/design/design-system.md#motion).
 */
export const CHANGED_HIGHLIGHT = 'bg-[var(--accent-soft)] motion-ok:bg-transparent motion-ok:animate-changed-highlight';
