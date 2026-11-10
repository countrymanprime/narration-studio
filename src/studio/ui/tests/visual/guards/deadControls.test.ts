import { describe, expect, test } from 'vitest';
import { DEAD_CONTROL_DEBT, DEAD_CONTROL_TIMER_DRIVEN } from './dead-controls-allowlist';

// The lists may only shrink and every line names the issue that owns the fix (#3276).
const MAX_DEBT = 0;
const MAX_TIMER_DRIVEN = 1;

describe('dead-control allowlist', () => {
  test('does not grow', () => {
    expect(Object.keys(DEAD_CONTROL_DEBT).length).toBeLessThanOrEqual(MAX_DEBT);
    expect(Object.keys(DEAD_CONTROL_TIMER_DRIVEN).length).toBeLessThanOrEqual(MAX_TIMER_DRIVEN);
  });

  test('every line names an issue', () => {
    for (const [control, issue] of [...Object.entries(DEAD_CONTROL_DEBT), ...Object.entries(DEAD_CONTROL_TIMER_DRIVEN)]) {
      expect(issue, control).toMatch(/^#\d+$/);
    }
  });
});
