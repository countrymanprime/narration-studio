// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../../api/ApiContext';
import { createMockApi } from '../../../api/mockApi';
import type { NarrationApi } from '../../../types';
import { ThemeProvider } from '../../../theme/ThemeContext';
import { MemoryRouter } from 'react-router-dom';
import { SettingsPage } from '../page/SettingsPage';
import { AnalysisToolsSection } from './AnalysisToolsSection';
import { LocalAssets } from '../../assets/LocalAssets';
import { createFakeTools, type FakeInstall } from './fixtures';

afterEach(cleanup);

// The install loop polls every 400 ms and a download takes three polls, so a state that arrives by polling is waited for, not faked.
// A retry also re-queues the job and reloads the list; on a loaded CI runner that has run past 4 s, so the wait gets 10 s (under
// `testTimeout`, 15 s). It still ends as soon as the state arrives.
const SLOW = { timeout: 10_000 };

function mount(options: { installs?: Record<string, FakeInstall>; overrides?: Partial<NarrationApi> } = {}) {
  const fake = createFakeTools({ installs: options.installs });
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
      ['local-llm', 'Local language model'],
    ]) {
      expect(within(await row(id)).getByRole('heading', { name })).toBeTruthy();
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
    mount();
    const local = await row('local-llm');
    expect(local.getAttribute('data-status')).toBe('unavailable');
    expect(within(local).getByText('Not available yet')).toBeTruthy();
    expect(local.querySelector('[data-comp-reason]')!.textContent).toBe(
      'A model small enough for this computer takes many hours per book. It will be offered once that is practical.',
    );
    expect(within(local).queryAllByRole('button')).toHaveLength(0);
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
    expect(gliner.querySelector('[data-comp-error]')!.textContent).toBe('Could not reach huggingface.co.');
    fake.plan('gliner', 'completes');
    fireEvent.click(within(gliner).getByRole('button', { name: 'Try GLiNER again' }));
    await waitFor(() => expect(gliner.getAttribute('data-status')).toBe('installed'), SLOW);
    expect(gliner.querySelector('[data-comp-error]')).toBeNull();
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
    await waitFor(() => expect(gliner.querySelector('[data-comp-error]')?.textContent).toMatch(/Could not remove GLiNER: .*in use by a scan/));
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
    expect(gliner.querySelector('[data-comp-error]')!.textContent).toBe(shortfall);
    fake.plan('gliner', 'completes');
    fireEvent.click(within(gliner).getByRole('button', { name: 'Try GLiNER again' }));
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
    // Opening the Local assets list afterwards reads the same registry and shows it installed.
    const { container } = render(
      <ApiProvider api={api}>
        <LocalAssets notify={vi.fn()} />
      </ApiProvider>,
    );
    const listed = (await within(container).findByRole('heading', { level: 3, name: 'GLiNER' })).closest('li') as HTMLElement;
    expect(within(listed).getByText(/Installed/)).toBeTruthy();
    // The reverse: a removal made through the list is what the section shows after it reads again.
    await api.assetsRemove('analysis', 'gliner');
    expect(fake.installed()).toEqual([]);
    const catalog = await api.assetsList();
    expect(catalog.assets.find((item) => item.id === 'gliner')?.installState).toBe('not_installed');
  });

  it("is drawn on the Settings page as the mock's own panel, after Story Bible types, whatever scope Story Bible shows", async () => {
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
              initialCategory="ManuscriptGuide"
            />
          </ApiProvider>
        </ThemeProvider>
      </MemoryRouter>,
    );
    const analysis = screen.getByRole('region', { name: 'Story Bible analysis' });
    const types = screen.getByRole('region', { name: 'Story Bible types' });
    expect(types.compareDocumentPosition(analysis) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(await row('gliner')).toBeTruthy();
    const storyBible = screen.getByRole('region', { name: 'Story Bible' });
    fireEvent.click(within(storyBible).getByRole('button', { name: 'This project' }));
    await waitFor(() => expect(within(storyBible).getByRole('button', { name: 'This project' }).getAttribute('aria-pressed')).toBe('true'));
    expect(screen.getByRole('region', { name: 'Story Bible analysis' })).toBe(analysis);
  });

  it('says why the list could not be read, and reads it again', async () => {
    const list = vi.fn().mockRejectedValueOnce(new Error('The registry could not be read.'));
    const fake = createFakeTools();
    list.mockImplementation(fake.port.assetsList);
    mount({ overrides: { assetsList: list } });
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/The analysis tools could not be listed: .*registry could not be read/);
    fireEvent.click(within(alert).getByRole('button', { name: 'Try again' }));
    expect(await row('gliner')).toBeTruthy();
  });
});
