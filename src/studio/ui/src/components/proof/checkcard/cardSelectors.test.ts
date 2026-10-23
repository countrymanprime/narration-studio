import { describe, expect, it } from 'vitest';
import type { CoverageGap, CoverageReason, CoverageResult, CoverageState } from '../../../api/contracts/coverage';
import type { Finding } from '../../../api/contracts/findings';
import {
  asOfLabel,
  cardCounts,
  cardFindings,
  cardState,
  cardTally,
  checkSentence,
  estimateLabel,
  recordedLabel,
  runningFor,
  staleWhy,
  unfinishedSentence,
} from './cardSelectors';

const gap = (id: string, kind: CoverageGap['kind'], at: number): CoverageGap => ({
  id,
  kind,
  paragraphIds: ['p1'],
  tokenCount: 3,
  firstWord: 'the',
  lastWord: 'end',
  position: { itemIndex: 0, itemGuid: 'g', sourceTime: at },
  confidence: null,
  confReason: 'no_word_scores',
});
const result = (state: CoverageResult['state'], reasons: CoverageReason[] = [], gaps: CoverageGap[] = [], unfinished = { start: 0, end: 0 }): CoverageResult =>
  ({
    chapterId: 'c',
    state,
    reasons,
    basis: { label: 'saved', modifiedAt: '2026-09-26T08:40:00', stale: false },
    result: { gaps, unfinished },
  }) as unknown as CoverageResult;
const audio = (id: string, kind: string, status: Finding['review']['status'] = 'unreviewed', start = 5): Finding =>
  ({
    id,
    category: 'audio_quality',
    evidence: { kind },
    review: { status },
    time_range: { start, end: start + 1 },
    confidence_reason: 'heard',
  }) as unknown as Finding;

describe('four states', () => {
  const run = (patch: Partial<CoverageState>): CoverageState => ({ phase: 'running', percent: 40, message: '', chapterId: 'c', ...patch });
  it('reads none, checking, current and stale from the stored result and the run', () => {
    expect(cardState(undefined, false)).toBe('none');
    expect(cardState(result('never'), false)).toBe('none');
    expect(cardState(result('current'), false)).toBe('current');
    expect(cardState(result('stale'), false)).toBe('stale');
    expect(cardState(result('current'), true)).toBe('checking');
  });
  it('is checking only for a running run of this chapter', () => {
    expect(runningFor(run({}), 'c')?.percent).toBe(40);
    expect(runningFor(run({ chapterId: 'other' }), 'c')).toBeUndefined();
    expect(runningFor(run({ phase: 'complete' }), 'c')).toBeUndefined();
  });
});

describe('recorded against the estimate', () => {
  it('uses the measured seconds and the standard rate, and invents neither', () => {
    expect(recordedLabel(125)).toBe('2:05');
    expect(recordedLabel(undefined)).toBe('—');
    expect(recordedLabel(0)).toBe('—');
    expect(estimateLabel(9300)).toBe('~1:00:00');
    expect(estimateLabel(0)).toBe('—');
  });
});

describe('counts by category', () => {
  const findings = cardFindings(result('current', [], [gap('a', 'misread', 30), gap('b', 'missing', 10), gap('c', 'extra', 20)]), {}, [
    audio('n', 'noise'),
    audio('b1', 'breath'),
    audio('b2', 'breath'),
    audio('k', 'mouth_click'),
  ]);
  it('counts each category and nothing while there is no result', () => {
    expect(cardCounts(findings, true)).toEqual({ misread: 1, missing: 1, extra: 1, noise: 1, breath: 2, click: 1 });
    expect(cardCounts([], false)).toBeNull();
  });
  it('lists them in time order, gaps suggesting a pickup and audio an edit', () => {
    expect(findings.map((f) => f.id)).toEqual(['n', 'b1', 'b2', 'k', 'b', 'c', 'a']);
    expect(findings.find((f) => f.id === 'a')?.suggested).toBe('Needs pickup');
    expect(findings.find((f) => f.id === 'n')?.suggested).toBe('Fix in edit');
  });
  it('takes the status from the gap reviews and the finding review', () => {
    const decided = cardFindings(result('current', [], [gap('a', 'misread', 1), gap('b', 'missing', 2)]), { a: 'accepted', b: 'ignored' }, [
      audio('n', 'noise', 'dismissed'),
    ]);
    expect(cardTally(decided)).toEqual({ todo: 0, accepted: 1, ignored: 2 });
  });
  it('never lists the unfinished start or end as a finding', () => {
    expect(cardFindings(result('current', [], [], { start: 2, end: 3 }), {}, [])).toEqual([]);
    expect(unfinishedSentence(result('current', [], [], { start: 0, end: 3 }))).toBe('Not recorded to the end.');
    expect(unfinishedSentence(result('current', [], [], { start: 2, end: 3 }))).toBe('Start not recorded. Not recorded to the end.');
    expect(unfinishedSentence(result('current'))).toBeUndefined();
  });
});

describe('sentence and as-of', () => {
  it('words the differences', () => {
    expect(checkSentence(0)).toBe('Checked against the script: no differences found');
    expect(checkSentence(1)).toBe('Checked against the script: 1 difference found');
    expect(checkSentence(12)).toBe('Checked against the script: 12 differences found');
  });
  it('says what the check is as of, from the basis', () => {
    expect(asOfLabel(result('current'))).toMatch(/^As of last save · /);
    expect(asOfLabel({ chapterId: 'c', state: 'current', reasons: [] })).toBeUndefined();
  });
});

describe('why it is out of date', () => {
  it('names the text, the recording or the save', () => {
    expect(staleWhy(result('stale', ['manuscript_changed']))).toBe('text');
    expect(staleWhy(result('stale', ['item_trimmed']))).toBe('recording');
    expect(staleWhy(result('stale', ['take_switched', 'manuscript_changed']))).toBe('text');
    expect(staleWhy(result('stale', ['project_unreadable']))).toBe('save');
    expect(staleWhy(result('stale', []))).toBe('save');
  });
});
