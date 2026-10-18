import { useEffect, useRef } from 'react';
import { overlay } from '../../../overlay/overlayService';
import { useEditingPage } from './EditingPageState';
import { announceSel, announceWord } from './announce';

/** How long the cursor and selection must hold still before they are spoken, so a held arrow key says where it stopped, not every word it passed. */
export const ANNOUNCE_SETTLE_MS = 250;

/**
 * Says the word the cursor is on, or the selection, through the overlay's polite announcer once the cursor and selection have settled. Every
 * move restarts the wait, so a repeating key speaks once, at the end. A flag card says its own label, so a move onto a flagged word is left to it.
 * Escape that lets a selection go says so. The mock announces selections only (`announceSel`); a plain move is spoken here because a narrator
 * on a screen reader has nothing else to say where the cursor is.
 */
export function useAnnounceCursor(): void {
  const { doc, state } = useEditingPage();
  const { cursor, sel, flag } = state;
  const latest = useRef(doc);
  const before = useRef<{ cursor: string | null; sel: typeof sel } | null>(null);
  useEffect(() => {
    latest.current = doc;
  });

  useEffect(() => {
    const was = before.current;
    before.current = { cursor, sel };
    if (was === null || flag) return;
    const message = sel ? announceSel(latest.current, sel) : was.sel && was.cursor === cursor ? 'Selection cleared' : announceWord(latest.current, cursor);
    if (!message) return;
    const timer = setTimeout(() => overlay.announce(message), ANNOUNCE_SETTLE_MS);
    return () => clearTimeout(timer);
  }, [cursor, sel, flag]);
}
