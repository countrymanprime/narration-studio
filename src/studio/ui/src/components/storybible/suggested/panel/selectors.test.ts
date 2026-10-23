import { describe, expect, it } from 'vitest';
import type { ExtractionScanJob, ExtractionSource, ExtractionSuggestion } from '../../../../api/contracts/extraction';
import { availableSourceIds, entryPill, filterEntries, scanFailures } from './selectors';

const sug = (id: string, entryId: string | null, status: ExtractionSuggestion['status']): ExtractionSuggestion => ({
  id,
  kind: 'alias',
  payload: { kind: 'alias', entry: 'Alice', alias: id },
  entryId,
  evidence: [],
  confidence: 0.5,
  source: 'rules',
  status,
  fp: id,
  createdAt: '2026-10-11T09:00:00Z',
});
const job = (over: Partial<ExtractionScanJob>): ExtractionScanJob => ({
  id: 'j',
  kind: 'extraction_scan',
  phase: 'running',
  message: '',
  percent: 0,
  logs: [],
  elapsed: 0,
  sources: ['rules'],
  added: 0,
  skipped: 0,
  ...over,
});

describe('verify-chip-filters-and-counts: filterEntries', () => {
  const list = [sug('a', 'alice', 'needs-verification'), sug('b', 'bob', 'accepted'), sug('c', null, 'needs-verification')];
  const entries = [{ id: 'alice' }, { id: 'bob' }, { id: 'carol' }];
  it('keeps every entry while the filter is off', () => expect(filterEntries(entries, list, false)).toEqual(entries));
  it('keeps the entries with something to verify while it is on', () => expect(filterEntries(entries, list, true)).toEqual([{ id: 'alice' }]));
});

describe('entry-pill-says-verify-count: entryPill', () => {
  it('says Verify · N when something waits, Review when only the entry is flagged, nothing otherwise', () => {
    expect(entryPill(2, true)).toBe('Verify · 2');
    expect(entryPill(1, false)).toBe('Verify · 1');
    expect(entryPill(0, true)).toBe('Review');
    expect(entryPill(0, false)).toBeNull();
  });
});

describe('scan-button-starts-the-job: availableSourceIds', () => {
  it('lists the sources the narrator can start and that can run now', () => {
    const source = (id: ExtractionSource['id'], runs: boolean, available: boolean): ExtractionSource => ({ id, label: id, icon: id, runs, available });
    const ids = availableSourceIds([
      source('rules', true, true),
      source('imported', false, true),
      source('gliner', true, false),
      source('booknlp', true, true),
    ]);
    expect(ids).toEqual(['rules', 'booknlp']);
  });
});

describe('scan-failure-names-the-reason: scanFailures', () => {
  it('returns the sentence of each source the job skipped', () => {
    const logs = [
      'Scanning the manuscript.',
      'Skipped GLiNER: GLiNER is not downloaded.',
      'Scanning with Rules (2 of 2).',
      'Skipped BookNLP: it ran out of memory.',
    ];
    expect(scanFailures(job({ phase: 'success', logs }))).toEqual(['GLiNER: GLiNER is not downloaded.', 'BookNLP: it ran out of memory.']);
  });
  it('adds the job’s own sentence when the whole scan failed', () => {
    expect(
      scanFailures(job({ phase: 'error', message: 'The scan did not finish: disk full. Kept 0 suggestions from the sources that finished.', logs: [] })),
    ).toEqual(['The scan did not finish: disk full. Kept 0 suggestions from the sources that finished.']);
  });
  it('is empty for a clean or running scan', () => {
    expect(scanFailures(job({ phase: 'success', logs: ['Scanning the manuscript.'] }))).toEqual([]);
    expect(scanFailures(null)).toEqual([]);
  });
});
