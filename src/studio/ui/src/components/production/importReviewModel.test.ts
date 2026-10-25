import { describe, expect, it } from 'vitest';
import { mockImportPreview } from '../../api/mockImportPreview';
import type { ManuscriptImportPreview } from '../../types';
import {
  chapterIncluded,
  chapterRows,
  headingName,
  effectiveKind,
  groupSections,
  hasSubtitleChoices,
  isGroupOpen,
  plural,
  REVIEW_GROUPS,
  reviewCounts,
  reviewedHeading,
  subtitleKept,
  subtitleOverridesToCommit,
} from './importReviewModel';

const preview = mockImportPreview('docx');
const section = (id: string) => {
  const found = preview.sections?.find((item) => item.id === id);
  if (!found) throw new Error(`no section ${id}`);
  return found;
};

describe('effectiveKind', () => {
  it('is the kind the importer proposed until the narrator chooses another', () => {
    expect(effectiveKind(section('section-0001'), {})).toBe('narration');
    expect(effectiveKind(section('section-0001'), { sectionKinds: { 'section-0001': 'reference' } })).toBe('reference');
    expect(effectiveKind(section('section-0006'), { sectionKinds: { 'section-0001': 'reference' } })).toBe('reference');
  });
});

describe('the subtitle choices', () => {
  it('keeps every subtitle, as the importer guessed, until the narrator says otherwise', () => {
    expect(subtitleKept(section('section-0001'), {})).toBe(true);
    expect(reviewedHeading(section('section-0001'), {})).toEqual({ title: 'Chapter One', subtitle: 'Down the Rabbit-Hole' });
    expect(subtitleOverridesToCommit(preview, {})).toBeUndefined();
  });

  it('takes a row set by hand over the default', () => {
    expect(subtitleKept(section('section-0001'), { subtitleDefault: false })).toBe(false);
    expect(subtitleKept(section('section-0001'), { subtitleDefault: false, subtitleOverrides: { 'section-0001': true } })).toBe(true);
    expect(subtitleKept(section('section-0002'), { subtitleOverrides: { 'section-0002': false } })).toBe(false);
  });

  it('joins a Word heading line to the title, and keeps a plain-text line apart as the start of the text', () => {
    expect(reviewedHeading(section('section-0001'), { subtitleDefault: false })).toEqual({ title: 'Chapter One Down the Rabbit-Hole' });
    const text = mockImportPreview('text').sections?.[0];
    if (!text) throw new Error('no text section');
    expect(reviewedHeading(text, { subtitleDefault: false })).toEqual({ title: 'Chapter One', textLine: '“Curiouser and curiouser!” cried Alice' });
  });

  it('commits every subtitle turned off, by the default or a row, and nothing for a section without one', () => {
    expect(subtitleOverridesToCommit(preview, { subtitleDefault: false, subtitleOverrides: { 'section-0002': true, 'section-0003': false } })).toEqual({
      'section-0001': false,
      'section-0004': false,
    });
  });

  it('offers the choice only when a section has a subtitle that says where it goes', () => {
    expect(hasSubtitleChoices(preview)).toBe(true);
    expect(hasSubtitleChoices({ ...preview, sections: preview.sections?.map(({ subtitleOff: _off, ...rest }) => rest) })).toBe(false);
  });
});

describe('reviewCounts', () => {
  it('counts the chapters that will be written and the suggestions still checked, and nothing for front matter or reference sections', () => {
    expect(reviewCounts(preview, {})).toEqual({ narration: 5, suggestionsChecked: 3, suggestionsTotal: 3, repairs: 0 });
  });

  it('follows a reclassification, so the summary and the rows cannot disagree', () => {
    const counts = reviewCounts(preview, { sectionKinds: { 'section-0001': 'reference', 'section-0006': 'narration', 'section-0008': 'narration' } });
    expect(counts).toMatchObject({ narration: 6 });
  });

  it('counts the suggestions of an explicit list, and treats no list as every suggestion checked', () => {
    expect(reviewCounts(preview, { characterCandidateIds: ['candidate-section-0007-002'] })).toMatchObject({ suggestionsChecked: 1, suggestionsTotal: 3 });
    expect(reviewCounts(preview, { characterCandidateIds: [] })).toMatchObject({ suggestionsChecked: 0, suggestionsTotal: 3 });
  });

  it('ignores a checked id the preview does not list', () => {
    expect(reviewCounts(preview, { characterCandidateIds: ['candidate-gone'] })).toMatchObject({ suggestionsChecked: 0 });
  });

  it('counts the repairs the importer reported', () => {
    expect(reviewCounts(mockImportPreview('repaired'), {}).repairs).toBe(2);
  });

  it('a preview with no sections (a PDF) has no chapters', () => {
    const pdf: ManuscriptImportPreview = { format: 'pdf', sourceName: 'a.pdf', paragraphCount: 3, chapterTitles: ['One', 'Two'] };
    expect(reviewCounts(pdf, {})).toEqual({ narration: 0, suggestionsChecked: 0, suggestionsTotal: 0, repairs: 0 });
  });
});

describe('chapterRows', () => {
  it('lists only the sections the importer proposed as chapters, so front matter and reference material are never shown', () => {
    expect(chapterRows(preview.sections ?? []).map((item) => item.title)).toEqual([
      'Chapter One',
      'Chapter Two',
      'Chapter Three',
      'Chapter Four',
      'Chapter Five',
    ]);
  });

  it('keeps a chapter switched off in the list, as a row whose switch is off', () => {
    const off = { sectionKinds: { 'section-0003': 'reference' as const } };
    expect(chapterRows(preview.sections ?? [])).toHaveLength(5);
    expect(chapterIncluded(section('section-0003'), off)).toBe(false);
    expect(chapterIncluded(section('section-0001'), off)).toBe(true);
  });
});

describe('groupSections', () => {
  it('lists each kind in the order the sections came, wherever the importer put them', () => {
    const groups = groupSections(preview.sections ?? [], { sectionKinds: { 'section-0003': 'reference' } });
    expect(groups.narration.map((item) => item.title)).toEqual(['Chapter One', 'Chapter Two', 'Chapter Four', 'Chapter Five']);
    expect(groups.reference.map((item) => item.title)).toEqual(['Chapter Three', 'Glossary', 'Characters']);
    expect(groups.opening.map((item) => item.title)).toEqual(['Front Matter']);
  });
});

describe('isGroupOpen', () => {
  it('opens the chapters and no other group until the narrator opens one', () => {
    expect(REVIEW_GROUPS).toEqual(['narration', 'characters', 'repairs']);
    expect(isGroupOpen('narration', {})).toBe(true);
    expect(isGroupOpen('characters', {})).toBe(false);
    expect(isGroupOpen('repairs', {})).toBe(false);
  });

  it('is an accordion: the group opened by hand is the only open one', () => {
    for (const opened of REVIEW_GROUPS) {
      const chosen = { [opened]: true };
      for (const key of REVIEW_GROUPS) expect(isGroupOpen(key, chosen)).toBe(key === opened);
    }
  });

  it('leaves every group closed once the narrator closed the chapters and opened nothing else', () => {
    for (const key of REVIEW_GROUPS) expect(isGroupOpen(key, { narration: false })).toBe(false);
  });

  it('closes the chapters when another group was opened', () => {
    expect(isGroupOpen('narration', { characters: true })).toBe(false);
    expect(isGroupOpen('narration', { characters: true, narration: false })).toBe(false);
  });
});

describe('plural', () => {
  it('uses the singular for exactly one, and adds an s otherwise, or the plural given', () => {
    expect(plural(1, 'chapter')).toBe('chapter');
    expect(plural(0, 'chapter')).toBe('chapters');
    expect(plural(2, 'chapter')).toBe('chapters');
    expect(plural(2, 'entry', 'entries')).toBe('entries');
  });
});

describe('headingName', () => {
  it('writes a label heading the way the manuscript does, and every other with the em dash', () => {
    expect(headingName({ title: 'CHAPTER VIII.', subtitle: 'Croquet' })).toBe('CHAPTER VIII. Croquet');
    expect(headingName({ title: '8.', subtitle: 'Croquet' })).toBe('8. Croquet');
    expect(headingName({ title: 'Chapter 8:', subtitle: 'Croquet' })).toBe('Chapter 8: Croquet');
    expect(headingName({ title: 'Chapter 8:' })).toBe('Chapter 8:');
    expect(headingName({ title: 'Chapter Eight', subtitle: 'Croquet' })).toBe('Chapter Eight: Croquet');
    expect(headingName({ title: 'Prologue' })).toBe('Prologue');
  });
});
