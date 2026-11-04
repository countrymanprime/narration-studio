// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { OutputListing } from '../../voicesamples/audioOutputs';

const calls: Array<(listing: OutputListing) => void> = [];
vi.mock('../../voicesamples/audioOutputs', () => ({
  listAudioOutputs: () => new Promise<OutputListing>((resolve) => calls.push(resolve)),
}));

import { useOutputDevices } from './useOutputDevices';

afterEach(() => {
  cleanup();
  calls.length = 0;
});

const ok = (...labels: string[]): OutputListing => ({ status: 'ok', outputs: labels.map((label) => ({ id: label, label })) });

describe('reading this computer’s outputs (qa-breaker B4)', () => {
  it('an older answer that arrives after a newer one does not replace it', async () => {
    const { result } = renderHook(() => useOutputDevices());
    act(() => result.current.refresh());
    expect(calls).toHaveLength(2);
    await act(async () => calls[1]!(ok('Old', 'New speaker')));
    await act(async () => calls[0]!(ok('Old')));
    const listing = result.current.listing;
    expect(listing.phase === 'ready' && listing.status === 'ok' ? listing.outputs.map((o) => o.label) : []).toEqual(['Old', 'New speaker']);
  });
});
