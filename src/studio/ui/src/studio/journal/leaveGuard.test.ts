import { describe, expect, it, vi } from 'vitest';
import { createLeaveGuard, type ConfirmSpec } from './leaveGuard';

const spec: ConfirmSpec = { title: 'Leave while recording?', body: 'The take in progress will be lost.', confirmLabel: 'Leave' };

describe('leave guard', () => {
  it('leave-guard: allows when none is set', () => {
    expect(createLeaveGuard().checkLeave('/proof')).toBe('allow');
  });

  it('stores one guard and returns its answer for the destination', () => {
    const { setLeaveGuard, checkLeave } = createLeaveGuard();
    const guard = vi.fn((next: string) => (next === '/proof' ? { ask: spec } : ('allow' as const)));
    setLeaveGuard(guard);
    expect(checkLeave('/proof')).toEqual({ ask: spec });
    expect(checkLeave('/booth')).toBe('allow');
    expect(guard).toHaveBeenCalledWith('/proof');
  });

  it('keeps only the latest guard and drops it on null', () => {
    const { setLeaveGuard, checkLeave } = createLeaveGuard();
    setLeaveGuard(() => ({ ask: spec }));
    setLeaveGuard(() => 'allow');
    expect(checkLeave('/x')).toBe('allow');
    setLeaveGuard(() => ({ ask: spec }));
    setLeaveGuard(null);
    expect(checkLeave('/x')).toBe('allow');
  });

  it('lets a cancelLabel ride along on the spec', () => {
    const { setLeaveGuard, checkLeave } = createLeaveGuard();
    setLeaveGuard(() => ({ ask: { ...spec, cancelLabel: 'Stay' } }));
    expect(checkLeave('/x')).toEqual({ ask: { ...spec, cancelLabel: 'Stay' } });
  });
});
