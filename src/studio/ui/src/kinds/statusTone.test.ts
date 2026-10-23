import { describe, expect, it } from 'vitest';
import { STATUS_IDS, statusLabel, statusTone } from './statusTone';

describe('statusTone', () => {
  it('draws the decisions of section 4.4', () => {
    expect(statusTone('pickup')).toBe('accent');
    expect(statusTone('edit')).toBe('info');
    for (const id of ['waive', 'keep', 'fixed'] as const) expect(statusTone(id), id).toBe('success');
    for (const id of ['defer', 'unreviewed'] as const) expect(statusTone(id), id).toBe('neutral');
  });

  it('draws an open pickup as warning (D10), a failure as danger and Needs Review and Draft as warning (D7)', () => {
    expect(statusTone('open_pickup')).toBe('warning');
    expect(statusTone('needs_review')).toBe('warning');
    expect(statusTone('draft')).toBe('warning');
    for (const id of ['failed', 'fail', 'not_ready', 'behind', 'late'] as const) expect(statusTone(id), id).toBe('danger');
  });

  it('draws a take by its state alone (D11): kept success, active info, suggested accent, no hue for identity', () => {
    expect(statusTone('kept_take')).toBe('success');
    expect(statusTone('active_take')).toBe('info');
    expect(statusTone('suggested_take')).toBe('accent');
    expect(STATUS_IDS.filter((id) => id.includes('identity'))).toEqual([]);
  });

  it('puts in progress, downloading, verifying and checking on info, and not checked on neutral', () => {
    for (const id of ['in_progress', 'downloading', 'verifying', 'checking'] as const) expect(statusTone(id), id).toBe('info');
    expect(statusTone('not_checked')).toBe('neutral');
  });

  it('gives every status a label, and no label to two tones', () => {
    const toneOfLabel = new Map<string, string>();
    for (const id of STATUS_IDS) {
      expect(statusLabel(id).length, id).toBeGreaterThan(1);
      const known = toneOfLabel.get(statusLabel(id));
      if (known) expect(statusTone(id), `${statusLabel(id)} is drawn in two tones`).toBe(known);
      toneOfLabel.set(statusLabel(id), statusTone(id));
    }
  });
});
