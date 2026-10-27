// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../api/ApiContext';
import type { DawCapabilities, DawMeters, DawTransport } from '../api/contracts/daw';
import { createMockApi } from '../api/mockApi';
import { BoothFooter } from '../components/booth/frame/BoothFooter';
import { useBoothRecording } from '../components/booth/useBoothRecording';
import { ProjectFx } from '../components/editing/effects/ProjectFx';
import { useProjectFx } from '../components/editing/effects/useProjectFx';
import { useDawStatus } from '../components/editing/page/useDawStatus';
import { useDawCapabilityReport } from '../components/settings/CapabilitySection';
import { DAW_SETUPS } from '../fixtures/daw';
import { defaultKeymap } from '../input/keymap';
import { useDawRecording } from '../input/useDawRecording';
import type { NarrationApi } from '../types';
import { useCapability } from '../useCapability';
import { useDawKind } from '../useDawKind';
import { DAW_METERS_EVERY_MS } from './dawSession';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

// A class-wide guard: every screen or hook that shows DAW state is mounted COLD (nothing else on the page, no menu opened, no tab
// visited first) under the same session, and must receive the status, FX and meter updates by itself. A new consumer that bypasses the
// session cannot be added here without it failing; dawSession.guard.test.ts is the static half.

const REAPER: DawCapabilities = DAW_SETUPS.reaper;
const ARMED: DawMeters = { ok: true, output: -18, input: -24, inputTrack: 'Chapter 1 Narration', message: '', reason: '' };

/** A mock api whose DAW state this test owns: counts the host subscriptions and can push a capability report or a transport. */
function spyApi() {
  const base = createMockApi();
  const capSubs = new Set<(caps: DawCapabilities) => void>();
  const transportSubs = new Set<(transport: DawTransport) => void>();
  const counts = { capSubscriptions: 0, transportSubscriptions: 0, meterReads: 0, fxReads: 0 };
  let caps: DawCapabilities = REAPER;
  const api: NarrationApi = {
    ...base,
    dawCapabilities: async () => caps,
    subscribeDawCapabilities: (onUpdate) => {
      counts.capSubscriptions += 1;
      capSubs.add(onUpdate);
      return () => capSubs.delete(onUpdate);
    },
    subscribeDawTransport: (onUpdate) => {
      counts.transportSubscriptions += 1;
      transportSubs.add(onUpdate);
      return () => transportSubs.delete(onUpdate);
    },
    dawMeters: async () => (counts.meterReads++, ARMED),
    workspaceProjectFx: async () => (
      counts.fxReads++,
      { tracks: [{ trackGuid: 'g1', name: 'Narration', fx: [{ name: 'ReaEQ', enabled: true }] }], master: [], total: 1 }
    ),
  };
  return {
    api,
    counts,
    pushCaps: (next: DawCapabilities) => {
      caps = next;
      for (const listener of [...capSubs]) listener(next);
    },
    pushTransport: (next: DawTransport) => {
      for (const listener of [...transportSubs]) listener(next);
    },
  };
}

function mount(spy: ReturnType<typeof spyApi>, ui: ReactNode) {
  return render(<ApiProvider api={spy.api}>{ui}</ApiProvider>);
}

function Probe({ name, children }: { name: string; children: ReactNode }) {
  return <div data-testid={name}>{children}</div>;
}

const unreachable: DawCapabilities = {
  ...REAPER,
  reachable: false,
  capabilities: { ...REAPER.capabilities, record: { level: 'experimental', available: false, reason: 'not_running', message: 'REAPER is not running.' } },
};

describe('each DAW consumer mounted cold hears the one DAW session', () => {
  it('Effects tab: the FX in REAPER are listed on mount, with no other screen opened first', async () => {
    const spy = spyApi();
    function Fx() {
      return <ProjectFx state={useProjectFx()} dawName="REAPER" />;
    }
    mount(spy, <Fx />);
    await waitFor(() => expect(screen.getByText('ReaEQ')).toBeTruthy());
    expect(screen.queryByText(/not connected/i)).toBeNull();
  });

  it('Booth footer: the DAW meters stream with the Levels menu closed', async () => {
    vi.useFakeTimers();
    const spy = spyApi();
    mount(
      spy,
      <BoothFooter
        record={<button>Record</button>}
        seconds={0}
        recording={false}
        mic={{
          engine: 'daw',
          dawName: 'REAPER',
          reachable: true,
          device: 'USB Mic',
          onDevice: vi.fn(),
          levels: { monitor: REAPER.capabilities.monitor_level, input: REAPER.capabilities.input_level, meters: { level: 'supported', available: true } },
        }}
        roomTone="Room not measured yet"
        keymap={defaultKeymap()}
      />,
    );
    await act(() => vi.advanceTimersByTimeAsync(DAW_METERS_EVERY_MS * 3));
    expect(spy.counts.meterReads).toBeGreaterThan(1);
  });

  it('Editing page banner, capability gates, kind and the settings report all follow one pushed report', async () => {
    const spy = spyApi();
    function All() {
      const status = useDawStatus();
      const record = useCapability('record');
      const kind = useDawKind();
      const report = useDawCapabilityReport();
      return (
        <>
          <Probe name="off">{String(status.off !== null)}</Probe>
          <Probe name="record">{String(record.available)}</Probe>
          <Probe name="kind">{kind ?? 'unknown'}</Probe>
          <Probe name="report">{String(report.report?.reachable)}</Probe>
        </>
      );
    }
    mount(spy, <All />);
    await waitFor(() => expect(screen.getByTestId('kind').textContent).toBe('REAPER'));
    expect(screen.getByTestId('off').textContent).toBe('false');
    act(() => spy.pushCaps(unreachable));
    await waitFor(() => expect(screen.getByTestId('off').textContent).toBe('true'));
    expect(screen.getByTestId('report').textContent).toBe('false');
    expect(screen.getByTestId('record').textContent).toBe('false');
    // One subscription to the host serves all four consumers.
    expect(spy.counts.capSubscriptions).toBe(1);
  });

  it('transport: the Booth recording guard and the command router read the same push', async () => {
    const spy = spyApi();
    let recording: () => boolean = () => false;
    function Transport() {
      recording = useDawRecording();
      return <Probe name="booth">{String(useBoothRecording(true))}</Probe>;
    }
    mount(spy, <Transport />);
    act(() => spy.pushTransport({ playing: false, recording: true }));
    await waitFor(() => expect(screen.getByTestId('booth').textContent).toBe('true'));
    expect(recording()).toBe(true);
    expect(spy.counts.transportSubscriptions).toBe(1);
  });

  it('is torn down with the provider: no listener or timer outlives the app', async () => {
    vi.useFakeTimers();
    const spy = spyApi();
    const view = mount(spy, <Probe name="x">x</Probe>);
    await act(() => vi.advanceTimersByTimeAsync(10));
    view.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
