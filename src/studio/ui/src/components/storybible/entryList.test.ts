// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import type { GuideEntity, GuideType } from '../../types';
import type { ExtractionSuggestion } from '../../api/contracts/extraction';
import { nameCount, typeUnknown, aliasFlagged, chapterCount, entryFlagged, entryNeedsReview, reviewCount, kindSwatch } from './entryList';

const entry = (id: string, name: string, over: Partial<GuideEntity> = {}): GuideEntity => ({
  id,
  canonical_name: name,
  aliases: [],
  category: 'Character',
  occurrences: [],
  occurrence_count: 0,
  pronunciation: { ipa: '', source: '', confidence: '' },
  description: { text: '', evidence: {} },
  personality_notes: [],
  relationships: [],
  properties: [],
  locked: false,
  review_state: 'reviewed',
  ...over,
});
const inChapters = (...ids: string[]) => ids.map((chapterId, sceneIndex) => ({ chapterId, chapter: chapterId, sceneIndex }));

describe('each-row-shows-its-names-and-its-chapters-and-no-mention-counts', () => {
  it("counts the entry's own name with its aliases, as the detail lists them", () => {
    expect(nameCount(entry('a', 'A'))).toBe(1);
    expect(nameCount(entry('a', 'A', { aliases: [{ text: 'x' }, { text: 'y' }] as GuideEntity['aliases'] }))).toBe(3);
  });
  it('asks for review and keeps the type word when the host could not tell the type', () => {
    expect(typeUnknown(entry('a', 'A', { category: 'Needs Review' }))).toBe(true);
    expect(typeUnknown(entry('a', 'A', { category: 'Character' }))).toBe(false);
  });
  it('counts distinct chapters of the appearances', () => {
    expect(chapterCount(entry('a', 'A', { appearances: [...inChapters('1', '2'), { chapterId: '1', chapter: '1', sceneIndex: 5 }] }))).toBe(2);
  });
  it('falls back to the chapters of the evidence when the file predates appearances', () => {
    const occ = (chapterId: string, paragraph: number) => ({ chapter: chapterId, chapterId, paragraph, excerpt: '' });
    expect(chapterCount(entry('a', 'A', { occurrences: [occ('1', 1), occ('1', 2), occ('2', 1)] }))).toBe(2);
  });
});

// The flag view beside the "Needs Review" category tab (SNB-3b): an entry needs review when the host flagged it or one of its names,
// or when a suggestion about it is still to be verified.
const alias = (text: string) => ({ text, pronunciation: { ipa: '', source: '', confidence: '' }, occurrences: [] });
const suggestion = (entryId: string | null, status: ExtractionSuggestion['status']): ExtractionSuggestion => ({
  id: `${entryId}-${status}`,
  kind: 'property',
  payload: { kind: 'property', entry: entryId ?? '', key: 'k', value: 'v' },
  entryId,
  evidence: [],
  confidence: 0.5,
  source: 'rules',
  status,
  fp: `${entryId}-${status}`,
  createdAt: '2026-10-11T00:00:00Z',
});

describe('the-review-flags-of-an-entry-and-its-names', () => {
  it('reads the host flags when it sends them', () => {
    const flagged = entry('a', 'A', { aliases: [alias('Al'), alias('Ally')], review: { entry: false, aliases: ['Ally'] } });
    expect(entryFlagged(flagged)).toBe(true);
    expect(aliasFlagged(flagged, 'Ally')).toBe(true);
    expect(aliasFlagged(flagged, 'Al')).toBe(false);
    expect(entryFlagged(entry('b', 'B', { review: { entry: true, aliases: [] } }))).toBe(true);
    expect(entryFlagged(entry('c', 'C', { review: { entry: false, aliases: [] } }))).toBe(false);
  });

  it('falls back to review_state for a host that sends no review object, with no name flags', () => {
    expect(entryFlagged(entry('a', 'A', { review_state: 'needs review' }))).toBe(true);
    expect(entryFlagged(entry('a', 'A', { review_state: 'generated' }))).toBe(false);
    expect(aliasFlagged(entry('a', 'A', { aliases: [alias('Al')], review_state: 'needs review' }), 'Al')).toBe(false);
  });

  it('review wins over review_state when both are present', () => {
    expect(entryFlagged(entry('a', 'A', { review_state: 'needs review', review: { entry: false, aliases: [] } }))).toBe(false);
  });
});

describe('needs-review-counts-flags-and-suggestions-to-verify', () => {
  const rows = [
    entry('flagged', 'Flagged', { review: { entry: true, aliases: [] } }),
    entry('name', 'Name', { aliases: [alias('N')], review: { entry: false, aliases: ['N'] } }),
    entry('verify', 'Verify'),
    entry('both', 'Both', { review: { entry: true, aliases: [] } }),
    entry('clean', 'Clean'),
    entry('accepted', 'Accepted'),
  ];
  const suggestions = [
    suggestion('verify', 'needs-verification'),
    suggestion('both', 'needs-verification'),
    suggestion('both', 'needs-verification'),
    suggestion('accepted', 'accepted'),
    suggestion('clean', 'rejected'),
    suggestion('clean', 'accepted-auto'),
    suggestion(null, 'needs-verification'),
  ];

  it('counts an entry once, whether it is flagged, has something to verify, or both', () => {
    expect(rows.filter((row) => entryNeedsReview(row, suggestions)).map((row) => row.id)).toEqual(['flagged', 'name', 'verify', 'both']);
    expect(reviewCount(rows, suggestions)).toBe(4);
  });

  it('counts only the flags when no suggestion is known', () => {
    expect(reviewCount(rows, [])).toBe(3);
  });

  it('ignores a suggestion that has no entry yet', () => {
    expect(reviewCount([entry('x', 'X')], [suggestion(null, 'needs-verification')])).toBe(0);
  });
});

describe('a-kind-is-drawn-in-its-type-colour', () => {
  const types: GuideType[] = [
    { name: 'Character', colour: 'rose', speaks: true },
    { name: 'Place', colour: 'blue', speaks: false },
  ];
  it('names the swatch of the colour the narrator set', () => expect(kindSwatch(types, 'Character')).toBe('event'));
  it('draws the system states amber, as a thing still to review (D7)', () => {
    expect(kindSwatch(types, 'Needs Review')).toBe('warn');
    expect(kindSwatch(types, 'Draft')).toBe('warn');
  });
  it('draws a name no type has in the faint hue', () => expect(kindSwatch(types, 'Mystery')).toBe('non-text'));
});
