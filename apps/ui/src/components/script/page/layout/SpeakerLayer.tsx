// Where the speaker picker (SN-B762) opens: under the speaker chip that was pressed, kept on screen, closed by Escape (the picker's own),
// a choice, or a press anywhere else. Focus goes back to the chip when it closes.

import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

const EDGE = 8;
const GAP = 6;

export function SpeakerLayer({ anchor, onClose, children }: { anchor: DOMRect; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const opener = useRef(document.activeElement);
  const close = useRef(onClose);
  close.current = onClose;

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const width = el.getBoundingClientRect().width;
    el.style.left = `${Math.max(EDGE, Math.min(anchor.left, document.documentElement.clientWidth - width - EDGE))}px`;
    el.style.top = `${anchor.bottom + GAP}px`;
  }, [anchor]);

  useEffect(() => {
    const away = (event: MouseEvent) => {
      if (event.target instanceof Node && !ref.current?.contains(event.target)) close.current();
    };
    document.addEventListener('mousedown', away);
    const back = opener.current;
    return () => {
      document.removeEventListener('mousedown', away);
      if (back instanceof HTMLElement && back.isConnected) back.focus();
    };
  }, []);

  return createPortal(
    <div
      ref={ref}
      role="dialog"
      aria-label="Who says this"
      className="fixed z-50 rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] p-2 shadow-[var(--shadow-lg)]"
    >
      {children}
    </div>,
    document.body,
  );
}
