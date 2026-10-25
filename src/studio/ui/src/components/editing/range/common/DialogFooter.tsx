import { useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * The action row of the Editing page's dialogs (cut, add FX, replace, voice sample). The overlay service's dialog has no `actions` slot, so the
 * row is drawn at the foot of the scrolling body and kept there (sticky): the question never scrolls away and Cancel taking the focus never
 * moves it. It looks like `Dialog`'s own row and lays out the same way (`actionsAlign="between"`, as every `ConfirmDialog`): a rule, Cancel at
 * the left, the action at the right (alignment audit XED-19). While more of the body is below it, a shadow over its top edge says so, rather
 * than the row cutting a sentence with nothing to show it scrolls (R3ED-10, XED-20).
 */
/** The nearest ancestor that scrolls vertically: the dialog's body. */
function scroller(from: HTMLElement): HTMLElement | null {
  for (let el = from.parentElement; el; el = el.parentElement) {
    const overflow = getComputedStyle(el).overflowY;
    if (overflow === 'auto' || overflow === 'scroll') return el;
  }
  return null;
}

export function DialogFooter({ children }: { children: ReactNode }) {
  const row = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState(false);
  useEffect(() => {
    const body = row.current ? scroller(row.current) : null;
    if (!body) return;
    const measure = () => setMore(body.scrollHeight - body.scrollTop - body.clientHeight > 1);
    measure();
    body.addEventListener('scroll', measure, { passive: true });
    const resize = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    resize?.observe(body);
    if (body.firstElementChild) resize?.observe(body.firstElementChild);
    return () => {
      body.removeEventListener('scroll', measure);
      resize?.disconnect();
    };
  }, []);
  return (
    <div
      ref={row}
      data-dialog-footer
      data-more-below={more ? '' : undefined}
      className={`sticky bottom-[calc(-1*var(--space-6))] mx-[calc(-1*var(--space-6))] mb-[calc(-1*var(--space-6))] flex flex-wrap items-center justify-end gap-2 border-t border-[var(--border)] bg-[var(--surface)] px-[var(--space-6)] py-3 [&>:first-child:not(:only-child)]:mr-auto ${more ? 'shadow-[0_-0.5rem_0.75rem_-0.5rem_rgb(0_0_0/0.3)]' : ''}`}
    >
      {children}
    </div>
  );
}
