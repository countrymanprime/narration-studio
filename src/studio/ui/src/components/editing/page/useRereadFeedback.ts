import { useCallback, useEffect, useRef, useState } from 'react';
import { overlay } from '../../../overlay/overlayService';
import type { ChapterRead } from './chapterSource';

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
    if (read.audio.kind !== 'ready') overlay.toast(`Read ${chapterName} again from the saved project: there is still no audio in it.`);
  }, [read, rereading, chapterName]);
  const reread = useCallback(() => {
    setRereading(true);
    onReread();
  }, [onReread]);
  return { rereading, reread };
}
