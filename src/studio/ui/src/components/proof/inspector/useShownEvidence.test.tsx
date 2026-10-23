// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Finding } from '../../../types';
import { inspectorFinding } from './testFinding';
import { STALE_DECISION_SENTENCE, useShownEvidence, type InspectorApi } from './useShownEvidence';

const ORDER = ['f1', 'f2', 'f3'];

function setup(initial: Finding = inspectorFinding(), overrides: Partial<InspectorApi> = {}) {
  const findingsReview = vi.fn(async (request: { id: string; evidenceVersion: string; status: Finding['review']['status']; note: string }) =>
    inspectorFinding({ id: request.id, version: request.evidenceVersion, review: { status: request.status, note: request.note } }),
  );
  const findingsGet = vi.fn(async (id: string) => inspectorFinding({ id }));
  const api: InspectorApi = { findingsReview, findingsGet, ...overrides };
  const onSelect = vi.fn();
  const onChanged = vi.fn();
  const view = renderHook(({ finding }) => useShownEvidence({ api, finding, order: ORDER, onSelect, onChanged }), { initialProps: { finding: initial } });
  const recheck = (next: Finding) => view.rerender({ finding: next });
  return { ...view, api, findingsReview, findingsGet, onSelect, onChanged, recheck };
}

const changed = (id = 'f1') => inspectorFinding({ id, version: 'v2', heard: 'I could not help it' });

describe('use-new-evidence-takes-the-new-finding-as-shown', () => {
  it('clears the banner and sends the next decision with the new evidence version', async () => {
    const t = setup();
    t.recheck(changed());
    expect(t.result.current.change).not.toBeNull();
    act(() => t.result.current.useNewEvidence());
    expect(t.result.current.change).toBeNull();
    await act(async () => {
      await t.result.current.decide('dismissed');
    });
    expect(t.findingsReview).toHaveBeenCalledWith({ id: 'f1', evidenceVersion: 'v2', status: 'dismissed', note: '' });
  });
});

describe('decision-is-refused-while-the-evidence-is-changed', () => {
  it('answers with the sentence, calls the host zero times and records nothing', async () => {
    const t = setup();
    t.recheck(changed());
    let outcome: Awaited<ReturnType<typeof t.result.current.decide>> | undefined;
    await act(async () => {
      outcome = await t.result.current.decide('accepted');
    });
    expect(outcome).toEqual({ ok: false, message: 'The evidence for this note changed since you looked at it. Read what changed, then decide.' });
    expect(STALE_DECISION_SENTENCE).toBe(outcome && !outcome.ok ? outcome.message : '');
    expect(t.findingsReview).not.toHaveBeenCalled();
    expect(t.onChanged).not.toHaveBeenCalled();
  });
});

describe('typed-note-survives-a-recheck', () => {
  it('keeps the typed text when the finding is replaced and sends it with the decision on the new evidence', async () => {
    const t = setup();
    act(() => t.result.current.setNote('  Still sounds skipped '));
    t.recheck(changed());
    expect(t.result.current.note).toBe('  Still sounds skipped ');
    act(() => t.result.current.useNewEvidence());
    await act(async () => {
      await t.result.current.decide('dismissed');
    });
    expect(t.findingsReview).toHaveBeenCalledWith({ id: 'f1', evidenceVersion: 'v2', status: 'dismissed', note: 'Still sounds skipped' });
  });

  it('starts from the other finding’s own note when the selection moves', () => {
    const t = setup();
    act(() => t.result.current.setNote('typed'));
    t.recheck(inspectorFinding({ id: 'f2', review: { status: 'accepted', note: 'earlier' } }));
    expect(t.result.current.note).toBe('earlier');
  });
});

describe('keyboard-decisions-are-refused-the-same-way', () => {
  it('refuses every decision status and both step directions through the one handler', async () => {
    const t = setup(inspectorFinding({ id: 'f2' }));
    t.recheck(changed('f2'));
    for (const status of ['accepted', 'dismissed', 'deferred', 'unreviewed'] as const) {
      await act(async () => {
        expect(await t.result.current.decide(status)).toEqual({ ok: false, message: STALE_DECISION_SENTENCE });
      });
    }
    expect(t.result.current.step(-1)).toEqual({ ok: false, message: STALE_DECISION_SENTENCE });
    expect(t.result.current.step(1)).toEqual({ ok: false, message: STALE_DECISION_SENTENCE });
    expect(t.findingsReview).not.toHaveBeenCalled();
    expect(t.onSelect).not.toHaveBeenCalled();
  });
});

describe('a-recheck-that-hears-the-same-thing-changes-nothing', () => {
  it('replaces the finding silently when the version is the same', () => {
    const t = setup();
    t.recheck(inspectorFinding({ heard: 'a different transcript of the same evidence' }));
    expect(t.result.current.change).toBeNull();
    expect(t.result.current.shown.manuscript?.recorded).toBe('a different transcript of the same evidence');
  });
});

describe('note-steps-move-and-stop-at-the-ends', () => {
  it('selects the previous and next note and reports the ends', () => {
    const middle = setup(inspectorFinding({ id: 'f2' }));
    expect(middle.result.current.canPrev).toBe(true);
    expect(middle.result.current.canNext).toBe(true);
    act(() => void middle.result.current.step(1));
    expect(middle.onSelect).toHaveBeenLastCalledWith('f3');
    act(() => void middle.result.current.step(-1));
    expect(middle.onSelect).toHaveBeenLastCalledWith('f1');

    const first = setup(inspectorFinding({ id: 'f1' }));
    expect(first.result.current.canPrev).toBe(false);
    expect(first.result.current.step(-1)).toEqual({ ok: true });
    expect(first.onSelect).not.toHaveBeenCalled();

    const last = setup(inspectorFinding({ id: 'f3' }));
    expect(last.result.current.canNext).toBe(false);
    last.result.current.step(1);
    expect(last.onSelect).not.toHaveBeenCalled();
  });
});

describe('host-refusal-still-explained', () => {
  it('reads the finding again, shows the banner and keeps the note when the host refuses a stale version', async () => {
    const findingsReview = vi.fn(async () => {
      throw new Error('the evidence changed');
    });
    const findingsGet = vi.fn(async () => changed());
    const t = setup(inspectorFinding(), { findingsReview, findingsGet });
    act(() => t.result.current.setNote('keep me'));
    let outcome: Awaited<ReturnType<typeof t.result.current.decide>> | undefined;
    await act(async () => {
      outcome = await t.result.current.decide('accepted');
    });
    expect(findingsReview).toHaveBeenCalledTimes(1);
    expect(outcome).toEqual({ ok: false, message: STALE_DECISION_SENTENCE });
    expect(t.result.current.change).toMatchObject({ wasKey: 'v1', nowKey: 'v2' });
    expect(t.result.current.note).toBe('keep me');
    expect(t.onChanged).toHaveBeenCalledWith(expect.objectContaining({ id: 'f1', evidence_version: 'v2' }), false);
  });

  it('reports a refusal that is not about the evidence in the host’s words', async () => {
    const findingsReview = vi.fn(async () => {
      throw new Error('disk full');
    });
    const t = setup(inspectorFinding(), { findingsReview });
    let outcome: Awaited<ReturnType<typeof t.result.current.decide>> | undefined;
    await act(async () => {
      outcome = await t.result.current.decide('accepted');
    });
    expect(outcome).toEqual({ ok: false, message: 'Not saved: disk full' });
    expect(t.result.current.change).toBeNull();
  });
});

describe('a decision that goes through', () => {
  it('hands the host’s finding back as decided and shows it', async () => {
    const t = setup();
    await act(async () => {
      expect(await t.result.current.decide('deferred')).toEqual({ ok: true });
    });
    expect(t.onChanged).toHaveBeenCalledWith(expect.objectContaining({ review: { status: 'deferred', note: '' } }), true);
  });
});
