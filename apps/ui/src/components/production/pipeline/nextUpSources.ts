import { chapterName } from '../../../chapterName';
import type { DeliveryProfile, ManuscriptChapter, MeasureFileResult } from '../../../types';
import { fileOf } from '../../master/chapterFile';
import { fileVerdict, missesWithLimit } from '../../master/fileVerdict';
import type { NextUpInputs } from './nextUpRanking';

type Chapter = Pick<ManuscriptChapter, 'id' | 'title' | 'index'> & { subtitle?: string };

/**
 * Next up's failing item (the mock's "fails N ACX checks"): the first chapter, in book order, whose measured file misses a rule of
 * the profile it was judged against, with each miss as "rms −25.3 dBFS (limit −23 to −18 dBFS)". Null when nothing fails or the
 * profile is not known.
 */
export function failingChapter(chapters: readonly Chapter[], files: readonly MeasureFileResult[], profile: DeliveryProfile | null): NextUpInputs['failing'] {
  if (!profile) return null;
  for (const chapter of chapters) {
    const file = fileOf(chapter, files);
    if (!file || fileVerdict(file) !== 'fail') continue;
    const fails = missesWithLimit(file, profile);
    if (fails.length) return { chapterId: chapter.id, tag: chapterName(chapter), fails };
  }
  return null;
}

/** The chapters with an open pickup line, each named once in the order the lines list them (the mock's "Ch 3 and Ch 7"). */
export function pickupChapters(lines: readonly { chapterId: string }[], nameOf: (chapterId: string) => string): string[] {
  return [...new Set(lines.map((line) => line.chapterId))].map(nameOf);
}
