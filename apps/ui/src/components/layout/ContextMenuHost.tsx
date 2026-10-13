import { useRef, useState } from 'react';
import type { MouseEvent, ReactNode } from 'react';
import { ContextMenu, type ContextMenuItem } from '../primitives/ContextMenu';
import { contextItemsFor, contextTailFor } from '../../registries/context';

// Elements whose own menu (cut, copy, paste, spelling) the user needs; the host leaves them to the browser.
const TEXT_FIELDS = 'input,textarea,select,[contenteditable]:not([contenteditable="false"])';

// Base UI hands its handlers an event that can switch off the library's own handling of it.
type SwitchableEvent = MouseEvent & { preventBaseUIHandler?: () => void };

/**
 * The one context menu of the shell: wraps the content of `<main>` in the `ContextMenu` primitive and fills it from the
 * registered providers when it opens (ADR 0780 decision 5). The first provider that matches the target supplies the items,
 * then `tail` follows (unless the provider opts out with `tail: false`, as a picker does); with no provider, `fallback` (the shell's empty-space menu) answers; with neither the browser's menu
 * is left alone, as it always is in a text field. The Menu key and Shift+F10 reach it as a `contextmenu` event on the
 * focused element, so it binds no key and listens to nothing on `document`.
 */
export function ContextMenuHost({
  tail = [],
  fallback,
  className,
  children,
}: {
  tail?: ContextMenuItem[];
  fallback?: (target: Element) => ContextMenuItem[];
  className?: string;
  children: ReactNode;
}) {
  const [items, setItems] = useState<ContextMenuItem[]>([]);
  const reposting = useRef(false);

  // Keeps the primitive's own handler, and the browser's menu, out of it.
  const leaveToBrowser = (event: SwitchableEvent) => {
    event.preventBaseUIHandler?.();
    // The primitive also stops every contextmenu inside the area at `document`; ending the event here keeps that from happening.
    event.nativeEvent.stopPropagation();
  };

  const onOpen = (event: MouseEvent) => {
    const area = event.currentTarget as HTMLElement;
    const hit = event.target;
    if (!(hit instanceof Element) || !area.contains(hit) || hit.closest(TEXT_FIELDS)) {
      leaveToBrowser(event);
      return;
    }

    // From the keyboard the event carries no pointer position, so open at the box of the focused element, or of the
    // descendant it names, by sending the same event again from there with that position.
    if (!reposting.current && event.button === 0 && !event.ctrlKey) {
      const focused = document.activeElement;
      if (focused instanceof Element && area.contains(focused) && !focused.closest(TEXT_FIELDS)) {
        const descendantId = focused.getAttribute('aria-activedescendant');
        const anchor = (descendantId && document.getElementById(descendantId)) || focused;
        const box = anchor.getBoundingClientRect();
        leaveToBrowser(event);
        reposting.current = true;
        try {
          // The copy is prevented only when a menu opened for it, so the browser's menu still shows when nothing matched.
          const opened = !anchor.dispatchEvent(
            new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2, clientX: box.left, clientY: box.bottom }),
          );
          if (opened) event.preventDefault();
        } finally {
          reposting.current = false;
        }
        return;
      }
    }

    const provided = contextItemsFor(hit);
    const matched = provided ?? fallback?.(hit);
    const next = matched ? [...matched, ...(provided && !contextTailFor(hit) ? [] : tail)] : [];
    if (next.length === 0) {
      leaveToBrowser(event);
      return;
    }
    setItems(next);
  };

  return (
    <ContextMenu items={items} onOpen={onOpen} className={className}>
      {children}
    </ContextMenu>
  );
}
