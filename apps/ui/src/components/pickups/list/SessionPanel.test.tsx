// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OverlayProvider } from '../../../overlay/OverlayProvider';
import { createOverlayService } from '../../../overlay/overlayService';
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
  const onAddMarkers = vi.fn().mockResolvedValue(undefined);
  render(
    <TooltipProvider>
      <OverlayProvider service={service}>
        <SessionPanel
          pickups={MIXED}
          chapters={CHAPTERS}
          seconds={{ ok: true, value: 330 }}
          dawName="REAPER"
          markers={{ available: true }}
          onOpenInBooth={onOpenInBooth}
          onAddMarkers={onAddMarkers}
          {...over}
        />
      </OverlayProvider>
    </TooltipProvider>,
  );
  return { service, onOpenInBooth, onAddMarkers, user: userEvent.setup(), toasts: () => service.getSnapshot().toasts.map((t) => t.text) };
}

describe('SessionPanel', () => {
  it('session-panel-counts-included-open-lines', async () => {
    const { onOpenInBooth, user } = setup({ pickups: [...MIXED.slice(0, 2), { ...SPEECH, id: 'out', included: false }] });
    // Two open, included lines; the recorded and the left-out one do not count.
    expect(screen.getByText('Lines').nextElementSibling?.textContent).toBe('2');
    expect(screen.getByText('About').nextElementSibling?.textContent).toBe('6 min');
    await user.click(screen.getByRole('button', { name: 'Open 2 in Booth' }));
    expect(onOpenInBooth).toHaveBeenCalledWith(sessionPickups(MIXED.slice(0, 2)));
  });

  it('About is "not measured yet" without a source', () => {
    setup({ seconds: { ok: false, reason: 'no measurement' } });
    expect(screen.getByText('About').nextElementSibling?.textContent).toBe('not measured yet');
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

  it('adds the lines as markers and names the DAW', async () => {
    const { onAddMarkers, user } = setup({ pickups: MIXED.slice(0, 2) });
    await user.click(screen.getByRole('button', { name: 'Add 2 as markers in REAPER' }));
    expect(onAddMarkers).toHaveBeenCalledWith(MIXED.slice(0, 2));
  });

  it('shows the DAW’s refusal of markers as a toast', async () => {
    const { onAddMarkers, user, toasts } = setup();
    onAddMarkers.mockRejectedValueOnce(new Error('REAPER refused.'));
    await user.click(screen.getByRole('button', { name: /^Add \d as markers in REAPER/ }));
    await waitFor(() => expect(toasts()).toEqual(['REAPER refused.']));
  });

  it('the markers icon is off without the capability, with its sentence', async () => {
    const { onAddMarkers, user } = setup({ markers: { available: false, message: 'Markers are turned off for REAPER in Settings.' } });
    const icon = screen.getByRole('button', { name: /as markers in REAPER/ });
    expect(icon.getAttribute('aria-disabled')).toBe('true');
    expect(icon.getAttribute('aria-describedby')).toBe(screen.getByText('Markers are turned off for REAPER in Settings.').id);
    await user.click(icon);
    expect(onAddMarkers).not.toHaveBeenCalled();
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
    expect(screen.getByText('About').nextElementSibling?.textContent).toBe('');
    expect(screen.getByRole('button', { name: 'Open 0 in Booth' }).getAttribute('aria-describedby')).toBeNull();
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
