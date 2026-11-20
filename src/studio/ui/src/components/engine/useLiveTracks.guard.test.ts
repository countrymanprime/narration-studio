import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LIVE_TRACKS_TIMEOUT_MS } from './useLiveTracks';

// The page gives a read up to LIVE_TRACKS_TIMEOUT_MS: it must outlast the host's own wait for REAPER (tracksLiveTimeout), or the page's
// "REAPER did not answer" fires before the host has fallen back to the saved project (#3645).
describe('the live tracks read limit against the host', () => {
  it('is above tracksLiveTimeout with room for the saved file and the binding', () => {
    const go = readFileSync(join(__dirname, '../../../../desktop/tracks_live.go'), 'utf8');
    const match = go.match(/\btracksLiveTimeout\s*=\s*(\d+)\s*\*\s*time\.Second/);
    expect(match, 'tracksLiveTimeout is not in tracks_live.go as N * time.Second').not.toBeNull();
    expect(LIVE_TRACKS_TIMEOUT_MS).toBeGreaterThanOrEqual(Number(match![1]) * 1000 + 2_000);
  });
});
