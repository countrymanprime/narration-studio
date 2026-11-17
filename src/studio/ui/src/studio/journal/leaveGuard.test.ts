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

  // #3555: the page's own render reads whether a question would be asked; that must not look like the shell asking before a move.
  it('a peek tells the guard it is only a peek, a check does not, and a peek with no guard allows', () => {
    const { setLeaveGuard, checkLeave, peekLeave } = createLeaveGuard();
    expect(peekLeave('/script')).toBe('allow');
    const guard = vi.fn(() => 'allow' as const);
    setLeaveGuard(guard);
    checkLeave('/script');
    expect(guard).toHaveBeenLastCalledWith('/script');
    peekLeave('/booth');
    expect(guard).toHaveBeenLastCalledWith('/booth', { peek: true });
  });
});
