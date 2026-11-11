// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TracksProject } from '../../api/contracts/tracks';
import { createOverlayService } from '../../overlay/overlayService';
import { LiveTracksRefresh } from './LiveTracksStatus';
import { TRACKS_READ_TOPIC, type LiveTracks } from './useLiveTracks';

const notify = vi.fn();
vi.mock('../../hooks/useToasts', () => ({ useToasts: () => ({ notify }) }));

afterEach(() => {
  cleanup();
  notify.mockClear();
});

const project = (count: number): TracksProject => ({
  path: 'a.rpp',
  tracks: Array.from({ length: count }, (_, index) => ({ index }) as TracksProject['tracks'][number]),
});
const liveWith = (recheck: LiveTracks['recheck']) => ({ refreshing: false, recheck }) as unknown as LiveTracks;

// "Read the tracks from REAPER again" found nothing new and said nothing: only "read N s ago" in a truncated line moved (#3339).
describe('Read the tracks from REAPER again', () => {
  it('answers each press with what was read, even when nothing changed', async () => {
    const recheck = vi.fn(async () => ({ project: project(2), source: 'live' as const, failed: false }));
    render(<LiveTracksRefresh live={liveWith(recheck)} />);
    fireEvent.click(screen.getByRole('button', { name: 'Read the tracks from REAPER again' }));
    // One topic with the read's failure toast, so an answer replaces a stale error instead of standing beside it.
    await waitFor(() => expect(notify).toHaveBeenCalledWith('Read 2 tracks from REAPER.', 'info', undefined, undefined, undefined, TRACKS_READ_TOPIC));
    fireEvent.click(screen.getByRole('button', { name: 'Read the tracks from REAPER again' }));
    await waitFor(() => expect(notify).toHaveBeenCalledTimes(2));
  });

  it('says "1 track" for one', async () => {
    render(<LiveTracksRefresh live={liveWith(vi.fn(async () => ({ project: project(1), source: 'live' as const, failed: false })))} />);
    fireEvent.click(screen.getByRole('button', { name: 'Read the tracks from REAPER again' }));
    await waitFor(() => expect(notify).toHaveBeenCalledWith('Read 1 track from REAPER.', 'info', undefined, undefined, undefined, TRACKS_READ_TOPIC));
  });

  it('says the saved project was read when REAPER did not answer, and adds nothing when the read failed (its own toast says so)', async () => {
    const saved = vi.fn(async () => ({ project: project(1), source: 'saved' as const, failed: false }));
    const { rerender } = render(<LiveTracksRefresh live={liveWith(saved)} />);
    fireEvent.click(screen.getByRole('button'));
    await waitFor(() =>
      expect(notify).toHaveBeenCalledWith('Read the tracks in the saved project.', 'info', undefined, undefined, undefined, TRACKS_READ_TOPIC),
    );
    notify.mockClear();
    const failed = vi.fn(async () => ({ failed: true }));
    rerender(<LiveTracksRefresh live={liveWith(failed)} />);
    fireEvent.click(screen.getByRole('button'));
    await waitFor(() => expect(failed).toHaveBeenCalled());
    expect(notify).not.toHaveBeenCalled();
  });
});

describe('a read failure and the answer that follows it', () => {
  it('share one toast topic, so the answer replaces the stale error (the overlay replaces by topic)', () => {
    const service = createOverlayService();
    service.toast('REAPER did not answer in time.', { tone: 'error', topic: TRACKS_READ_TOPIC });
    service.toast('Read 8 tracks from REAPER.', { topic: TRACKS_READ_TOPIC });
    expect(service.getSnapshot().toasts.map((toast) => toast.text)).toEqual(['Read 8 tracks from REAPER.']);
  });
});
