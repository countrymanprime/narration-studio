// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../../api/ApiContext';
import { createMockApi } from '../../../api/mockApi';
import { DAW_SETUPS } from '../../../fixtures/daw';
import { OverlayProvider } from '../../../overlay/OverlayProvider';
import { createOverlayService } from '../../../overlay/overlayService';
import { createMockDawClient } from '../../../ports/daw';
import { PortOverrides } from '../../../ports/usePort';
import { TooltipProvider } from '../../primitives/Tooltip';
import { ALL_DONE, CHAPTERS, MIXED, SPEECH } from './pickupFixtures';
import { pickupScript, sessionPickups } from './pickupRows';
import { SessionPanel } from './SessionPanel';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

type Props = Parameters<typeof SessionPanel>[0];

function setup(over: Partial<Props> = {}) {
  const service = createOverlayService();
  const onOpenInBooth = vi.fn();
  const onMarkersAdded = vi.fn();
  // The markers button makes the DAW call itself (#2830): the mock DAW answers it and its spy is what these tests read.
  const daw = createMockDawClient(DAW_SETUPS.reaper, { chapterIds: [], candidateIds: [], findingIds: [] });
  const addPickupMarkers = vi.spyOn(daw, 'addPickupMarkers');
  render(
    <ApiProvider api={createMockApi()}>
      <PortOverrides clients={{ daw }}>
        <TooltipProvider>
          <OverlayProvider service={service}>
            <SessionPanel
              pickups={MIXED}
              chapters={CHAPTERS}
              seconds={{ ok: true, value: 330 }}
              dawName="REAPER"
              markers={{ available: true }}
              onOpenInBooth={onOpenInBooth}
              onMarkersAdded={onMarkersAdded}
              {...over}
            />
          </OverlayProvider>
        </TooltipProvider>
      </PortOverrides>
    </ApiProvider>,
  );
  return { service, onOpenInBooth, onMarkersAdded, addPickupMarkers, user: userEvent.setup(), toasts: () => service.getSnapshot().toasts.map((t) => t.text) };
}

describe('SessionPanel', () => {
  it('session-panel-counts-included-open-lines', async () => {
    const { onOpenInBooth, user } = setup({ pickups: [...MIXED.slice(0, 2), { ...SPEECH, id: 'out', included: false }] });
    // Two open, included lines; the recorded and the left-out one do not count.
    expect(screen.getByText('Lines').nextElementSibling?.textContent).toBe('2');
    expect(screen.getByText('Length').nextElementSibling?.textContent).toBe('about 6 min');
    await user.click(screen.getByRole('button', { name: 'Open 2 in Booth' }));
    expect(onOpenInBooth).toHaveBeenCalledWith(sessionPickups(MIXED.slice(0, 2)));
  });

  it('Length is "not measured yet" without a source', () => {
    setup({ seconds: { ok: false, reason: 'no measurement' } });
    expect(screen.getByText('Length').nextElementSibling?.textContent).toBe('not measured yet');
  });

  it('Open N in Booth is off at zero but stays focusable and names why', async () => {
    const { onOpenInBooth, user } = setup({ pickups: ALL_DONE });
    const open = screen.getByRole('button', { name: 'Open 0 in Booth' });
    expect(open.hasAttribute('disabled')).toBe(false);
    expect(open.getAttribute('aria-disabled')).toBe('true');
    open.focus();
    expect(document.activeElement).toBe(open);
    expect(open.getAttribute('aria-describedby')).toBe(screen.getByText('Every line in view is recorded.').id);
    await user.click(open);
    await user.keyboard('{Enter}');
    expect(onOpenInBooth).not.toHaveBeenCalled();
  });

  it.each([
    ['no pickups at all', [], false, 'There are no pickups to include yet.'],
    ['every line left out', MIXED.slice(0, 2).map((p) => ({ ...p, included: false })), false, 'No lines in the session: tick a line to include it.'],
    ['a list that could not be read', [], true, 'The list could not be read, so the session is not known yet.'],
  ])('says what is true when the session is empty: %s', (_name, pickups, unreadable, sentence) => {
    setup({ pickups, unreadable });
    expect(screen.getByText(sentence)).toBeTruthy();
  });

  it('shows the count as not known, not 0, when the list could not be read', () => {
    setup({ pickups: [], unreadable: true });
    expect(screen.getByText('Lines').nextElementSibling?.textContent).toBe('not known');
  });

  it('names no count and turns markers off when the list could not be read', () => {
    setup({ pickups: [], unreadable: true });
    const markers = screen.getByRole('button', { name: 'Add as markers in REAPER' });
    expect(markers.getAttribute('aria-disabled')).toBe('true');
    expect(screen.queryByRole('button', { name: /Add 0 as markers/ })).toBeNull();
    expect(screen.getByRole('button', { name: 'Open in Booth' })).toBeTruthy();
  });

  it('adds the lines as markers and names the DAW', async () => {
    const { addPickupMarkers, onMarkersAdded, user } = setup({ pickups: MIXED.slice(0, 2) });
    await user.click(await screen.findByRole('button', { name: 'Add 2 as markers in REAPER' }));
    expect(addPickupMarkers.mock.calls[0][0].map((item) => item.ref)).toEqual(MIXED.slice(0, 2).map((p) => p.id));
    await waitFor(() => expect(onMarkersAdded).toHaveBeenCalledTimes(1));
  });

  it('shows the DAW’s refusal of markers as a toast', async () => {
    const { addPickupMarkers, user, toasts } = setup();
    addPickupMarkers.mockRejectedValueOnce(new Error('REAPER refused.'));
    await user.click(await screen.findByRole('button', { name: /^Add \d as markers in REAPER/ }));
    await waitFor(() => expect(toasts()).toEqual(['REAPER refused.']));
  });

  it('the markers icon is off without the capability, with its sentence', async () => {
    const { addPickupMarkers, user } = setup({ markers: { available: false, message: 'Markers are turned off for REAPER in Settings.' } });
    const icon = await screen.findByRole('button', { name: /as markers in REAPER/ });
    expect(icon.getAttribute('aria-disabled')).toBe('true');
    await user.hover(icon);
    expect(await screen.findByText('Markers are turned off for REAPER in Settings.')).toBeTruthy();
    await user.click(icon);
    expect(addPickupMarkers).not.toHaveBeenCalled();
  });

  // The reason is the shared button's tooltip (#2830), not a line of the card, so the card never grows (rule 8).
  it('keeps the markers reason out of the page flow: only the button’s hint carries it, so the panel does not grow', async () => {
    const { user } = setup({ markers: { available: false, message: 'Link a REAPER project (.rpp) file to add markers.' } });
    const icon = await screen.findByRole('button', { name: /as markers in REAPER/ });
    expect(screen.queryByText('Link a REAPER project (.rpp) file to add markers.')).toBeNull();
    await user.hover(icon);
    expect(await screen.findByText('Link a REAPER project (.rpp) file to add markers.')).toBeTruthy();
  });

  it('Copy puts the pickup script on the clipboard and says Copied.', async () => {
    const { user, toasts } = setup();
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined);
    await user.click(screen.getByRole('button', { name: 'Copy the pickup script' }));
    expect(writeText).toHaveBeenCalledWith(pickupScript(sessionPickups(MIXED), CHAPTERS));
    await waitFor(() => expect(toasts()).toEqual(['Copied.']));
  });

  it('Copy says Copy failed. when the clipboard refuses', async () => {
    const { user, toasts } = setup();
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('no'));
    await user.click(screen.getByRole('button', { name: 'Copy the pickup script' }));
    await waitFor(() => expect(toasts()).toEqual([expect.stringContaining('could not be copied')]));
  });
});

describe('SessionPanel loading state', () => {
  it('session-panel-loading-shows-blocks-not-a-count-or-an-empty-reason', () => {
    setup({ pickups: [], loading: true });
    // The table's region announces the read; the panel adds no second status.
    expect(screen.queryByText('Reading the pickup list…')).toBeNull();
    expect(screen.queryByText('There are no pickups to include yet.')).toBeNull();
    expect(screen.getByText('Lines').nextElementSibling?.textContent).toBe('');
    expect(screen.getByText('Length').nextElementSibling?.textContent).toBe('');
    // No count until the list is read (XPK-15).
    expect(screen.getByRole('button', { name: 'Open in Booth' }).getAttribute('aria-describedby')).toBeNull();
  });

  it('session-panel-loaded-says-its-counts', () => {
    setup({ pickups: [] });
    expect(screen.getByText('Lines').nextElementSibling?.textContent).toBe('0');
    expect(screen.getByText('There are no pickups to include yet.')).toBeTruthy();
  });

  it('session-panel-unreadable-is-not-a-loading-state', () => {
    setup({ pickups: [], unreadable: true });
    expect(screen.getByText('not known')).toBeTruthy();
  });
});

// Alignment audit (#2251), the Pickup session panel.
describe('session-panel-alignment', () => {
  it('a status in words is muted and regular, only a number is bold mono (XPK-14)', () => {
    setup({ seconds: { ok: false, reason: 'no measurement' } });
    const value = screen.getByText('not measured yet');
    expect(value.tagName).toBe('SPAN');
    expect(value.className).toContain('text-[var(--text-muted)]');
    expect(screen.getByText('Lines').nextElementSibling?.tagName).toBe('B');
  });

  it('an empty session has no length to measure and an outlined Booth button (XPK-14, R3PK-3)', () => {
    setup({ pickups: [] });
    expect(screen.getByText('Length').nextElementSibling?.textContent).toBe('no lines');
    expect(screen.getByRole('button', { name: 'Open 0 in Booth' }).className).not.toContain('bg-[var(--accent)]');
  });

  it('the markers button sits beside Open in Booth, in one row (XPK-4)', () => {
    setup();
    const booth = screen.getByRole('button', { name: /^Open \d+ in Booth$/ });
    const markers = screen.getByRole('button', { name: /as markers in/ });
    expect(booth.parentElement).toBe(markers.closest('div.grid'));
  });

  it('the empty reason does not leave one word on a line (R3PK-6)', () => {
    setup({ pickups: [], unreadable: true });
    expect(screen.getByText('The list could not be read, so the session is not known yet.').className).toContain('text-pretty');
  });
});
