// @vitest-environment jsdom
// SN-X63: the first-scan prompt, ported from the Studio Next mock's tests/analysis-tools.test.tsx ("the first scan prompt") over the mock
// host and the fake asset registry (settings/analysis/fixtures.ts).
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { ApiProvider } from '../../../../api/ApiContext';
import { createMockApi } from '../../../../api/mockApi';
import { OverlayHost } from '../../../../overlay/OverlayHost';
import { overlay } from '../../../../overlay/overlayService';
import { StudioProvider } from '../../../../studio/StudioProvider';
import type { NarrationApi } from '../../../../types';
import { ANALYSIS_TOOLS, createFakeTools } from '../../../settings/analysis/fixtures';
import { analysisTools } from '../../../settings/analysis/components';
import { shouldOffer } from './scanModel';
import { useStartScan } from './useStartScan';

let api: NarrationApi;
let scan: Mock<() => Promise<void>>;

function Page({ onImported }: { onImported?: () => void }) {
  const { startScan, dialogs } = useStartScan({ scan, onImported });
  return (
    <>
      <button onClick={() => void startScan()}>Scan</button>
      {dialogs}
    </>
  );
}
function mount(options: { installed?: string[]; overrides?: Partial<NarrationApi> } = {}) {
  const fake = createFakeTools({ tools: ANALYSIS_TOOLS.map((t) => (options.installed?.includes(t.id) ? { ...t, installState: 'installed' } : t)) });
  const saved: Record<string, string | null>[] = [];
  let pref = 'ask';
  api = createMockApi({
    ...fake.port,
    settingsForScope: vi.fn(async () => ({ ManuscriptGuide: [{ key: 'analysis_prompt', effectiveValue: pref }] }) as never),
    saveSettings: vi.fn(async (_tool, _scope, values) => {
      saved.push(values);
      pref = String(values.analysis_prompt);
      return undefined as never;
    }),
    ...options.overrides,
  });
  render(
    <ApiProvider api={api}>
      <StudioProvider>
        <Page />
        <OverlayHost />
      </StudioProvider>
    </ApiProvider>,
  );
  return { saved, setPref: (value: string) => (pref = value), fake };
}
const press = async () => userEvent.setup().click(screen.getByRole('button', { name: 'Scan' }));
const prompt = () => screen.findByRole('dialog', { name: 'Scan the manuscript' });

beforeEach(() => {
  scan = vi.fn(async () => {});
});
afterEach(() => {
  cleanup();
  // The overlay is the app's one service: a dialog a test left open must not hide the next test's page.
  act(() => overlay.getSnapshot().dialogs.forEach((entry) => ('close' in entry ? entry.close() : entry.answer(false))));
  vi.restoreAllMocks();
});

describe('shouldOffer', () => {
  const tools = analysisTools({ assets: ANALYSIS_TOOLS });
  it('offers only when asked, nothing is installed or downloading, and something can be downloaded', () => {
    expect(shouldOffer('ask', tools, false)).toBe(true);
    expect(shouldOffer('basic', tools, false)).toBe(false);
    expect(shouldOffer('ask', tools, true)).toBe(false);
    expect(
      shouldOffer(
        'ask',
        tools.map((t) => ({ ...t, installState: 'installed' as const })),
        false,
      ),
    ).toBe(false);
    expect(
      shouldOffer(
        'ask',
        tools.map((t) => ({ ...t, unavailableReason: 'no' })),
        false,
      ),
    ).toBe(false);
    expect(shouldOffer('ask', [], false)).toBe(false);
  });
});

describe('the first scan prompt', () => {
  it('prompt-appears-when-nothing-is-installed: three ways forward and the checkbox', async () => {
    mount();
    await press();
    const dialog = await prompt();
    for (const name of ['Use basic scan now', 'Download better analysis…', 'Import from a file instead']) {
      expect(within(dialog).getByRole('button', { name })).toBeTruthy();
    }
    expect(within(dialog).getByRole('checkbox', { name: 'Don’t ask again' })).toBeTruthy();
    expect(scan).not.toHaveBeenCalled();
  });

  it('never-blocking: Close starts nothing and changes nothing; basic scan starts the scan', async () => {
    const { saved } = mount();
    const user = userEvent.setup();
    await press();
    await prompt();
    await user.click(screen.getByRole('button', { name: /^Close/ }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(scan).not.toHaveBeenCalled();
    expect(saved).toEqual([]);
    await press();
    await user.click(await screen.findByRole('button', { name: 'Use basic scan now' }));
    await waitFor(() => expect(scan).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('download-opens-the-consent-for-the-pair: nothing downloads and no scan starts by itself', async () => {
    const { fake } = mount();
    const user = userEvent.setup();
    await press();
    await user.click(await screen.findByRole('button', { name: 'Download better analysis…' }));
    const consent = await screen.findByRole('dialog', { name: 'Download better analysis' });
    expect(within(consent).getByRole('heading', { name: /GLiNER/ })).toBeTruthy();
    expect(within(consent).getByRole('heading', { name: /BookNLP \(small\)/ })).toBeTruthy();
    expect(within(consent).queryByText(/BookNLP \(large\)/)).toBeNull();
    expect(scan).not.toHaveBeenCalled();
    await user.click(within(consent).getByRole('button', { name: 'Download' }));
    await waitFor(async () => expect((await fake.port.assetsList()).assets.some((t) => t.activeJobId)).toBe(true));
    expect(scan).not.toHaveBeenCalled();
  });

  it('import-opens-the-import-dialog', async () => {
    mount();
    await press();
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Import from a file instead' }));
    expect(await screen.findByRole('dialog', { name: 'Import entries' })).toBeTruthy();
    expect(scan).not.toHaveBeenCalled();
  });

  it('dont-ask-again-is-remembered: written before the action runs; the next scan goes straight through; Settings back to ask offers again', async () => {
    const { saved, setPref } = mount();
    const user = userEvent.setup();
    await press();
    await user.click(await screen.findByRole('checkbox', { name: 'Don’t ask again' }));
    scan.mockImplementation(async () => expect(saved).toEqual([{ analysis_prompt: 'basic' }]));
    await user.click(screen.getByRole('button', { name: 'Use basic scan now' }));
    await waitFor(() => expect(scan).toHaveBeenCalledTimes(1));
    expect(api.saveSettings).toHaveBeenCalledWith('ManuscriptGuide', 'global', { analysis_prompt: 'basic' });
    await press();
    await waitFor(() => expect(scan).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole('dialog')).toBeNull();
    setPref('ask');
    await press();
    await prompt();
  });

  it('dont-ask-again also applies to Close-less choices: Import and Download write it too', async () => {
    const { saved } = mount();
    const user = userEvent.setup();
    await press();
    await user.click(await screen.findByRole('checkbox', { name: 'Don’t ask again' }));
    await user.click(screen.getByRole('button', { name: 'Import from a file instead' }));
    await screen.findByRole('dialog', { name: 'Import entries' });
    expect(saved).toEqual([{ analysis_prompt: 'basic' }]);
  });

  it('a failed save does not block the chosen action', async () => {
    mount({ overrides: { saveSettings: vi.fn(async () => Promise.reject(new Error('disk full'))) } });
    const user = userEvent.setup();
    await press();
    await user.click(await screen.findByRole('checkbox', { name: 'Don’t ask again' }));
    await user.click(screen.getByRole('button', { name: 'Use basic scan now' }));
    await waitFor(() => expect(scan).toHaveBeenCalledTimes(1));
  });

  it('an-installed-tool-is-used: no prompt, the scan runs at once', async () => {
    mount({ installed: ['booknlp-small'] });
    await press();
    await waitFor(() => expect(scan).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('scans at once when the settings or the registry cannot be read', async () => {
    mount({ overrides: { assetsList: vi.fn(async () => Promise.reject(new Error('offline'))) } });
    await press();
    await waitFor(() => expect(scan).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('keyboard-and-aria: the first button has focus and Escape closes', async () => {
    mount();
    await press();
    const dialog = await prompt();
    await waitFor(() => expect(document.activeElement).toBe(within(dialog).getByRole('button', { name: 'Use basic scan now' })));
    await userEvent.setup().keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(scan).not.toHaveBeenCalled();
  });
});
