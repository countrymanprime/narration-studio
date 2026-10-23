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
import { InspectorActions, type InspectorActionsApi } from './InspectorActions';
import { inspectorFinding } from './testFinding';

afterEach(cleanup);

const placed = (overrides: Partial<Finding> = {}) =>
  inspectorFinding({
    source: { item_guid: 'g1' },
    time_range: { start: 12.4, end: 14, source_start: 10, source_end: 11 },
    manuscript: { expected: 'a', recorded: 'b', chapter_id: 'chapter-1' },
    ...overrides,
  });
const accepted = () => placed({ review: { status: 'accepted' } });

function setup(finding: Finding, setupId: DawSetupId = 'reaper', props: { inert?: boolean } = {}) {
  const daw: DawClient = createMockDawClient(DAW_SETUPS[setupId], { chapterIds: [], candidateIds: [], findingIds: ['f1'] });
  const addMarker = vi.spyOn(daw, 'addMarker');
  const api: InspectorActionsApi = { findingsGoTo: vi.fn(async () => ({ outcome: 'navigated' as const, projectTime: 12.4 })) };
  const handlers = { onOpenScript: vi.fn(), onOpenBooth: vi.fn(), onReopen: vi.fn() };
  render(
    <ApiProvider api={createMockApi()}>
      <PortOverrides clients={{ daw }}>
        <InspectorActions finding={finding} api={api} {...props} {...handlers} />
      </PortOverrides>
    </ApiProvider>,
  );
  return { api, addMarker, ...handlers };
}

const button = (name: string) => screen.getByRole('button', { name });
const enabled = (name: string) => button(name).getAttribute('aria-disabled') !== 'true' && !(button(name) as HTMLButtonElement).disabled;

describe('actions-follow-the-daw-capability', () => {
  it('turns Show in REAPER on and calls findingsGoTo, then shows the result', async () => {
    const t = setup(placed());
    await waitFor(() => expect(enabled('Show in REAPER')).toBe(true));
    await userEvent.click(button('Show in REAPER'));
    expect(t.api.findingsGoTo).toHaveBeenCalledWith('f1');
    expect((await screen.findByRole('status')).textContent).toBe('Moved to 00:12.4 in REAPER.');
  });

  it('turns Add marker on for an accepted note and calls DawClient.addMarker', async () => {
    const t = setup(accepted());
    await waitFor(() => expect(enabled('Add marker in REAPER')).toBe(true));
    await userEvent.click(button('Add marker in REAPER'));
    expect(t.addMarker).toHaveBeenCalledWith('f1');
    await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/Marker added/));
  });

  it('turns Add marker on for a note that is not accepted', async () => {
    const t = setup(placed());
    await waitFor(() => expect(enabled('Add marker in REAPER')).toBe(true));
    await userEvent.click(button('Add marker in REAPER'));
    expect(t.addMarker).toHaveBeenCalledWith('f1');
  });

  it('names the DAW the report names', async () => {
    setup(placed(), 'audacity');
    await waitFor(() => expect(screen.getByRole('button', { name: /^Show in Audacity/ })).toBeTruthy());
    expect(screen.getByRole('button', { name: /^Add marker in Audacity/ })).toBeTruthy();
  });

  it('turns both off with the capability’s own sentence when the DAW offers neither', async () => {
    setup(accepted(), 'builtin');
    const sentence = DAW_SETUPS.builtin.capabilities.navigate.message!;
    await waitFor(() => expect(screen.getByText(sentence)).toBeTruthy());
    expect(enabled('Show in the DAW')).toBe(false);
    expect(enabled('Add marker in the DAW')).toBe(false);
  });

  it('shows a refusal from the DAW as an alert', async () => {
    const t = setup(placed());
    vi.mocked(t.api.findingsGoTo).mockResolvedValue({ outcome: 'refused', reason: 'no_item', message: 'Nothing to go to.' });
    await waitFor(() => expect(enabled('Show in REAPER')).toBe(true));
    await userEvent.click(button('Show in REAPER'));
    expect((await screen.findByRole('alert')).textContent).toBe('Nothing to go to.');
  });
});

describe('open-in-script-and-booth-are-links-not-moves', () => {
  it('calls the props with the note’s chapter', async () => {
    const t = setup(placed());
    await userEvent.click(button('Open this chapter in Script'));
    await userEvent.click(button('Open this chapter in Booth'));
    expect(t.onOpenScript).toHaveBeenCalledWith('chapter-1');
    expect(t.onOpenBooth).toHaveBeenCalledWith('chapter-1');
  });

  it('turns both off for a note with no chapter', () => {
    setup(placed({ manuscript: { expected: 'a', recorded: 'b' } }));
    expect(enabled('Open this chapter in Script')).toBe(false);
  });
});

describe('reopen-appears-only-when-decided', () => {
  it('has no Reopen for an undecided note and calls onReopen for a decided one', async () => {
    setup(placed());
    expect(screen.queryByRole('button', { name: 'Reopen' })).toBeNull();
    cleanup();
    const t = setup(accepted());
    await userEvent.click(button('Reopen'));
    expect(t.onReopen).toHaveBeenCalledTimes(1);
  });
});

describe('note-steps-and-banner-are-the-merged-ones', () => {
  it('is inert while the evidence is changed', async () => {
    const t = setup(accepted(), 'reaper', { inert: true });
    await screen.findByRole('button', { name: 'Show in REAPER' });
    for (const name of ['Show in REAPER', 'Add marker in REAPER', 'Open this chapter in Script', 'Reopen']) expect(enabled(name)).toBe(false);
    await userEvent.click(button('Open this chapter in Script'));
    expect(t.onOpenScript).not.toHaveBeenCalled();
  });
});
