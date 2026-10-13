import { chapterName } from '../../../chapterName';
import type { DeliveryProfile, ManuscriptChapter, MeasureFileResult } from '../../../types';
import { fileOf } from '../../master/chapterFile';
import { formatBound } from '../../master/deliveryProfile';
import { fileVerdict, valueWithUnit } from '../../master/fileVerdict';
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
    const fails = file.rules.flatMap((result) => {
      if (result.status !== 'not_met') return [];
      const rule = profile.rules.find((candidate) => candidate.id === result.ruleId);
      if (!rule) return [];
      const value = result.value !== null ? ` ${valueWithUnit(rule, result.value)}` : '';
      const bound = formatBound(rule);
      return [`${rule.label.toLowerCase()}${value}${bound ? ` (limit ${bound})` : ''}`];
    });
    if (fails.length) return { chapterId: chapter.id, tag: chapterName(chapter), fails };
  }
  return null;
}

/** The chapters with an open pickup line, each named once in the order the lines list them (the mock's "Ch 3 and Ch 7"). */
export function pickupChapters(lines: readonly { chapterId: string }[], nameOf: (chapterId: string) => string): string[] {
  return [...new Set(lines.map((line) => line.chapterId))].map(nameOf);
}
