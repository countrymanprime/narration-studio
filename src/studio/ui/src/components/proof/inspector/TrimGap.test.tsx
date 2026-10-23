// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../../api/ApiContext';
import { createMockApi } from '../../../api/mockApi';
import { DAW_SETUPS, type DawSetupId } from '../../../fixtures/daw';
import { createMockDawClient } from '../../../ports/daw';
import type { DawClient } from '../../../ports';
import { PortOverrides } from '../../../ports/usePort';
import type { Finding } from '../../../types';
import { TRIM_LABEL, TrimGap, trimmableGap } from './TrimGap';
import { inspectorFinding } from './testFinding';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/** A 3 s gap the pacing check found at 20 s of chapter-1, on item g1. */
const gap = (overrides: Partial<Finding> = {}) =>
  inspectorFinding({
    analyzer: 'pacing',
    category: 'pacing',
    source: { item_guid: 'g1' },
    time_range: { start: 20, end: 23 },
    manuscript: { chapter_id: 'chapter-1' },
    evidence: { duration_seconds: 3 },
    ...overrides,
  });

function setup(finding: Finding, setupId: DawSetupId = 'reaper') {
  const daw: DawClient = createMockDawClient(DAW_SETUPS[setupId], {
    chapterIds: ['chapter-1'],
    candidateIds: [],
    findingIds: [],
    trimItems: { g1: { start: 0, length: 60 } },
  });
  const trimRange = vi.spyOn(daw, 'trimRange');
  const onTrimmed = vi.fn();
  render(
    <ApiProvider api={createMockApi()}>
      <PortOverrides clients={{ daw }}>
        <TrimGap finding={finding} inert={false} onTrimmed={onTrimmed} />
      </PortOverrides>
    </ApiProvider>,
  );
  return { trimRange, onTrimmed };
}

const trim = () => screen.getByRole('button', { name: TRIM_LABEL });
const on = () => trim().getAttribute('aria-disabled') !== 'true' && !(trim() as HTMLButtonElement).disabled;

describe('trim-the-gap-on-proof', () => {
  it('is offered for a gap note not decided yet, and for nothing else', () => {
    expect(trimmableGap(gap())).toBe(true);
    expect(trimmableGap(gap({ review: { status: 'deferred' } }))).toBe(false);
    expect(trimmableGap(inspectorFinding())).toBe(false);
  });

  it('trims a single gap as one DAW change through Editing’s gap operation, then decides the note', async () => {
    const t = setup(gap());
    await waitFor(() => expect(on()).toBe(true));
    await userEvent.click(trim());
    await waitFor(() => expect(t.trimRange).toHaveBeenCalledOnce());
    expect(t.trimRange).toHaveBeenCalledWith(expect.objectContaining({ chapterId: 'chapter-1', itemId: 'g1', start: 21.2, end: 23 }));
    await waitFor(() => expect(t.onTrimmed).toHaveBeenCalledOnce());
    expect(screen.getByRole('status').textContent).toMatch(/^Hid 1 on the muted Cuts track\. Undo it with Edit > Undo in REAPER\.$/);
  });

  it('is off where the DAW cannot cut a range now', async () => {
    const t = setup(gap(), 'reaper-off');
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(on()).toBe(false);
    await userEvent.click(trim());
    expect(t.trimRange).not.toHaveBeenCalled();
  });

  it('is off for a gap already at the limit', async () => {
    const t = setup(gap({ time_range: { start: 20, end: 21 }, evidence: { duration_seconds: 1 } }));
    await waitFor(() => expect(screen.getByRole('button', { name: TRIM_LABEL })).toBeTruthy());
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(on()).toBe(false);
    expect(t.trimRange).not.toHaveBeenCalled();
  });
});
