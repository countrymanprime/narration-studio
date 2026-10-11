// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../api/ApiContext';
import { DAW_CAPABILITIES, type DawCapabilities, type DawCapabilitySupport } from '../../api/contracts/daw';
import { createMockApi } from '../../api/mockApi';
import type { NarrationApi } from '../../types';
import { ThemeProvider } from '../../theme/ThemeContext';
import { CapabilitySection } from './CapabilitySection';
import { registerSettingsSection } from './sections';
import { Settings } from './Settings';

afterEach(cleanup);

const report = (capabilities: Record<string, DawCapabilitySupport>, reachable = true): DawCapabilities => ({ daw: 'REAPER', reachable, capabilities });

function renderSection(overrides: Partial<NarrationApi>) {
  render(
    // The mock's own subscription emits its seeded report on subscribe, which would pre-empt a read a test overrides.
    <ApiProvider api={createMockApi({ subscribeDawCapabilities: () => () => undefined, ...overrides })}>
      <CapabilitySection />
    </ApiProvider>,
  );
}

/** An api whose report is `first`, and whose subscription hands the test the callback to push live updates through. */
function liveApi(first: DawCapabilities) {
  let push: (next: DawCapabilities) => void = () => undefined;
  const overrides: Partial<NarrationApi> = {
    dawCapabilities: async () => first,
    subscribeDawCapabilities: (onUpdate) => {
      push = onUpdate;
      return () => undefined;
    },
  };
  return { overrides, push: (next: DawCapabilities) => act(() => push(next)) };
}

describe('CapabilitySection', () => {
  it('lists one row per reported capability, labelled from the catalogue, and an unknown key under its key', async () => {
    renderSection({
      dawCapabilities: async () =>
        report({
          markers: { level: 'supported', available: true },
          pickups: { level: 'supported', available: true },
          future_thing: { level: 'experimental', available: true },
        }),
    });
    const rows = await screen.findAllByRole('listitem');
    expect(rows).toHaveLength(3);
    const label = (key: string) => DAW_CAPABILITIES.find((c) => c.key === key)!.label;
    expect(screen.getByText(label('markers'))).toBeTruthy();
    expect(screen.getByText(label('pickups'))).toBeTruthy();
    expect(screen.getByText('future_thing')).toBeTruthy();
    expect(screen.queryByText(label('review'))).toBeNull();
  });

  it('reads each level as a word with its own badge shape', async () => {
    renderSection({
      dawCapabilities: async () =>
        report({
          markers: { level: 'supported', available: true },
          pickups: { level: 'experimental', available: true },
          record: { level: 'not_yet_available', available: false, reason: 'not_yet', message: 'Not built yet.' },
          punch: { level: 'unsupported', available: false, reason: 'unsupported', message: 'This DAW cannot do it.' },
        }),
    });
    const rows = await screen.findAllByRole('listitem');
    const marks = rows.map((row) => within(row).getByTestId('capability-level').textContent);
    expect(marks[0]).toContain('Supported');
    expect(marks[1]).toContain('Experimental');
    expect(marks[2]).toContain('Not yet available');
    expect(marks[3]).toContain('Unsupported');
    const glyphs = marks.map((text) => text!.split(' ')[0]);
    expect(new Set(glyphs).size).toBe(4);
  });

  it("shows an unavailable capability's message verbatim and words nothing of its own", async () => {
    const message = 'REAPER is not running. Start it on the linked project.';
    renderSection({ dawCapabilities: async () => report({ markers: { level: 'supported', available: false, reason: 'not_running', message } }) });
    expect(await screen.findByText(message)).toBeTruthy();
  });

  it('shows the warning chip only for a destructive capability', async () => {
    renderSection({
      dawCapabilities: async () =>
        report({
          punch: { level: 'experimental', available: true, destructive: true },
          markers: { level: 'supported', available: true },
        }),
    });
    const rows = await screen.findAllByRole('listitem');
    const chip = 'Replaces audio that cannot be brought back';
    expect(within(rows.find((r) => within(r).queryByText(/Punch/))!).getByText(chip)).toBeTruthy();
    expect(screen.getAllByText(chip)).toHaveLength(1);
  });

  it('reads each mode as a plain phrase, and draws nothing when no mode is reported', async () => {
    renderSection({
      dawCapabilities: async () =>
        report({
          markers: { level: 'supported', available: true, mode: 'native' },
          pickups: { level: 'supported', available: true, mode: 'app' },
          record: { level: 'supported', available: true, mode: 'steps' },
          punch: { level: 'supported', available: true },
        }),
    });
    expect(await screen.findByText('The DAW does it in one step')).toBeTruthy();
    expect(screen.getByText('The app does it')).toBeTruthy();
    expect(screen.getByText('The app makes the edits one after another')).toBeTruthy();
    const rows = screen.getAllByRole('listitem');
    expect(within(rows[3]).queryByText(/The (DAW|app)/)).toBeNull();
  });

  it('updates a row from a daw_capabilities_changed event without a reload', async () => {
    const { overrides, push } = liveApi(report({ markers: { level: 'supported', available: true } }));
    renderSection(overrides);
    await screen.findAllByRole('listitem');
    expect(screen.queryByText('Gone away.')).toBeNull();
    push(report({ markers: { level: 'supported', available: false, reason: 'not_running', message: 'Gone away.' } }));
    expect(await screen.findByText('Gone away.')).toBeTruthy();
  });

  it('drops a stale read that resolves after a live event', async () => {
    let resolveRead: (value: DawCapabilities) => void = () => undefined;
    let push: (next: DawCapabilities) => void = () => undefined;
    renderSection({
      dawCapabilities: () => new Promise<DawCapabilities>((resolve) => (resolveRead = resolve)),
      subscribeDawCapabilities: (onUpdate) => {
        push = onUpdate;
        return () => undefined;
      },
    });
    act(() => push(report({ markers: { level: 'supported', available: false, reason: 'failed', message: 'Fresh.' } })));
    await act(async () => resolveRead(report({ markers: { level: 'supported', available: true } })));
    expect(screen.getByText('Fresh.')).toBeTruthy();
  });

  it('says so when the read fails, and reads again on Retry', async () => {
    const dawCapabilities = vi
      .fn<NarrationApi['dawCapabilities']>()
      .mockRejectedValueOnce(new Error('bridge down'))
      .mockResolvedValue(report({ markers: { level: 'supported', available: true } }));
    renderSection({ dawCapabilities });
    expect((await screen.findByRole('alert')).textContent).toContain('bridge down');
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(1));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('says no DAW reported capabilities for an empty report', async () => {
    renderSection({ dawCapabilities: async () => report({}) });
    expect(await screen.findByText('No DAW reported capabilities.')).toBeTruthy();
  });
});

async function renderDawCategory() {
  const api = createMockApi();
  const data = await api.bootstrap();
  render(
    <ThemeProvider>
      <ApiProvider api={api}>
        <Settings
          data={data}
          notify={vi.fn()}
          onDirtyChange={vi.fn()}
          registerActions={vi.fn()}
          onProjectDataCleared={async () => undefined}
          onLinkDawFile={vi.fn()}
          initialCategory="Daw"
        />
      </ApiProvider>
    </ThemeProvider>,
  );
}

describe('Settings renders registered sections', () => {
  it('renders the DAW category sections in order, the capability section among them', async () => {
    registerSettingsSection('Daw', 'test-before', () => <p>Before capabilities</p>, 5);
    registerSettingsSection('Daw', 'test-after', () => <p>After capabilities</p>, 50);
    await renderDawCategory();
    const heading = await screen.findByRole('heading', { name: 'What the DAW can do' });
    const before = screen.getByText('Before capabilities');
    const after = screen.getByText('After capabilities');
    expect(before.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(heading.compareDocumentPosition(after) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('draws no section in a category with none registered', async () => {
    await renderDawCategory();
    await screen.findByRole('heading', { name: 'What the DAW can do' });
    fireEvent.click(screen.getByRole('tab', { name: 'General' }));
    expect(screen.queryByRole('heading', { name: 'What the DAW can do' })).toBeNull();
  });
});
