// The Text column's figure (#2105): the chapter's current Recording Check, read back and never run. It is the Recording Check's own "Text present"
// share (`RecordingCheckReport`: present words over body words, rounded) judged by that check's own thresholds (`judgement`); this file adds no figure
// and no threshold. A result that is stale or never run, or a chapter the check refuses, has no figure: the cell says "Not checked".
import { useEffect, useMemo, useState } from 'react';
import { usePort } from '../../../ports/usePort';
import { isNarrationChapter } from '../../../chapterKinds';
import type { CoverageResult, ManuscriptChapter } from '../../../types';
import type { TextMatch } from './rows';

/** The Text figure of one stored check, or undefined when it is not a current one with a report and a judgement. */
export function textMatchOf(result: Pick<CoverageResult, 'state' | 'result' | 'judgement'>): TextMatch | undefined {
  const { result: report, judgement } = result;
  if (result.state !== 'current' || !report || !judgement) return undefined;
  const percent = report.bodyTokens > 0 ? Math.round((report.presentTokens / report.bodyTokens) * 100) : 100;
  return { percent, met: judgement.state === 'met' };
}

/**
 * Each narration chapter's Text figure by chapter id, read from the stored Recording Checks (`coverageResult`), again whenever `refreshKey`
 * changes. A chapter whose read fails has no entry, so its file says "Not checked"; nothing is guessed.
 */
export function useTextMatches(chapters: readonly ManuscriptChapter[], refreshKey: unknown): Readonly<Record<string, TextMatch>> {
  const coverage = usePort('coverage');
  const [matches, setMatches] = useState<Readonly<Record<string, TextMatch>>>({});
  const ids = useMemo(() => chapters.filter(isNarrationChapter).map((chapter) => chapter.id), [chapters]);
  useEffect(() => {
    let live = true;
    void Promise.all(
      ids.map(async (id) => {
        try {
          return [id, textMatchOf(await coverage.coverageResult(id))] as const;
        } catch {
          return [id, undefined] as const; // `silent`: a check that cannot be read is "Not checked", which the cell already says
        }
      }),
    ).then((read) => {
      if (live) setMatches(Object.fromEntries(read.filter((entry): entry is readonly [string, TextMatch] => entry[1] !== undefined)));
    });
    return () => {
      live = false;
    };
  }, [coverage, ids, refreshKey]);
  return matches;
}
