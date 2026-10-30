// @vitest-environment jsdom
// Audit clusters 9 and 10 (docs/research/ui-function-audit.md): every reader of "is the DAW recording" and "could Record work" flips on the same
// DAW event. The readers are mounted under one session; a DAW event sequence (record, stop, REAPER going away) must change all of them together.
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../api/ApiContext';
import type { DawCapabilities, DawTransport } from '../api/contracts/daw';
import { createMockApi } from '../api/mockApi';
import { useBoothRecording } from '../components/booth/useBoothRecording';
import { useCanRecord } from '../components/booth/record/useCanRecord';
import { useSamplePlayer } from '../components/voicesamples/useSamplePlayer';
import { DAW_SETUPS } from '../fixtures/daw';
import { useDawRecording } from '../input/useDawRecording';
import type { NarrationApi } from '../types';
import { useCapability } from '../useCapability';
import { useIsRecording } from './useIsRecording';

afterEach(cleanup);

const REAPER: DawCapabilities = DAW_SETUPS.reaper;
const GONE: DawCapabilities = {
  ...REAPER,
  reachable: false,
  capabilities: { ...REAPER.capabilities, record: { level: 'experimental', available: false, reason: 'not_running', message: 'REAPER is not running.' } },
};

function spyApi() {
  const base = createMockApi();
  const capSubs = new Set<(caps: DawCapabilities) => void>();
  const transportSubs = new Set<(transport: DawTransport) => void>();
  const api: NarrationApi = {
    ...base,
    dawCapabilities: async () => REAPER,
    subscribeDawCapabilities: (onUpdate) => (capSubs.add(onUpdate), () => capSubs.delete(onUpdate)),
    subscribeDawTransport: (onUpdate) => (transportSubs.add(onUpdate), () => transportSubs.delete(onUpdate)),
  };
  return {
    api,
    pushCaps: (next: DawCapabilities) => capSubs.forEach((listener) => listener(next)),
    pushTransport: (next: DawTransport) => transportSubs.forEach((listener) => listener(next)),
  };
}

describe('the DAW events reach every reader of recording and can-record together', () => {
  it('flips the session readers, the router gate, the Booth guard and a page-less sample player on one transport event, and can-record on a capability event', async () => {
    const spy = spyApi();
    const notify = vi.fn();
    let play: (id: string) => boolean = () => true;
    let routerGate: () => boolean = () => false;
    function Readers() {
      const recording = useIsRecording();
      const booth = useBoothRecording(true);
      const can = useCanRecord();
      const capability = useCapability('record');
      const player = useSamplePlayer({ notify });
      play = player.play;
      routerGate = useDawRecording();
      return (
        <>
          <output data-testid="recording">{String(recording)}</output>
          <output data-testid="booth">{String(booth)}</output>
          <output data-testid="can">{String(can.ok)}</output>
          <output data-testid="capability">{String(capability.available)}</output>
        </>
      );
    }
    render(
      <ApiProvider api={spy.api}>
        <Readers />
      </ApiProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('can').textContent).toBe('true'));
    expect(screen.getByTestId('capability').textContent).toBe('true');

    act(() => spy.pushTransport({ playing: false, recording: true }));
    expect(['recording', 'booth'].map((id) => screen.getByTestId(id).textContent)).toEqual(['true', 'true']);
    expect(routerGate()).toBe(true);
    // A page with no recorder of its own (the Story Bible) is refused too: the clip would reach the take's microphone.
    expect(play('sample-1')).toBe(false);
    expect(notify).toHaveBeenCalledWith(expect.stringContaining('Not while recording'));

    act(() => spy.pushTransport({ playing: false, recording: false }));
    expect(['recording', 'booth'].map((id) => screen.getByTestId(id).textContent)).toEqual(['false', 'false']);
    expect(routerGate()).toBe(false);

    act(() => spy.pushCaps(GONE));
    expect(screen.getByTestId('can').textContent).toBe('false');
    expect(screen.getByTestId('capability').textContent).toBe('false');
  });
});
