// The one rule that pairs a chapter with its measured file, for Delivery's "Before you build" rows and Master & QC's chapter labels:
// a file belongs to a chapter when its name carries the chapter's title ("The Queen's Croquet-Ground.wav") or the chapter number as the
// only number in the name ("Chapter 04.wav" is the chapter at `index` 3: the index counts from 0, the number from 1).
import type { ManuscriptChapter, MeasureFileResult } from '../../types';

const stem = (name: string) => name.replace(/\.[^.]+$/, '').toLowerCase();

/** Whether `file` is the chapter's: its title in the name, else the chapter number as the whole number in the name. */
function isChapterFile(chapter: Pick<ManuscriptChapter, 'title' | 'index'>, file: Pick<MeasureFileResult, 'name'>): boolean {
  const title = chapter.title.trim().toLowerCase();
  const name = stem(file.name);
  if (title && name.includes(title)) return true;
  const digits = name.match(/\d+/g);
  return digits?.length === 1 && Number(digits[0]) === chapter.index + 1;
}

/** The file that belongs to a chapter, if any. */
export function fileOf<F extends Pick<MeasureFileResult, 'name'>>(chapter: Pick<ManuscriptChapter, 'title' | 'index'>, files: readonly F[]): F | undefined {
  return files.find((file) => isChapterFile(chapter, file));
}

/** The chapter a file belongs to, if any. */
export function chapterOfFile<C extends Pick<ManuscriptChapter, 'title' | 'index'>>(
  file: Pick<MeasureFileResult, 'name'>,
  chapters: readonly C[],
): C | undefined {
  return chapters.find((chapter) => isChapterFile(chapter, file));
}
