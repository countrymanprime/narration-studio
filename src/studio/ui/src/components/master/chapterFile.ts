// The one rule that pairs a chapter with its measured file, for Delivery's "Before you build" rows, Pipeline, Master & QC's rows and its Text column:
// a file belongs to a chapter when its name carries the chapter's title as whole words ("The Queen's Croquet-Ground.wav"), else the chapter number
// as the only number in the name ("Chapter 04.wav" is the chapter at `index` 3: the index counts from 0, the number from 1). When several
// chapters fit, the longest title wins ("Chapter 10.wav" is Chapter 10's, not Chapter 1's); when two fit equally well the file is nobody's.
import type { ManuscriptChapter, MeasureFileResult } from '../../types';

type Titled = Pick<ManuscriptChapter, 'title' | 'index'>;

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

function pick<C extends Titled>(file: Pick<MeasureFileResult, 'name'>, chapters: readonly C[]): C | undefined {
  const name = stem(file.name);
  const digits = name.match(/\d+/g);
  const number = digits?.length === 1 ? Number(digits[0]) : undefined;
  let best: C | undefined;
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

// Rows ask once per chapter, so the answer for a file is kept per chapter list: the pairing stays one pass over the files, not one per row.
const owners = new WeakMap<readonly Titled[], WeakMap<object, Titled | undefined>>();

/** The one chapter a file belongs to, if any: the longest whole-word title in its name, else the chapter its number names; a tie is no chapter. */
export function chapterForFile<C extends Titled>(file: Pick<MeasureFileResult, 'name'>, chapters: readonly C[]): C | undefined {
  let byFile = owners.get(chapters);
  if (!byFile) owners.set(chapters, (byFile = new WeakMap()));
  if (byFile.has(file)) return byFile.get(file) as C | undefined;
  const chapter = pick(file, chapters);
  byFile.set(file, chapter);
  return chapter;
}

/** The file that belongs to a chapter, if any: the first file whose one chapter, among `chapters`, is this one. */
export function fileOf<F extends Pick<MeasureFileResult, 'name'>>(chapter: Titled, files: readonly F[], chapters: readonly Titled[]): F | undefined {
  return files.find((file) => chapterForFile(file, chapters) === chapter);
}
