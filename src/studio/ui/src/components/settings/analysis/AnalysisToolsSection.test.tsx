// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { overlay } from '../../../overlay/overlayService';
import { ApiProvider } from '../../../api/ApiContext';
import { createMockApi } from '../../../api/mockApi';
import type { AssetItem, NarrationApi } from '../../../types';
import { ThemeProvider } from '../../../theme/ThemeContext';
import { MemoryRouter } from 'react-router-dom';
import { SettingsPage } from '../page/SettingsPage';
import { AnalysisToolsSection } from './AnalysisToolsSection';
import { ANALYSIS_TOOLS, createFakeTools, type FakeInstall } from './fixtures';

let toast: MockInstance<typeof overlay.toast>;
beforeEach(() => {
  toast = vi.spyOn(overlay, 'toast');
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

// The install loop polls every 400 ms and a download takes three polls, so a state that arrives by polling is waited for, not faked.
// A retry also re-queues the job and reloads the list; on a loaded CI runner that has run past 4 s, so the wait gets 10 s (under
// `testTimeout`, 15 s). It still ends as soon as the state arrives.
const SLOW = { timeout: 10_000 };

function mount(options: { tools?: AssetItem[]; installs?: Record<string, FakeInstall>; overrides?: Partial<NarrationApi> } = {}) {
  const fake = createFakeTools({ tools: options.tools, installs: options.installs });
  const port = {
    assetsList: vi.fn(fake.port.assetsList),
    assetsInstall: vi.fn(fake.port.assetsInstall),
    assetsInstallState: vi.fn(fake.port.assetsInstallState),
    assetsInstallCancel: vi.fn(fake.port.assetsInstallCancel),
    assetsRemove: vi.fn(fake.port.assetsRemove),
  };
  const api = createMockApi({ ...port, ...options.overrides });
  render(
    <ApiProvider api={api}>
      <AnalysisToolsSection />
    </ApiProvider>,
  );
  return { api, fake, port };
}

const row = async (id: string) => {
  await waitFor(() => expect(document.querySelector(`[data-component="${id}"]`)).not.toBeNull());
  return document.querySelector(`[data-component="${id}"]`) as HTMLElement;
};

const download = async (id: string, name: string) => {
  fireEvent.click(within(await row(id)).getByRole('button', { name: `Download ${name}…` }));
  const dialog = await screen.findByRole('dialog', { name: `Download ${name}` });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Download' }));
};

describe('AnalysisToolsSection', () => {
  it('lists-the-tools-with-what-they-are', async () => {
    mount();
    expect(await screen.findByRole('heading', { name: 'Story Bible analysis' })).toBeTruthy();
    for (const [id, name] of [
      ['gliner', 'GLiNER'],
      ['booknlp-small', 'BookNLP (small)'],
      ['booknlp-big', 'BookNLP (large)'],
    ]) {
      expect(within(await row(id)).getByRole('heading', { level: 3, name })).toBeTruthy();
    }
    const small = await row('booknlp-small');
    expect(small.getAttribute('data-status')).toBe('not-installed');
    expect(within(small).getByText('Not installed')).toBeTruthy();
    expect(within(small).getByText(/Groups the different ways a character is named/)).toBeTruthy();
    const facts = small.querySelector('[data-comp-facts]')!.textContent;
    expect(facts).toContain('274 MB');
    expect(facts).toContain('from people.ischool.berkeley.edu, files.pythonhosted.org');
    expect(facts).toContain('needs about 1.6 GB of memory');
    expect(facts).toContain('about 3 min per book');
    expect((await row('booknlp-big')).querySelector('[data-comp-facts]')!.textContent).toContain('1.2 GB');
  });

  it('unavailable-shows-its-reason-and-no-button', async () => {
    // No row of the production catalog is pending today; a row whose files are not all pinned still says why and offers nothing.
    const pending = 'GLiNER is not yet available: its download is still being checked, and it will be offered once every file is pinned.';
    mount({ tools: ANALYSIS_TOOLS.map((tool) => (tool.id === 'gliner' ? { ...tool, unavailableReason: pending } : tool)) });
    const gliner = await row('gliner');
    expect(gliner.getAttribute('data-status')).toBe('unavailable');
    expect(within(gliner).getByText('Not available yet')).toBeTruthy();
    expect(gliner.querySelector('[data-comp-reason]')!.textContent).toBe(pending);
    expect(within(gliner).queryAllByRole('button')).toHaveLength(0);
  });

  it('download-asks-first', async () => {
    const { port } = mount();
    fireEvent.click(within(await row('gliner')).getByRole('button', { name: 'Download GLiNER…' }));
    const dialog = await screen.findByRole('dialog', { name: 'Download GLiNER' });
    expect(dialog.textContent).toContain('Finds the names of characters');
    expect(dialog.textContent).toContain('712 MB');
    expect(dialog.textContent).toContain('huggingface.co, files.pythonhosted.org');
    expect(dialog.textContent).toContain('about 2 GB of memory');
    expect(dialog.textContent).toContain('about 2 min per book');
    expect(within(dialog).getByRole('link', { name: 'Apache-2.0' })).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(port.assetsInstall).not.toHaveBeenCalled();
    await download('gliner', 'GLiNER');
    await waitFor(() => expect(port.assetsInstall).toHaveBeenCalledTimes(1));
    expect(port.assetsInstall).toHaveBeenCalledWith('analysis', 'gliner');
    await waitFor(async () => expect((await row('gliner')).getAttribute('data-status')).toBe('installed'), SLOW);
    expect(within(await row('gliner')).getByText('Installed · checked')).toBeTruthy();
    expect(port.assetsInstall).toHaveBeenCalledTimes(1);
  });

  it('progress-cancel-and-retry', async () => {
    const { fake, port } = mount({ installs: { 'booknlp-small': 'held', gliner: { fails: 'Could not reach huggingface.co.' } } });
    await download('booknlp-small', 'BookNLP (small)');
    const small = await row('booknlp-small');
    const bar = await within(small).findByRole('progressbar', { name: 'Downloading BookNLP (small)' });
    await waitFor(() => expect(bar.getAttribute('aria-valuenow')).toBe('40'), SLOW);
    expect(within(small).getByText('40% of 274 MB')).toBeTruthy();
    fireEvent.click(within(small).getByRole('button', { name: 'Cancel the download of BookNLP (small)' }));
    await waitFor(() => expect(small.getAttribute('data-status')).toBe('not-installed'));
    expect(port.assetsInstallCancel).toHaveBeenCalledTimes(1);
    expect(within(small).getByRole('button', { name: 'Download BookNLP (small)…' })).toBeTruthy();

    await download('gliner', 'GLiNER');
    const gliner = await row('gliner');
    await waitFor(() => expect(gliner.getAttribute('data-status')).toBe('failed'), SLOW);
    expect(within(gliner).getByText('Download failed')).toBeTruthy();
    expect(toast).toHaveBeenCalledWith('Could not reach huggingface.co.', { tone: 'error' });
    expect(gliner.querySelector('[role=alert]'), 'nothing in the row').toBeNull();
    fake.plan('gliner', 'completes');
    fireEvent.click(within(gliner).getByRole('button', { name: 'Try GLiNER again' }));
    await waitFor(() => expect(gliner.getAttribute('data-status')).toBe('installed'), SLOW);
    // One loop: every state read went through the one poller, one job at a time.
    const jobs = new Set(port.assetsInstallState.mock.calls.map(([id]) => id));
    expect(jobs.size).toBe(3);
  });

  it('follows a download that was already running when the section opened', async () => {
    const fake = createFakeTools({ installs: { gliner: 'held' } });
    await fake.port.assetsInstall('analysis', 'gliner');
    const api = createMockApi({ ...fake.port });
    render(
      <ApiProvider api={api}>
        <AnalysisToolsSection />
      </ApiProvider>,
    );
    const gliner = await row('gliner');
    await waitFor(() => expect(gliner.getAttribute('data-status')).toBe('downloading'));
    await waitFor(() => expect(within(gliner).getByRole('progressbar').getAttribute('aria-valuenow')).toBe('40'), SLOW);
  });

  it('remove-asks-then-removes', async () => {
    const { fake, port } = mount();
    await download('gliner', 'GLiNER');
    const gliner = await row('gliner');
    await waitFor(() => expect(gliner.getAttribute('data-status')).toBe('installed'), SLOW);
    fireEvent.click(within(gliner).getByRole('button', { name: 'Remove GLiNER' }));
    fireEvent.click(within(await screen.findByRole('alertdialog', { name: 'Remove GLiNER?' })).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(port.assetsRemove).not.toHaveBeenCalled();
    expect(fake.installed()).toEqual(['gliner']);
    fireEvent.click(within(gliner).getByRole('button', { name: 'Remove GLiNER' }));
    fireEvent.click(within(await screen.findByRole('alertdialog', { name: 'Remove GLiNER?' })).getByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(gliner.getAttribute('data-status')).toBe('not-installed'));
    expect(port.assetsRemove).toHaveBeenCalledWith('analysis', 'gliner');
    expect(fake.installed()).toEqual([]);
  });

  it('writes a refused removal in the row', async () => {
    mount({ overrides: { assetsRemove: vi.fn().mockRejectedValue(new Error('It is in use by a scan.')) } });
    await download('gliner', 'GLiNER');
    const gliner = await row('gliner');
    await waitFor(() => expect(gliner.getAttribute('data-status')).toBe('installed'), SLOW);
    fireEvent.click(within(gliner).getByRole('button', { name: 'Remove GLiNER' }));
    fireEvent.click(within(await screen.findByRole('alertdialog', { name: 'Remove GLiNER?' })).getByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.stringMatching(/Could not remove GLiNER: .*in use by a scan/), { tone: 'error' }));
    expect(gliner.getAttribute('data-status')).toBe('installed');
  });

  it('ask-first-checkbox-follows-the-setting', async () => {
    const { api } = mount();
    const box = await screen.findByRole('checkbox', { name: 'Offer better analysis when scanning' });
    await waitFor(() => expect(box.getAttribute('aria-checked')).toBe('true'));
    const save = vi.spyOn(api, 'saveSettings');
    fireEvent.click(box);
    await waitFor(() => expect(save).toHaveBeenCalledWith('ManuscriptGuide', 'global', { analysis_prompt: 'basic' }));
    expect(box.getAttribute('aria-checked')).toBe('false');
    // A change made elsewhere shows when the window comes back.
    await api.saveSettings('ManuscriptGuide', 'global', { analysis_prompt: 'ask' });
    act(() => {
      window.dispatchEvent(new Event('focus'));
    });
    await waitFor(() => expect(box.getAttribute('aria-checked')).toBe('true'));
  });

  it('a-low-disk-failure-shows-the-shortfall-and-try-again-recovers', async () => {
    const shortfall = 'Not enough disk space: 712 MB needed, 300 MB free on C:.';
    const { fake } = mount({ installs: { gliner: { fails: shortfall } } });
    await download('gliner', 'GLiNER');
    const gliner = await row('gliner');
    await waitFor(() => expect(gliner.getAttribute('data-status')).toBe('failed'), SLOW);
    await waitFor(() => expect(toast).toHaveBeenCalledWith(shortfall, { tone: 'error' }), SLOW);
    expect(gliner.querySelector('[role=alert]'), 'nothing in the row').toBeNull();
    fake.plan('gliner', 'completes');
    fireEvent.click(within(gliner).getByRole('button', { name: 'Try GLiNER again' }));
    await waitFor(() => expect(gliner.getAttribute('data-status')).toBe('installed'), SLOW);
  });

  // The owner's report (#2251): the sentence alone did not say which file or why. The host's step, file and cause sit behind Details,
  // closed until asked for; a failure without one (a host that did not answer) draws no empty Details, and Dismiss clears both.
  it('a-failure-after-the-download-shows-its-step-and-file-behind-details', async () => {
    const sentence = 'The downloaded analysis tool matched the approved file but could not be unpacked or prepared, so it was not installed.';
    const detail = 'Unpacking torch-2.14.1-cp312-cp312-win_amd64.whl: it holds 12990 entries, and an archive may hold from 1 to 10000';
    mount({ installs: { 'booknlp-small': { fails: sentence, detail }, gliner: { fails: 'Could not reach huggingface.co.' } } });
    await download('booknlp-small', 'BookNLP (small)');
    const booknlp = await row('booknlp-small');
    await waitFor(() => expect(booknlp.getAttribute('data-status')).toBe('failed'), SLOW);
    expect(toast).toHaveBeenCalledWith(sentence, { tone: 'error' });
    expect(booknlp.querySelector('[role=alert]'), 'nothing in the row').toBeNull();
    const details = booknlp.querySelector<HTMLDetailsElement>('[data-comp-error-detail]')!;
    expect(details.open).toBe(false);
    expect(within(details).getByText('Details').tagName).toBe('SUMMARY');
    expect(details.textContent).toContain(detail);
    await download('gliner', 'GLiNER');
    const gliner = await row('gliner');
    await waitFor(() => expect(gliner.getAttribute('data-status')).toBe('failed'), SLOW);
    expect(gliner.querySelector('[data-comp-error-detail]')).toBeNull();
    fireEvent.click(within(booknlp).getByRole('button', { name: 'Dismiss' }));
    await waitFor(() => expect(booknlp.querySelector('[data-comp-error-detail]')).toBeNull());
  });

  it('Try again pressed the moment a failure is drawn still starts the download', async () => {
    const { fake } = mount({ installs: { gliner: { fails: 'Not enough disk space.' } } });
    await download('gliner', 'GLiNER');
    const gliner = await row('gliner');
    // A mutation observer runs in the microtask after the commit that draws the failure, before React runs that commit's effects:
    // the narrowest moment a click can land, and the one a loaded runner reaches.
    await new Promise<void>((resolve) => {
      const observer = new MutationObserver(() => {
        const retry = within(gliner).queryByRole('button', { name: 'Try GLiNER again' });
        if (!retry) return;
        observer.disconnect();
        fake.plan('gliner', 'completes');
        fireEvent.click(retry);
        resolve();
      });
      observer.observe(gliner, { subtree: true, childList: true, attributes: true });
    });
    await waitFor(() => expect(gliner.getAttribute('data-status')).toBe('installed'), SLOW);
  });

  it('one-registry-two-faces', async () => {
    const fake = createFakeTools();
    const api = createMockApi({ ...fake.port });
    render(
      <ApiProvider api={api}>
        <AnalysisToolsSection />
      </ApiProvider>,
    );
    // An install started in the section shows as installed in the Local assets list (a second load of the one registry).
    await download('gliner', 'GLiNER');
    await waitFor(async () => expect((await row('gliner')).getAttribute('data-status')).toBe('installed'), SLOW);
    expect(fake.installed()).toEqual(['gliner']);
    // A removal made through the host is what a second read of the one registry shows.
    await api.assetsRemove('analysis', 'gliner');
    expect(fake.installed()).toEqual([]);
    const catalog = await api.assetsList();
    expect(catalog.assets.find((item) => item.id === 'gliner')?.installState).toBe('not_installed');
  });

  it('is drawn on the Settings page under Models & downloads, below the list of downloads and without a panel of its own', async () => {
    const fake = createFakeTools();
    const api = createMockApi({ ...fake.port });
    const data = await api.bootstrap();
    render(
      <MemoryRouter>
        <ThemeProvider>
          <ApiProvider api={api}>
            <SettingsPage
              data={data}
              notify={vi.fn()}
              onDirtyChange={vi.fn()}
              registerActions={vi.fn()}
              onProjectDataCleared={async () => undefined}
              onLinkDawFile={vi.fn()}
              go={vi.fn()}
              refreshBootstrap={async () => undefined}
            />
          </ApiProvider>
        </ThemeProvider>
      </MemoryRouter>,
    );
    fireEvent.click(within(screen.getByRole('navigation', { name: 'Settings categories' })).getByRole('button', { name: /^Models & downloads/ }));
    const heading = await screen.findByRole('heading', { level: 3, name: 'Story Bible analysis tools' });
    const table = await screen.findByRole('table', { name: 'Models, voices and tools' });
    expect(table.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'Story Bible analysis' })).toBeNull();
    expect(await row('gliner')).toBeTruthy();
  });

  it('says why the list could not be read, and reads it again', async () => {
    const list = vi.fn().mockRejectedValueOnce(new Error('The registry could not be read.'));
    const fake = createFakeTools();
    list.mockImplementation(fake.port.assetsList);
    mount({ overrides: { assetsList: list } });
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/The analysis tools could not be listed: .*registry could not be read/);
    fireEvent.click(within(alert).getByRole('button', { name: 'Retry' }));
    expect(await row('gliner')).toBeTruthy();
  });
});
