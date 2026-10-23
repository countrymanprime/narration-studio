// The paragraphs of every chapter the reader has asked for, as one lookup. The data layer reads a chapter at a time (`useParagraphs`),
// so each chapter wanted gets a reader component that holds that hook and reports what it read; the page keeps the results by chapter.
// A chapter is read once it is wanted and kept: the reader asks for the chapters it draws, and Find and the search sources look in
// every chapter read so far, as the mock's do over its loaded text.

import { memo, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { ManuscriptParagraph } from '../../../../api/contracts/manuscript';
import { useParagraphs } from '../data/useScriptData';

type Loaded = Readonly<Record<string, readonly ManuscriptParagraph[]>>;

const ChapterReader = memo(function ChapterReader({
  chapterId,
  onRead,
}: {
  chapterId: string;
  onRead: (id: string, list: readonly ManuscriptParagraph[]) => void;
}) {
  const { value } = useParagraphs(chapterId);
  useEffect(() => {
    if (value) onRead(chapterId, value);
  }, [chapterId, value, onRead]);
  return null;
});

export type LoadedParagraphs = {
  /** A chapter's paragraphs, or undefined until they are read. The array is the same until the text changes. */
  paragraphsOf: (chapterId: string) => readonly ManuscriptParagraph[] | undefined;
  /** Asks for a chapter's paragraphs. */
  want: (chapterId: string) => void;
  /** Every paragraph read so far, in chapter order. */
  all: readonly ManuscriptParagraph[];
  /** The readers to mount anywhere in the page. */
  readers: ReactNode;
};

export function useLoadedParagraphs(chapterOrder: readonly string[]): LoadedParagraphs {
  const [wanted, setWanted] = useState<readonly string[]>([]);
  const [loaded, setLoaded] = useState<Loaded>({});
  const want = useCallback((chapterId: string) => setWanted((list) => (list.includes(chapterId) ? list : [...list, chapterId])), []);
  const onRead = useCallback((id: string, list: readonly ManuscriptParagraph[]) => setLoaded((map) => (map[id] === list ? map : { ...map, [id]: list })), []);
  const paragraphsOf = useCallback((chapterId: string) => loaded[chapterId], [loaded]);
  const all = useMemo(() => chapterOrder.flatMap((id) => loaded[id] ?? []), [chapterOrder, loaded]);
  const readers = useMemo(() => wanted.map((id) => <ChapterReader key={id} chapterId={id} onRead={onRead} />), [wanted, onRead]);
  return { paragraphsOf, want, all, readers };
}
