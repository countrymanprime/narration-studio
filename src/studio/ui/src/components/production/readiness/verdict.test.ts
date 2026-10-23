import { describe, expect, it } from 'vitest';
import { recommendation, signal } from './readinessFixtures';
import { evidenceRows, readinessOf, verdictOf, VERDICT_LABEL } from './verdict';

describe('verdict-from-the-recommendation', () => {
  it('maps the host verdict to one of the six verdicts', () => {
    expect(verdictOf(recommendation())).toBe('ready');
    expect(verdictOf(recommendation({ verdict: 'not_ready', signals: [signal('recording.text_present', 'not_met')] }))).toBe('notready');
    expect(verdictOf(recommendation({ verdict: 'unknown', causes: ['never_analyzed'] }))).toBe('notchecked');
    expect(verdictOf(recommendation({ verdict: 'unknown', causes: ['analysis_running'] }))).toBe('progress');
    expect(verdictOf(recommendation({ verdict: 'none', target: undefined, basisKey: undefined, signals: [] }))).toBe('notchecked');
    expect(verdictOf(recommendation({ verdict: 'dismissed' }))).toBe('notchecked');
  });

  it('a live confirmation with nothing to suggest is confirmed; moved evidence under it is changed', () => {
    const confirmation = { from: 'recording', target: 'editing', basisKey: 'basis-a', at: '2026-09-21T10:00:00Z', evidenceChanged: false } as const;
    expect(verdictOf(recommendation({ verdict: 'none', confirmation, basisKey: undefined, target: undefined }))).toBe('confirmed');
    const contradiction = { revertTo: 'recording', signals: [signal('recording.text_present', 'not_met')] } as const;
    expect(verdictOf(recommendation({ verdict: 'none', confirmation, contradiction: { ...contradiction, signals: [...contradiction.signals] } }))).toBe(
      'changed',
    );
  });

  it('a basis that moved since the narrator read the suggestion is changed', () => {
    const seen = recommendation();
    expect(verdictOf(recommendation({ basisKey: 'basis-b' }), seen)).toBe('changed');
    expect(verdictOf(recommendation(), seen)).toBe('ready');
  });

  it('every verdict has words for its tooltip', () => {
    expect(Object.values(VERDICT_LABEL)).toEqual(['Ready', 'Not ready', 'Not checked', 'In progress', 'Evidence changed', 'Confirmed']);
  });
});

describe('panel-lists-only-measured-evidence', () => {
  it('draws a row for each measured signal and none for an unmeasured one', () => {
    const rows = evidenceRows(
      recommendation({
        signals: [
          signal('recording.text_present', 'met', 'All there.'),
          signal('proofing.pickups', 'not_met', '3 pickups left.'),
          signal('proofing.delivery.rms_dbfs', 'unknown', 'Not measured.', 'measurement_unavailable'),
        ],
      }),
    );
    expect(rows.map((row) => [row.id, row.state, row.value, row.note])).toEqual([
      ['recording.text_present', 'met', 'Met', 'All there.'],
      ['proofing.pickups', 'unmet', 'Not met', '3 pickups left.'],
    ]);
  });

  it('names the unmet signals in the not-ready sentence', () => {
    const model = readinessOf(recommendation({ verdict: 'not_ready', signals: [signal('proofing.pickups', 'not_met')] }));
    expect(model.headline).toBe('Not ready to move to Editing');
    expect(model.sub).toBe('No pickups are left to clear up not met');
  });
});

describe('changed-evidence-shows-was-and-now', () => {
  it('lists each moved signal as was and now, and the date it is changed since', () => {
    const model = readinessOf(
      recommendation({
        verdict: 'none',
        confirmation: { from: 'recording', target: 'editing', basisKey: 'basis-a', at: '2026-09-21T10:00:00Z', evidenceChanged: true },
        contradiction: { revertTo: 'recording', signals: [signal('recording.text_present', 'not_met')] },
      }),
    );
    expect(model.verdict).toBe('changed');
    expect(model.changes).toEqual([
      { id: 'recording.text_present', label: 'Every paragraph of the chapter’s text is in the recording, in order', was: 'Met', now: 'Not met' },
    ]);
    expect(model.changedSince).toBe('2026-09-21T10:00:00Z');
  });

  it('diffs against the suggestion the narrator saw', () => {
    const seen = recommendation();
    const now = recommendation({ basisKey: 'basis-b', signals: [signal('recording.text_present', 'not_met')], verdict: 'not_ready' });
    expect(readinessOf(now, seen).changes).toEqual([expect.objectContaining({ was: 'Met', now: 'Not met' })]);
  });
});

describe('cannot-confirm-what-is-not-ready', () => {
  it('Confirm only for ready; Dismiss for ready and changed', () => {
    expect(readinessOf(recommendation())).toMatchObject({ canConfirm: true, canDismiss: true });
    expect(readinessOf(recommendation({ verdict: 'not_ready' }))).toMatchObject({ canConfirm: false, canDismiss: false });
    expect(readinessOf(recommendation({ basisKey: 'basis-b' }), recommendation())).toMatchObject({ canConfirm: false, canDismiss: true });
    expect(readinessOf(recommendation({ verdict: 'dismissed' }))).toMatchObject({ canConfirm: false, canDismiss: false });
  });
});
