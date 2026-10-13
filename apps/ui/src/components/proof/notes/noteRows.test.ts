import { describe, expect, it } from 'vitest';
import { FINDING_NOTE_TYPES, shownFindingNoteType } from '../../../api/contracts/findings';
import {
  TYPE_CHIP_CH,
  chipCounts,
  countDigits,
  groupByChapter,
  inBookOrder,
  inWindow,
  matchesChip,
  matchesFind,
  noteRow,
  queryFor,
  sourcesOf,
  sourcesText,
  windowIsNarrow,
} from './noteRows';
import { notesFixture } from './testNotes';

const rows = notesFixture().map(noteRow);
const byId = (id: string) => rows.find((r) => r.id === id)!;

describe('rows-are-findings-in-time-order', () => {
  it('builds the row from the finding', () => {
    const row = byId('a');
    expect(row).toMatchObject({
      time: '0:12.0',
      type: 'misread',
      script: 'I could not help it',
      heard: 'I could not help myself',
      from: 'Local AI compare',
      confidence: 0.9,
      chapterId: 'ch1',
    });
    expect(row.resolution).toEqual({ label: 'To review', tone: 'neutral' });
  });
  it('asks the host for time order by default', () => {
    expect(queryFor('time')).toEqual({ sort: 'time' });
    expect(queryFor('time', 'ch1')).toEqual({ sort: 'time', chapterId: 'ch1' });
  });
  it('keeps a missing time as a dash and a missing chapter named', () => {
    const row = noteRow({ ...notesFixture()[0], time_range: undefined, manuscript: undefined });
    expect(row.time).toBe('—');
    expect(row.chapterTitle).toBe('No chapter');
  });
});

describe('all-chapters-groups-by-chapter-with-open-count', () => {
  it('counts the notes that are not cleared, not the unreviewed ones', () => {
    const groups = groupByChapter(rows);
    expect(groups.map((g) => [g.title, g.rows.length, g.open])).toEqual([
      ['Chapter 1', 3, 3],
      ['Chapter 2', 2, 1],
    ]);
  });
});

describe('sort-changes-the-order', () => {
  it('sends each sort as FindingsQuery.sort', () => {
    expect(queryFor('confidence').sort).toBe('confidence');
    expect(queryFor('severity').sort).toBe('severity');
  });
});

describe('chips-filter-and-count', () => {
  it('filters and counts each chip', () => {
    const ids = (chip: Parameters<typeof matchesChip>[1]) => rows.filter((r) => matchesChip(r, chip)).map((r) => r.id);
    expect(ids('all')).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(ids('review')).toEqual(['a']);
    expect(ids('open')).toEqual(['a', 'b', 'c', 'e']);
    expect(ids('pickups')).toEqual(['b']);
    expect(ids('decided')).toEqual(['b', 'c', 'd', 'e']);
    expect(chipCounts(rows)).toEqual({ all: 5, review: 1, open: 4, pickups: 1, decided: 4 });
  });
  it('leaves room for the most digits', () => {
    expect(countDigits({ all: 120, review: 1, open: 9, pickups: 0, decided: 3 })).toBe(3);
  });
});

describe('in-view-chip-only-when-the-window-is-narrower', () => {
  it('shows only for a window narrower than the chapter and keeps notes inside it', () => {
    expect(windowIsNarrow(undefined)).toBe(false);
    expect(windowIsNarrow({ start: 0, len: 760, total: 760 })).toBe(false);
    const win = { start: 10, len: 100, total: 760 };
    expect(windowIsNarrow(win)).toBe(true);
    expect(rows.filter((r) => inWindow(r, win)).map((r) => r.id)).toEqual(['a', 'b', 'd']);
  });
});

describe('find-in-notes-filters-script-and-heard', () => {
  it('matches what was written or said, ignoring case', () => {
    expect(rows.filter((r) => matchesFind(r, 'HARBOR')).map((r) => r.id)).toEqual(['b']);
    expect(rows.filter((r) => matchesFind(r, 'rowan')).map((r) => r.id)).toEqual(['d']);
    expect(rows.filter((r) => matchesFind(r, '  ')).length).toBe(5);
  });
});

describe('sources-line-names-the-analyzers', () => {
  it('counts rows by analyzer, most first', () => {
    expect(sourcesOf(rows)).toEqual([
      { source: 'Local AI compare', n: 4 },
      { source: 'Delivery measurement', n: 1 },
    ]);
    expect(sourcesText(rows)).toBe('Local AI compare 4 · Delivery measurement 1');
  });
});

describe('type-and-resolution-chips-are-words-and-shapes', () => {
  it('words each decision', () => {
    expect([byId('a'), byId('b'), byId('c'), byId('d'), byId('e')].map((r) => r.resolution.label)).toEqual([
      'To review',
      'Needs pickup',
      'Fix in edit',
      'Waived',
      'Deferred',
    ]);
  });
  it('gives the type chip room for the longest type word', () => {
    expect(TYPE_CHIP_CH).toBeGreaterThanOrEqual(Math.max(...FINDING_NOTE_TYPES.map((t) => t.length)));
  });
  it('names a note by the same type word the inspector shows, whatever the analyzer called its kind', () => {
    const base = notesFixture()[0];
    const extra = noteRow({ ...base, category: 'transcript_discrepancy', evidence: { kind: 'extra_words' }, review: { status: 'unreviewed' } });
    expect(extra.type).toBe(
      shownFindingNoteType({ ...base, category: 'transcript_discrepancy', evidence: { kind: 'extra_words' }, review: { status: 'unreviewed' } }),
    );
    expect(FINDING_NOTE_TYPES).toContain(extra.type);
    expect(noteRow({ ...base, category: 'entity', evidence: undefined }).type).toBe('pron');
  });
  it("shows the narrator's chosen type over the analyzer's", () => {
    expect(noteRow({ ...notesFixture()[0], review: { status: 'unreviewed', type: 'repeat' } }).type).toBe('repeat');
  });
});

describe('by-time-lists-chapters-in-book-order', () => {
  const at = (chapter_id: string, start: number) => ({ id: `${chapter_id}-${start}`, manuscript: { chapter_id }, time_range: { start, end: start + 1 } });
  it('puts Chapter 1 above Chapter 2 although its first note is later in its own chapter', () => {
    const hostOrder = [at('ch2', 8.2), at('ch1', 12.4), at('ch1', 40), at('ch2', 90)];
    expect(inBookOrder(hostOrder, ['ch1', 'ch2']).map((f) => f.id)).toEqual(['ch1-12.4', 'ch1-40', 'ch2-8.2', 'ch2-90']);
  });
  it('keeps the host order inside a chapter and puts an unlisted chapter last', () => {
    const hostOrder = [at('gone', 1), at('ch2', 50), at('ch2', 5)];
    expect(inBookOrder(hostOrder, ['ch1', 'ch2']).map((f) => f.id)).toEqual(['ch2-50', 'ch2-5', 'gone-1']);
  });
});
