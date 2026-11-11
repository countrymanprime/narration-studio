// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '../primitives/Tooltip';
import { LiveTracksLine } from './LiveTracksStatus';
import type { LiveTracks } from './useLiveTracks';

vi.mock('../../hooks/useToasts', () => ({ useToasts: () => ({ notify: vi.fn() }) }));

afterEach(cleanup);

const live = (over: Partial<LiveTracks> = {}) =>
  ({
    reason: '',
    message: '',
    readAt: Date.now(),
    busy: false,
    refreshing: false,
    stale: false,
    error: '',
    source: 'live',
    recheck: vi.fn(),
    ...over,
  }) as unknown as LiveTracks;

// The status line and the read-again icon are one row wherever the tracks are shown without the Engine panel's header (#3415).
describe('LiveTracksLine', () => {
  it('draws the status and the read-again icon in one row', () => {
    render(
      <TooltipProvider>
        <LiveTracksLine live={live()} />
      </TooltipProvider>,
    );
    expect(screen.getByRole('status').textContent).toMatch(/REAPER’s tracks now/);
    expect(screen.getByRole('button', { name: 'Read the tracks from REAPER again' })).toBeTruthy();
  });

  it('says a failed read after a good one is old', () => {
    render(
      <TooltipProvider>
        <LiveTracksLine live={live({ stale: true, error: 'REAPER did not answer' })} />
      </TooltipProvider>,
    );
    expect(screen.getByRole('status').textContent).toMatch(/Can’t tell whether these are REAPER’s tracks now/);
  });
});
