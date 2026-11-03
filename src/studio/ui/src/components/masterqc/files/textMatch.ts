// The Text column's figure (#2105): the chapter's current Recording Check, read back and never run. It is the Recording Check's own "Text present"
// share (`RecordingCheckReport`: present words over body words, rounded) judged by that check's own thresholds (`judgement`); this file adds no figure
// and no threshold. A result that is stale or never run, or a chapter the check refuses, has no figure: the cell says "Not checked".
import { useEffect, useMemo, useState } from 'react';
import { usePort } from '../../../ports/usePort';
import { isNarrationChapter } from '../../../chapterKinds';
import type { CoverageResult, ManuscriptChapter, MeasureFileResult } from '../../../types';
import { chapterOfFile } from '../../master/chapterFile';
import type { TextMatch } from './rows';

/** The Text figure of one stored check, or undefined when it is not a current one with a report and a judgement. */
export function textMatchOf(result: Pick<CoverageResult, 'state' | 'result' | 'judgement'>): TextMatch | undefined {
  const { result: report, judgement } = result;
  if (result.state !== 'current' || !report || !judgement) return undefined;
  const percent = report.bodyTokens > 0 ? Math.round((report.presentTokens / report.bodyTokens) * 100) : 100;
  return { percent, met: judgement.state === 'met' };
}

/** How many stored checks are read at once: a long book's files must not become thousands of host calls in one go. */
const READ_AT_ONCE = 8;

/**
 * The Text figure by chapter id of each chapter a measured file belongs to (`chapterOfFile`, the page's one pairing rule), read from the
 * stored Recording Checks (`coverageResult`), again whenever `files` changes. A chapter with no file is not read at all, and one whose
 * read fails has no entry, so its file says "Not checked"; nothing is guessed.
 */
export function useTextMatches(chapters: readonly ManuscriptChapter[], files: readonly MeasureFileResult[]): Readonly<Record<string, TextMatch>> {
  const coverage = usePort('coverage');
  const [matches, setMatches] = useState<Readonly<Record<string, TextMatch>>>({});
  // Keyed by the ids themselves, so a caller that builds `files` anew each render does not read (and re-render) forever.
  const key = useMemo(() => {
    const narration = chapters.filter(isNarrationChapter);
    const found = new Set<string>();
    for (const file of files) {
      if (file.status !== 'measured') continue;
      const chapter = chapterOfFile(file, narration);
      if (chapter) found.add(chapter.id);
    }
    return JSON.stringify([...found]);
  }, [chapters, files]);
  useEffect(() => {
    const ids = JSON.parse(key) as string[];
    let live = true;
    void (async () => {
      const read: [string, TextMatch][] = [];
      for (let start = 0; start < ids.length && live; start += READ_AT_ONCE) {
        const batch = await Promise.all(
          ids.slice(start, start + READ_AT_ONCE).map(async (id) => {
            try {
              return [id, textMatchOf(await coverage.coverageResult(id))] as const;
            } catch {
              return [id, undefined] as const; // `silent`: a check that cannot be read is "Not checked", which the cell already says
            }
          }),
        );
        for (const [id, match] of batch) if (match) read.push([id, match]);
      }
      if (live) setMatches(Object.fromEntries(read));
    })();
    return () => {
      live = false;
    };
  }, [coverage, key]);
  return matches;
}
