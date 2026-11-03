// The Text column's figure (#2105): the chapter's current Recording Check, read back and never run. It is the Recording Check's own "Text present"
// share (`RecordingCheckReport`: present words over body words, rounded) judged by that check's own thresholds (`judgement`); this file adds no figure
// and no threshold. A result that is stale or never run, or a chapter the check refuses, has no figure: the cell says "Not checked".
import { useEffect, useMemo, useState } from 'react';
import { usePort } from '../../../ports/usePort';
import { isNarrationChapter } from '../../../chapterKinds';
import type { CoverageResult, ManuscriptChapter, MeasureFileResult } from '../../../types';
import type { TextMatch } from './rows';

/**
 * The Text figure of one stored check, or undefined when it is not a current one with a report and a judgement, or when the chapter had no
 * body words (nothing was compared). The percent is the Recording Check's "Text present" share, rounded; a check that was not met never reads
 * 100% (996 of 1000 words is 99%), so a red figure is never the top of the scale.
 */
export function textMatchOf(result: Pick<CoverageResult, 'state' | 'result' | 'judgement'>): TextMatch | undefined {
  const { result: report, judgement } = result;
  if (result.state !== 'current' || !report || !judgement || report.bodyTokens <= 0) return undefined;
  const met = judgement.state === 'met';
  const share = (report.presentTokens / report.bodyTokens) * 100;
  return { percent: met ? Math.round(share) : Math.min(99, Math.floor(share)), met };
}

/** How many stored checks are read at once: a long book's files must not become thousands of host calls in one go. */
const READ_AT_ONCE = 8;

/** The measured files the Text column can name: the retail sample is no chapter's. */
const isChapterFile = (file: MeasureFileResult): boolean => file.status === 'measured' && !/sample/i.test(file.name);

const WORD = /[\p{L}\p{N}]/u;
const stem = (name: string): string => name.replace(/\.[^.]+$/, '').toLowerCase();

/** Whether `title` is in `name` as whole words: a non-letter, non-digit (or an end of the name) on both sides, so "chapter 1" is not in "chapter 10". */
function hasTitle(name: string, title: string): boolean {
  for (let at = name.indexOf(title); at !== -1; at = name.indexOf(title, at + 1)) {
    const before = name.slice(0, at).at(-1);
    const after = name[at + title.length];
    if ((before === undefined || !WORD.test(before)) && (after === undefined || !WORD.test(after))) return true;
  }
  return false;
}

/**
 * The chapter a file belongs to: the chapter whose whole-word title is in the file's name, else the one its number names (the only number in
 * the name is the chapter's, counting from 1; the page's pairing rule, `chapterOfFile`, read with word boundaries). When several chapters fit,
 * the longest title wins ("Chapter 10" over "Chapter 1"); when two fit equally well, or none, the file belongs to no chapter and its row
 * says "Not checked" rather than another chapter's figure.
 */
export function chapterForFile(file: Pick<MeasureFileResult, 'name'>, chapters: readonly ManuscriptChapter[]): ManuscriptChapter | undefined {
  const name = stem(file.name);
  const digits = name.match(/\d+/g);
  const number = digits?.length === 1 ? Number(digits[0]) : undefined;
  let best: ManuscriptChapter | undefined;
  let bestLength = -1;
  let tied = false;
  for (const chapter of chapters) {
    const title = chapter.title.trim().toLowerCase();
    const length = title && hasTitle(name, title) ? title.length : number !== undefined && number === chapter.index + 1 ? 0 : -1;
    if (length < 0) continue;
    if (length > bestLength) {
      best = chapter;
      bestLength = length;
      tied = false;
    } else if (length === bestLength) {
      tied = true;
    }
  }
  return tied ? undefined : best;
}

/**
 * The Text figure of each measured file, by the file's path: the current Recording Check of the one chapter the file belongs to, read from the
 * stored checks (`coverageResult`). It reads again when a file is measured again (its path and fingerprint), when the set of files changes,
 * when a check ends or stops (`subscribeCoverage`) and when the window regains focus. A file with no unique chapter is not read, one whose read
 * fails has no entry, so its row says "Not checked"; nothing is guessed. Figures appear as each batch of reads ends.
 */
export function useTextMatches(chapters: readonly ManuscriptChapter[], files: readonly MeasureFileResult[]): Readonly<Record<string, TextMatch>> {
  const coverage = usePort('coverage');
  const [matches, setMatches] = useState<Readonly<Record<string, TextMatch>>>({});
  // Keyed by what was measured and which chapter it names, so a caller that builds `files` anew each render does not read (and re-render)
  // forever, and the same files measured again do.
  const key = useMemo(() => {
    const narration = chapters.filter(isNarrationChapter);
    const pairs: [string, string, string][] = [];
    for (const file of files) {
      if (!isChapterFile(file)) continue;
      const chapter = chapterForFile(file, narration);
      if (chapter)
        pairs.push([file.path, chapter.id, `${file.fingerprint?.sha256 ?? ''}:${file.fingerprint?.size_bytes ?? ''}:${file.fingerprint?.modified_at ?? ''}`]);
    }
    return JSON.stringify(pairs);
  }, [chapters, files]);
  // A check that ends (or stops) while Master stays open, or the window coming back to the front (the saved project may have changed under a
  // check, which goes stale), reads every stored check again: the cell follows the check, not only the set of files.
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const reread = () => setVersion((count) => count + 1);
    const unsubscribe = coverage.subscribeCoverage((state) => {
      if (state.phase !== 'running' && state.phase !== 'idle') reread();
    });
    window.addEventListener('focus', reread);
    return () => {
      unsubscribe();
      window.removeEventListener('focus', reread);
    };
  }, [coverage]);
  useEffect(() => {
    const pairs = JSON.parse(key) as [string, string, string][];
    let live = true;
    void (async () => {
      const known: Record<string, TextMatch> = {};
      if (pairs.length === 0) setMatches((now) => (Object.keys(now).length === 0 ? now : {}));
      for (let start = 0; start < pairs.length && live; start += READ_AT_ONCE) {
        const batch = await Promise.all(
          pairs.slice(start, start + READ_AT_ONCE).map(async ([path, id]) => {
            try {
              return [path, textMatchOf(await coverage.coverageResult(id)), id] as const;
            } catch {
              return [path, undefined, id] as const; // `silent`: a check that cannot be read is "Not checked", which the cell already says
            }
          }),
        );
        for (const [path, match, id] of batch) if (match) known[path] = { ...match, chapterId: id };
        if (live) setMatches({ ...known }); // a batch at a time: the first figures show while the rest are read
      }
    })();
    return () => {
      live = false;
    };
  }, [coverage, key, version]);
  return matches;
}
