import { useEffect, useState, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';

/**
 * Draws `children` inside an element another component renders, found by `selector` under `root`: the script's scrolling box for the floating
 * toolbar, and a paragraph's row for what sits under the line (its takes chip and takes, its flag card, its ribbon). `ScriptDoc` and `Paragraph`
 * have no slot for these, so the page puts a host element of its own at the end of the found one and removes it again. `watch` is what makes the
 * found element change (the document), so the host is put back after a redraw.
 */
export function InHost({
  root,
  selector,
  className,
  name,
  watch,
  children,
}: {
  root: RefObject<HTMLElement | null>;
  selector: string;
  className?: string;
  /** Marks the host element (`data-page-host`), for a test or a style. */
  name: string;
  watch?: unknown;
  children: ReactNode;
}) {
  const [host, setHost] = useState<HTMLElement | null>(null);
  // A passive effect: a child's layout effect runs before the ref of the element around it is set.
  useEffect(() => {
    const target = root.current?.querySelector<HTMLElement>(selector);
    if (!target) {
      setHost(null);
      return;
    }
    const el = document.createElement('div');
    el.dataset.pageHost = name;
    if (className) el.className = className;
    target.appendChild(el);
    setHost(el);
    return () => {
      el.remove();
    };
  }, [root, selector, className, name, watch]);
  return host ? createPortal(children, host) : null;
}

/** The selector for a paragraph's row in the script. */
export const rowOf = (pid: string): string => `[data-script] [data-pid="${CSS.escape(pid)}"]`;
