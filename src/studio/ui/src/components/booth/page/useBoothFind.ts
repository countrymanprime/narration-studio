import { useCallback, useMemo, useRef, useState, type RefObject } from 'react';
import type { PageItem } from '../../../input/pageCommands';
import { useSearchSource } from '../../../registries/search';
import { manuscriptSource } from '../../script/page/registry/searchSources';
import { searchManuscript, type FindMatch } from '../../script/page/tools/find/searchManuscript';
import { wordCount, type ReadingParagraph, type WordDecoration } from '../reading/boothUnits';
import type { BrowseView } from '../reading/useBrowseView';

type Options = {
  /** The id the chapter's paragraphs are searched under. */
  chapterId: string;
  paragraphs: readonly ReadingParagraph[];
  recording: boolean;
  /** Moves the reading position to a word of a paragraph (the same move a click makes). */
  seek: (paragraphId: string, word: number) => void;
  /** Scrolls the text without moving the reading position. */
  view: RefObject<BrowseView | null>;
};

export type BoothFind = {
  /** The matches of the search showing, drawn in the text; none when no search shows. */
  decorations: readonly WordDecoration[];
  /** The jump menu's rows for the search showing (next, previous, clear); none when no search shows. */
  items: () => PageItem[];
};

/**
 * Find in the Booth's chapter, through the jump menu (Ctrl+F) with the Script's manuscript search, so a match is the same match. Choosing a
 * hit marks every match in the text and brings the chosen one into view. With no take running the reading position moves to it, as a click on
 * the word would; during a take the position belongs to the voice, so the view scrolls to it and the position stays (a click or a step brings
 * the text back to the reading, as after the wheel).
 */
export function useBoothFind({ chapterId, paragraphs, recording, seek, view }: Options): BoothFind {
  const [shown, setShown] = useState<{ term: string; index: number } | null>(null);
  const lines = useMemo(() => paragraphs.map((paragraph, index) => ({ chapterId, id: paragraph.id, index, text: paragraph.text })), [chapterId, paragraphs]);
  const matches = useMemo<FindMatch[]>(() => (shown ? searchManuscript(lines, shown.term) : []), [lines, shown]);

  const latest = useRef({ recording, seek, view, lines });
  latest.current = { recording, seek, view, lines };

  const go = useCallback((term: string, index: number) => {
    const now = latest.current;
    const found = searchManuscript(now.lines, term);
    const hit = found[index];
    if (!hit) return;
    setShown({ term, index });
    reveal(hit, now);
  }, []);

  const source = useMemo(
    () =>
      manuscriptSource({
        lines: () => latest.current.lines,
        locationOf: (match) => `¶ ${(latest.current.lines.find((line) => line.id === match.paragraphId)?.index ?? 0) + 1}`,
        onFind: go,
        group: 'In this chapter',
        showIn: 'the text',
      }),
    [go],
  );
  useSearchSource(source);

  const decorations = useMemo<WordDecoration[]>(
    () =>
      shown
        ? matches.map((match, index) => ({ kind: 'find', paragraphId: match.paragraphId, start: match.start, end: match.end, current: index === shown.index }))
        : [],
    [matches, shown],
  );

  const items = useCallback((): PageItem[] => {
    if (!shown) return [];
    const count = matches.length;
    const at = Math.min(shown.index, count - 1);
    const where = count === 0 ? `No matches for “${shown.term}”` : `${at + 1} of ${count} for “${shown.term}”`;
    const step = (by: 1 | -1) => go(shown.term, (at + by + count) % count);
    return [
      {
        id: 'search.next',
        label: 'Next match',
        group: 'Search',
        hint: where,
        icon: 'next',
        disabledReason: count < 2 ? 'No other match.' : undefined,
        run: () => step(1),
      },
      {
        id: 'search.prev',
        label: 'Previous match',
        group: 'Search',
        hint: where,
        icon: 'previous',
        disabledReason: count < 2 ? 'No other match.' : undefined,
        run: () => step(-1),
      },
      { id: 'search.clear', label: 'Clear the search', group: 'Search', icon: 'close', run: () => setShown(null) },
    ];
  }, [shown, matches, go]);

  return { decorations, items };
}

function reveal(
  hit: FindMatch,
  now: { recording: boolean; seek: Options['seek']; view: Options['view']; lines: readonly { id: string; text: string }[] },
): void {
  if (now.recording) {
    now.view.current?.show(hit.paragraphId);
    return;
  }
  const text = now.lines.find((line) => line.id === hit.paragraphId)?.text ?? '';
  // A match that starts inside a word lands on that word, not the next one.
  const before = text.slice(0, hit.start);
  now.seek(hit.paragraphId, Math.max(0, wordCount(before) - (/\S$/.test(before) ? 1 : 0)));
}
