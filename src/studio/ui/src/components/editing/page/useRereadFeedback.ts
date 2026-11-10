import { useCallback, useEffect, useRef, useState } from 'react';
import { overlay } from '../../../overlay/overlayService';
import type { ChapterRead } from './chapterSource';

/** A read that has not come back by then is given up on, so the button is never pending for good. */
export const REREAD_GIVES_UP_MS = 30_000;
const MAX_NAME = 60;
/** A chapter name in a sentence: cut so a hostile or huge title cannot make the toast cover the header. */
const nameIn = (name: string): string => (name.length > MAX_NAME ? `${name.slice(0, MAX_NAME - 1)}…` : name);

/**
 * **Read again** with an answer. The press starts the read (`onReread`), the button shows it pending until the page's read changes, and when
 * the chapter still has no audio a toast says the saved project was read and has nothing new, so the press never looks like it did nothing.
 * A read that finds audio needs no toast: the note goes and the script fills.
 */
export function useRereadFeedback(read: ChapterRead, chapterName: string, onReread: () => void): { rereading: boolean; reread: () => void } {
  const [rereading, setRereading] = useState(false);
  const seen = useRef(read);
  useEffect(() => {
    if (read === seen.current) return;
    seen.current = read;
    if (!rereading) return;
    setRereading(false);
    if (read.audio.kind !== 'ready') overlay.toast(`Read ${nameIn(chapterName)} again from the saved project: there is still no audio in it.`);
  }, [read, rereading, chapterName]);
  // A read that never returns ends in a toast, not in a button pending for good.
  useEffect(() => {
    if (!rereading) return;
    const timer = setTimeout(() => {
      setRereading(false);
      overlay.toast('The saved project could not be read. Try again.', { tone: 'error' });
    }, REREAD_GIVES_UP_MS);
    return () => clearTimeout(timer);
  }, [rereading]);
  const reread = useCallback(() => {
    setRereading(true);
    onReread();
  }, [onReread]);
  return { rereading, reread };
}
