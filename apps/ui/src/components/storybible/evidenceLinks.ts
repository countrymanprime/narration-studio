// Where a suggestion's quote goes: the Script line it was found on. A quote names its paragraph by id; the Script's deep link takes the
// book-wide index (App.tsx `goToScript`), so both come from the chapter list's paragraph ids.

import type { ManuscriptChapter } from '../../api/contracts/manuscript';
import { chapterName } from '../../chapterName';
import type { EvidenceLinks } from './suggested/row/Quotes';

type Chapter = Pick<ManuscriptChapter, 'id' | 'title' | 'subtitle' | 'contentKind' | 'paragraphIds'>;

/** The quote's tip ("Chapter 8 · line 13") and its go-to, from the chapters the host listed; a paragraph no chapter names has no line. */
export function evidenceLinks(chapters: readonly Chapter[], goTo: (chapter: string, paragraph: number) => void): EvidenceLinks {
  const find = (paragraphId: string) => {
    for (const chapter of chapters) {
      const at = chapter.paragraphIds?.findIndex((row) => row.id === paragraphId) ?? -1;
      if (at >= 0) return { chapter, line: at + 1, index: chapter.paragraphIds![at]!.index };
    }
    return undefined;
  };
  return {
    lineLabel: (paragraphId) => {
      const hit = find(paragraphId);
      return hit ? `${chapterName(hit.chapter, 'short')} · line ${hit.line}` : 'line not found';
    },
    onGoToEvidence: (paragraphId) => {
      const hit = find(paragraphId);
      if (hit) goTo(hit.chapter.id, hit.index);
    },
  };
}
