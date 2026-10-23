import { describe, expect, it, vi } from 'vitest';
import type { Finding, FindingReviewRequest } from '../../../api/contracts/findings';
import { decideLinked, restoreLinked } from './decideLinked';

const finding = (id: string, status: Finding['review']['status'] = 'unreviewed', note?: string): Finding => ({
  schema_version: 1,
  id,
  analyzer: 'transcript-compare',
  project: {},
  source: {},
  category: 'transcript_discrepancy',
  severity: 'warning',
  confidence: null,
  confidence_reason: '',
  evidence_version: `v-${id}`,
  review: { status, ...(note ? { note } : {}) },
});

const port = (fail: string[] = []) => ({
  findingsReview: vi.fn(async (request: FindingReviewRequest) => {
    if (fail.includes(request.id)) throw new Error(`The evidence for ${request.id} changed.`);
    return { ...finding(request.id, request.status), review: { status: request.status, note: request.note } };
  }),
});

describe('decide-the-linked-findings', () => {
  it('writes the status on each finding, with its own evidence version and note, and keeps what each was', async () => {
    const p = port();
    const done = await decideLinked(p, [finding('a', 'unreviewed', 'mine'), finding('b', 'accepted')], 'dismissed');
    expect(p.findingsReview.mock.calls.map(([r]) => r)).toEqual([
      { id: 'a', evidenceVersion: 'v-a', status: 'dismissed', note: 'mine' },
      { id: 'b', evidenceVersion: 'v-b', status: 'dismissed', note: '' },
    ]);
    expect(done.changed.map((c) => [c.before.review.status, c.after.review.status])).toEqual([
      ['unreviewed', 'dismissed'],
      ['accepted', 'dismissed'],
    ]);
    expect(done.failed).toBeUndefined();
  });

  it('leaves alone a finding that already has the status', async () => {
    const p = port();
    const done = await decideLinked(p, [finding('a', 'dismissed')], 'dismissed');
    expect(p.findingsReview).not.toHaveBeenCalled();
    expect(done.changed).toEqual([]);
  });

  it('goes on past a refused finding and says which sentence the host gave', async () => {
    const p = port(['a']);
    const done = await decideLinked(p, [finding('a'), finding('b')], 'dismissed');
    expect(done.changed.map((c) => c.after.id)).toEqual(['b']);
    expect(done.failed).toBe('The evidence for a changed.');
  });

  it('puts each changed finding back to what it was, against the version the change answered', async () => {
    const p = port();
    const done = await decideLinked(p, [finding('a', 'deferred', 'later')], 'dismissed');
    p.findingsReview.mockClear();
    await restoreLinked(p, done.changed);
    expect(p.findingsReview).toHaveBeenCalledWith({ id: 'a', evidenceVersion: 'v-a', status: 'deferred', note: 'later' });
  });
});
