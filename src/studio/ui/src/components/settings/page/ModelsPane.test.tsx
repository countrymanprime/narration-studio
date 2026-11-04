// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { overlay } from '../../../overlay/overlayService';
import { MemoryRouter } from 'react-router-dom';
import { ApiProvider } from '../../../api/ApiContext';
import { createMockApi } from '../../../api/mockApi';
import type { MockApiSeed } from '../../../api/mockHost/state';
import { ThemeProvider } from '../../../theme/ThemeContext';
import type { AssetCatalog, AssetItem, NarrationApi } from '../../../types';
import { VERIFY_WAIT_MS } from '../models/AssetsStore';
import { SettingsPage } from './SettingsPage';

let toast: MockInstance<typeof overlay.toast>;
beforeEach(() => {
  toast = vi.spyOn(overlay, 'toast');
});
afterEach(() => {
  vi.useRealTimers();
  cleanup();
  localStorage.clear();
});

// A download is polled every 400 ms and takes three polls, so a state that arrives by polling is waited for. The wait ends as soon as it arrives.
const SLOW = { timeout: 10_000 };

async function renderModels({
  overrides = {},
  seed = {},
  go = vi.fn(),
  before,
  reuse,
}: {
  overrides?: Partial<NarrationApi>;
  seed?: MockApiSeed;
  go?: (path: string) => void;
  before?: (api: NarrationApi) => Promise<void>;
  /** The host of an earlier render, for the page opened again. */
  reuse?: NarrationApi;
} = {}) {
  const api = reuse ?? createMockApi(overrides, seed);
  await before?.(api);
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
            go={go}
            refreshBootstrap={async () => undefined}
          />
        </ApiProvider>
      </ThemeProvider>
    </MemoryRouter>,
  );
  fireEvent.click(within(screen.getByRole('navigation', { name: 'Settings categories' })).getByRole('button', { name: /^Models & downloads/ }));
  await screen.findByRole('heading', { level: 2, name: 'Models & downloads' });
  return { api, go };
}

const asset = (key: string) => document.querySelector<HTMLElement>(`[data-asset="${key}"]`)!;
const ready = async (key: string) => {
  await waitFor(() => expect(asset(key)).not.toBeNull());
  return asset(key);
};

/** The mock host lists one Whisper model; this adds two more so a removal has somewhere to move a setting to. */
function withWhisperChoices(): { overrides: Partial<NarrationApi>; removed: string[] } {
  const base = createMockApi();
  const removed: string[] = [];
  const extra = (id: string, displayName: string, size: number): AssetItem => ({
    kind: 'whisper',
    kindLabel: 'Whisper model',
    id,
    displayName,
    version: '1',
    publisher: 'Systran',
    license: 'MIT',
    licenseUrl: '',
    modelCardUrl: '',
    provenanceUrl: '',
    attribution: '',
    downloadSize: size,
    diskSize: size,
    installState: 'installed',
    path: `/assets/whisper/${id}`,
    installedAt: '2026-09-20T09:30:00Z',
    verifiedAt: '2026-09-20T09:30:00Z',
    activeJobId: '',
  });
  const assetsList = async (): Promise<AssetCatalog> => {
    const catalog = await base.assetsList();
    const added = [extra('tiny', 'Tiny', 78_000_000), extra('medium', 'Medium', 1_531_000_000)].filter((item) => !removed.includes(item.id));
    return { ...catalog, assets: [...catalog.assets, ...added] };
  };
  const assetsRemove = async (kind: string, id: string) => {
    if (kind === 'whisper' && id !== 'small') removed.push(id);
    else await base.assetsRemove(kind, id);
  };
  return { overrides: { assetsList, assetsRemove }, removed };
}

describe('Settings: Models & downloads', () => {
  it('has a heading with the blurb and lists every download once, with status, size, what uses it and what is in use', async () => {
    const { go } = await renderModels();
    const heading = screen.getByRole('heading', { level: 2, name: 'Models & downloads' });
    expect(heading.id).toBe('settings-heading');
    expect(heading.getAttribute('tabindex')).toBe('-1');
    expect(screen.getByText(/Everything the app downloads, in one list/)).toBeTruthy();

    const small = await ready('whisper/small');
    // The four approved voices, the Whisper model, the language model and the dictionary.
    expect(document.querySelectorAll('[data-asset]').length).toBe(7);
    expect(within(small).getByText('Installed · checked')).toBeTruthy();
    expect(small.textContent).toContain('Whisper model');
    expect(small.textContent).toMatch(/\d+ MB/);
    expect(small.textContent).toContain('In use: Transcription model');
    fireEvent.click(within(small).getByRole('button', { name: 'Used by Proof. Go to Proof' }));
    expect(go).toHaveBeenCalledWith('/proof');

    const voice = asset('tts/en_US-ljspeech-high');
    expect(within(voice).getByText('Not installed')).toBeTruthy();
    expect(within(voice).getByRole('button', { name: 'Used by Script. Go to Script' })).toBeTruthy();
    expect(document.querySelector('[data-disk]')!.textContent).toMatch(/used by \d+ items?/);
    expect(document.querySelector('[data-row="models.folder"]')!.textContent).toContain('assets');
  });

  // Alignment audit, Models & downloads (XSE1-5, XSE2-25, XSE2-27, XSE1-14, R3SE2-5, XSE1-17, XSE1-18, XSE1-28).
  it('fixes the table columns so they do not move between states, and right-aligns the actions of each row', async () => {
    await renderModels();
    const small = await ready('whisper/small');
    const table = screen.getByRole('table', { name: 'Models, voices and tools' });
    expect(table.className).toContain('table-fixed');
    expect([...table.querySelectorAll('col')].map((col) => col.style.width)).toEqual(['', '12rem', '18rem', '6.5rem']);
    const actions = within(small)
      .getByRole('button', { name: /^Remove Small/ })
      .closest('td')!.firstElementChild!;
    expect(actions.className).toContain('justify-end');
    // The Used by links take their column; nothing narrower wraps them early.
    expect(within(small).getByRole('button', { name: 'Used by Proof. Go to Proof' }).parentElement!.className).not.toMatch(/max-w-/);
  });

  it('as a card, keeps the actions on the name line and draws the card on the card surface', async () => {
    await renderModels();
    const small = await ready('whisper/small');
    expect(small.className).toContain('@max-[1020px]:grid');
    expect(small.className).toContain('@max-[1020px]:bg-[var(--surface)]');
    const actionCell = within(small)
      .getByRole('button', { name: /^Remove Small/ })
      .closest('td')!;
    expect(actionCell.className).toContain('row-start-1');
    expect(actionCell.className).toContain('col-start-2');
    // The table's last-row rule would draw a line under each cell of the last card (seen at tablet and 390 px on PR 2801).
    // The table's own last-row rule is more specific than a plain cell class, so the card cell's no-bottom-rule wins with !important.
    for (const cell of screen.getAllByRole('cell')) expect(cell.className).toContain('@max-[1020px]:border-b-0!');
  });

  it('draws the folder once: the disk bar says how much is used, and the Models folder row owns the path and Open folder', async () => {
    await renderModels();
    await ready('whisper/small');
    const bar = document.querySelector<HTMLElement>('[data-disk]')!;
    expect(within(bar).queryByRole('button', { name: 'Open folder' })).toBeNull();
    expect(bar.textContent).not.toContain('Stored in');
    const row = document.querySelector<HTMLElement>('[data-row="models.folder"]')!;
    expect(within(row).getByRole('button', { name: 'Open folder' })).toBeTruthy();
    expect(screen.getAllByText(/narration-studio\/assets|AppData/).length).toBe(1);
  });

  it('draws the analysis tools in a card under their label, like the list above', async () => {
    await renderModels();
    await waitFor(() => expect(document.querySelector('[data-component="gliner"]')).not.toBeNull());
    expect(document.querySelector('[data-component="gliner"]')!.closest('section[aria-label="Story Bible analysis tools"]')).toBeTruthy();
  });

  it('keeps the segmented filter on one line, scrolling sideways when the page is too narrow', async () => {
    await renderModels();
    const filter = within(document.getElementById('settings-pane')!).getByRole('group', { name: 'Show' });
    expect(filter.className).toContain('whitespace-nowrap');
    expect(filter.className).toContain('overflow-x-auto');
  });

  it('keeps the analysis tools out of the table and draws them below it', async () => {
    await renderModels();
    await ready('whisper/small');
    expect(document.querySelector('[data-asset^="analysis/"]')).toBeNull();
    expect(await screen.findByRole('heading', { level: 3, name: 'Story Bible analysis tools' })).toBeTruthy();
    await waitFor(() => expect(document.querySelector('[data-component="gliner"]')).not.toBeNull());
    expect(screen.getByRole('checkbox', { name: 'Offer better analysis when scanning' })).toBeTruthy();
  });

  it('filters by kind', async () => {
    await renderModels();
    await ready('whisper/small');
    fireEvent.click(screen.getByRole('button', { name: 'Voices' }));
    expect(document.querySelectorAll('[data-asset]').length).toBe(4);
    expect(asset('tts/en_US-ljspeech-high')).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Language' }));
    expect(document.querySelectorAll('[data-asset]').length).toBe(2);
    fireEvent.click(within(document.getElementById('settings-pane')!).getByRole('button', { name: 'All' }));
    expect(document.querySelectorAll('[data-asset]').length).toBe(7);
  });

  it('downloads with progress, can be cancelled, and ends installed and checked', async () => {
    await renderModels({ seed: { assets: 'missing' } });
    const voice = await ready('tts/en_US-ljspeech-high');
    fireEvent.click(within(voice).getByRole('button', { name: /^Download LJ Speech/ }));
    const bar = await screen.findByRole('progressbar', { name: /^Downloading LJ Speech/ });
    expect(bar).toBeTruthy();
    fireEvent.click(await within(voice).findByRole('button', { name: /^Cancel the download of LJ Speech/ }));
    await waitFor(() => expect(within(asset('tts/en_US-ljspeech-high')).getByText('Not installed')).toBeTruthy(), SLOW);
    fireEvent.click(within(asset('tts/en_US-ljspeech-high')).getByRole('button', { name: /^Download LJ Speech/ }));
    await waitFor(() => expect(within(asset('tts/en_US-ljspeech-high')).getByText('Installed · checked')).toBeTruthy(), SLOW);
    expect(screen.queryByRole('progressbar', { name: /^Downloading LJ Speech/ })).toBeNull();
  });

  it('a download that fails says why and offers Retry', async () => {
    const reason = 'Not enough free disk space: 114 MB are needed and 20 MB are free.';
    const assetsInstall = vi.fn().mockRejectedValue(new Error(reason));
    await renderModels({ overrides: { assetsInstall }, seed: { assets: 'missing' } });
    const voice = await ready('tts/en_US-ljspeech-high');
    fireEvent.click(within(voice).getByRole('button', { name: /^Download LJ Speech/ }));
    await waitFor(() => expect(within(asset('tts/en_US-ljspeech-high')).getByText('Download failed')).toBeTruthy());
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.stringContaining('Not enough free disk space'), expect.objectContaining({ tone: 'error' })));
    assetsInstall.mockRejectedValue(new Error('Could not reach huggingface.co.'));
    fireEvent.click(within(asset('tts/en_US-ljspeech-high')).getByRole('button', { name: /^Try LJ Speech.* again$/ }));
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(expect.stringContaining('Could not reach huggingface.co'), expect.objectContaining({ tone: 'error' })),
    );
    expect(assetsInstall).toHaveBeenCalledTimes(2);
  });

  it('a download the host ends in failure shows the host sentence', async () => {
    await renderModels({ seed: { assets: 'download-fails' } });
    const voice = await ready('tts/en_US-ljspeech-high');
    fireEvent.click(within(voice).getByRole('button', { name: /^Download LJ Speech/ }));
    await waitFor(() => expect(within(asset('tts/en_US-ljspeech-high')).getByText('Download failed')).toBeTruthy(), SLOW);
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(expect.stringContaining('did not match the approved one'), expect.objectContaining({ tone: 'error' })),
    );
    expect(within(asset('tts/en_US-ljspeech-high')).getByRole('button', { name: /again$/ })).toBeTruthy();
  });

  it('repairs a damaged download', async () => {
    await renderModels({ seed: { assets: 'damaged' } });
    const small = await ready('whisper/small');
    expect(within(small).getByText('Needs repair')).toBeTruthy();
    fireEvent.click(within(small).getByRole('button', { name: /^Repair/ }));
    await waitFor(() => expect(within(asset('whisper/small')).getByText('Installed · checked')).toBeTruthy(), SLOW);
  });

  it('removing a model in use names the settings and moves each to the smallest other installed choice', async () => {
    const { overrides } = withWhisperChoices();
    const { api } = await renderModels({
      overrides,
      before: async (mock) => {
        // This project also chooses the model it is removing.
        await mock.saveSettings('TranscriptCompare', 'project', { model_size: 'small' });
      },
    });
    const save = vi.spyOn(api, 'saveSettings');
    const small = await ready('whisper/small');
    fireEvent.click(within(small).getByRole('button', { name: 'Remove Small' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Remove Small?' });
    // The background check's double-check model defaults to Small too (#2251).
    expect(dialog.textContent).toContain(
      'It is chosen for: Transcription model, Transcription model (this project) and Double-check model for background checks',
    );
    fireEvent.click(within(dialog).getByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(within(asset('whisper/small')).getByText('Not installed')).toBeTruthy());
    await waitFor(() => expect(save).toHaveBeenCalledWith('TranscriptCompare', 'project', { model_size: 'tiny' }));
    expect(save).toHaveBeenCalledWith('TranscriptCompare', 'global', { model_size: 'tiny' });
    expect(await screen.findByText(/Transcription model now uses Tiny/)).toBeTruthy();
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('refuses to remove the only installed choice and says so', async () => {
    const { api } = await renderModels();
    const remove = vi.spyOn(api, 'assetsRemove');
    const small = await ready('whisper/small');
    fireEvent.click(within(small).getByRole('button', { name: 'Remove Small' }));
    fireEvent.click(await within(await screen.findByRole('alertdialog')).findByRole('button', { name: 'Remove' }));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/only installed choice for Transcription model/);
    expect(remove).not.toHaveBeenCalled();
    expect(within(asset('whisper/small')).getByText('Installed · checked')).toBeTruthy();
  });

  it('removes a download nothing has chosen, and says what the host refuses', async () => {
    const { api } = await renderModels();
    await ready('whisper/small');
    const dictionary = document.querySelector<HTMLElement>('[data-asset^="dictionary/"]')!;
    fireEvent.click(within(dictionary).getByRole('button', { name: /^Remove / }));
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog.textContent).not.toContain('It is chosen for');
    vi.spyOn(api, 'assetsRemove').mockRejectedValueOnce(new Error('The file is open in another program.'));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Remove' }));
    expect((await screen.findByRole('alert')).textContent).toContain('The file is open in another program.');
  });

  it('with nothing downloaded it offers the recommended set', async () => {
    const assetsInstall = vi.fn(createMockApi({}, { assets: 'missing' }).assetsInstall);
    await renderModels({ overrides: { assetsInstall }, seed: { assets: 'missing' } });
    await ready('whisper/small');
    expect(screen.getByText('Nothing is downloaded yet')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Download the recommended set' }));
    await waitFor(() => expect(assetsInstall).toHaveBeenCalledWith('whisper', 'small'));
    expect(assetsInstall).toHaveBeenCalledWith('tts', 'en_US-ljspeech-high');
  });

  it('shows a loading state while the list is read', async () => {
    await renderModels({ overrides: { assetsList: () => new Promise<AssetCatalog>(() => undefined) } });
    const loading = document.querySelector('[aria-busy="true"]');
    expect(loading).not.toBeNull();
    expect(within(loading as HTMLElement).getByRole('status').textContent).toBe('Reading the models on this computer…');
  });

  it('says when the list cannot be read and Retry reads it again', async () => {
    const base = createMockApi();
    const assetsList = vi.fn(base.assetsList).mockRejectedValueOnce(new Error('The folder did not answer.'));
    await renderModels({ overrides: { assetsList } });
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('The list of models could not be read.');
    expect(alert.textContent).toContain('The folder did not answer.');
    fireEvent.click(within(alert).getByRole('button', { name: 'Retry' }));
    await ready('whisper/small');
    expect(screen.queryByText('The list of models could not be read.')).toBeNull();
  });
  it('opens the asset folder from the Models folder row and says when the host refuses', async () => {
    const assetsOpenFolder = vi.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('No file manager.'));
    await renderModels({ overrides: { assetsOpenFolder } });
    await ready('whisper/small');
    fireEvent.click(screen.getByRole('button', { name: 'Open folder' }));
    await waitFor(() => expect(assetsOpenFolder).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: 'Open folder' }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.stringContaining('The folder could not be opened: No file manager.'), { tone: 'error' }));
  });

  it('opens the asset folder from the load-error banner', async () => {
    const base = createMockApi();
    const assetsList = vi.fn(base.assetsList).mockRejectedValueOnce(new Error('The folder did not answer.'));
    const assetsOpenFolder = vi.fn().mockResolvedValue(undefined);
    await renderModels({ overrides: { assetsList, assetsOpenFolder } });
    fireEvent.click(within(await screen.findByRole('alert')).getByRole('button', { name: 'Open the folder' }));
    await waitFor(() => expect(assetsOpenFolder).toHaveBeenCalledTimes(1));
  });
});

// Issue 2731: Check the files on an installed row reads every byte of the asset (assetsVerify), and the row follows the answer.
describe('Settings: Models & downloads, Check the files', () => {
  const CHECK_SMALL = 'Check the files of Small';
  const checkButton = (key: string) => within(asset(key)).queryByRole('button', { name: /^Check the files of / });
  const smallCheck = () => within(asset('whisper/small')).getByRole('button', { name: CHECK_SMALL });
  type VerifyAnswer = Awaited<ReturnType<NarrationApi['assetsVerify']>>;
  /** The page's polite live region (the one downloads speak through) says this. */
  const announced = (text: string) =>
    waitFor(() =>
      expect(screen.getAllByRole('status').some((region) => region.getAttribute('aria-live') === 'polite' && region.textContent === text)).toBe(true),
    );
  const pill = (key: string) => within(asset(key)).getByText(/^Installed/).textContent;

  it('offers Check the files, enabled, on an installed row and on no row in another state', async () => {
    await renderModels({ seed: { assets: 'damaged' } });
    await ready('whisper/small');
    // Installed: the language model. Needs repair: the Whisper model. Not installed: the preview voice.
    const language = checkButton('spacy/en_core_web_sm')!;
    expect(language).toBeTruthy();
    expect(language.getAttribute('aria-disabled')).toBeNull();
    expect(language.getAttribute('aria-busy')).toBeNull();
    expect(checkButton('whisper/small')).toBeNull();
    expect(checkButton('tts/en_US-ljspeech-high')).toBeNull();
  });

  it('draws no Check the files while a download runs', async () => {
    await renderModels({ seed: { assets: 'downloading' } });
    fireEvent.click(within(await ready('tts/en_US-ljspeech-high')).getByRole('button', { name: /^Download LJ Speech/ }));
    await waitFor(() => expect(asset('tts/en_US-ljspeech-high').getAttribute('data-status')).toBe('downloading'));
    expect(checkButton('tts/en_US-ljspeech-high')).toBeNull();
  });

  it('checking shows the busy row and ignores a second press; an answer of installed keeps it installed, reads the list again and says nothing', async () => {
    const base = createMockApi();
    let answer: (value: VerifyAnswer) => void = () => undefined;
    const assetsVerify = vi.fn(() => new Promise<VerifyAnswer>((resolve) => (answer = resolve)));
    const assetsList = vi.fn(base.assetsList);
    await renderModels({ overrides: { assetsVerify, assetsList } });
    const small = await ready('whisper/small');
    const reads = assetsList.mock.calls.length;
    fireEvent.click(within(small).getByRole('button', { name: CHECK_SMALL }));
    await waitFor(() => expect(smallCheck().getAttribute('aria-busy')).toBe('true'));
    expect(within(asset('whisper/small')).getByText('Checking the files')).toBeTruthy();
    expect(within(asset('whisper/small')).queryByRole('button', { name: /^Cancel/ })).toBeNull();
    expect(within(asset('whisper/small')).queryByRole('button', { name: 'Remove Small' })).toBeNull();
    fireEvent.click(smallCheck());
    fireEvent.click(smallCheck());
    expect(assetsVerify).toHaveBeenCalledTimes(1);
    expect(assetsVerify).toHaveBeenCalledWith('whisper', 'small');
    await act(async () => answer({ kind: 'whisper', id: 'small', installState: 'installed' }));
    await waitFor(() => expect(within(asset('whisper/small')).getByText('Installed · checked')).toBeTruthy());
    await waitFor(() => expect(assetsList.mock.calls.length).toBeGreaterThan(reads));
    expect(smallCheck().getAttribute('aria-busy')).toBeNull();
    expect(toast).not.toHaveBeenCalled();
  });

  it('an answer of installed refreshes when the files were last checked', async () => {
    const api = createMockApi();
    const verifiedAt = async () => (await api.assetsList()).assets.find((item) => item.kind === 'whisper')!.verifiedAt;
    const before = await verifiedAt();
    await renderModels({ reuse: api });
    fireEvent.click(within(await ready('whisper/small')).getByRole('button', { name: CHECK_SMALL }));
    await waitFor(async () => expect(await verifiedAt()).not.toBe(before));
  });

  // Walkthrough 1 and qa B2 on PR 2801: a check that passes looked like nothing happened.
  it('a check that passes is announced and the pill says the time it was checked', async () => {
    await renderModels();
    await ready('whisper/small');
    expect(pill('whisper/small')).toBe('Installed · checked');
    fireEvent.click(smallCheck());
    await announced('Small: files checked, all whole.');
    await waitFor(() => expect(pill('whisper/small')).toMatch(/^Installed · checked \d{1,2}:\d{2}/));
    expect(toast).not.toHaveBeenCalled();
  });

  it('an answer of verification_failed turns the row to Needs repair with its Repair action', async () => {
    await renderModels({ seed: { assetsVerify: 'damaged' } });
    fireEvent.click(within(await ready('whisper/small')).getByRole('button', { name: CHECK_SMALL }));
    await waitFor(() => expect(within(asset('whisper/small')).getByText('Needs repair')).toBeTruthy());
    expect(within(asset('whisper/small')).getByRole('button', { name: 'Repair Small' })).toBeTruthy();
    expect(checkButton('whisper/small')).toBeNull();
    expect(toast).not.toHaveBeenCalled();
  });

  // qa B1 on PR 2801: a check that found damage or nothing said so to no screen reader, and focus fell to the body with the button.
  it('a check that finds a damaged file announces it and moves focus to Repair', async () => {
    await renderModels({ seed: { assetsVerify: 'damaged' } });
    await ready('whisper/small');
    smallCheck().focus();
    fireEvent.click(smallCheck());
    await announced('Small: a file failed its check. Repair it.');
    await waitFor(() => expect(document.activeElement).toBe(within(asset('whisper/small')).getByRole('button', { name: 'Repair Small' })));
  });

  it('a check that finds the files gone announces it and moves focus to Download', async () => {
    await renderModels({ seed: { assetsVerify: 'absent' } });
    await ready('whisper/small');
    smallCheck().focus();
    fireEvent.click(smallCheck());
    await announced('Small: its files are gone. Download it again.');
    await waitFor(() => expect(document.activeElement).toBe(within(asset('whisper/small')).getByRole('button', { name: /^Download Small/ })));
  });

  it('an answer of absent turns the row to Not installed with Download', async () => {
    await renderModels({ seed: { assetsVerify: 'absent' } });
    fireEvent.click(within(await ready('whisper/small')).getByRole('button', { name: CHECK_SMALL }));
    await waitFor(() => expect(within(asset('whisper/small')).getByText('Not installed')).toBeTruthy());
    expect(within(asset('whisper/small')).getByRole('button', { name: /^Download Small/ })).toBeTruthy();
    expect(checkButton('whisper/small')).toBeNull();
  });

  // qa B3 and walkthrough 2 on PR 2801: after a refused check the pill still claimed the files were checked.
  it('after a refused check the pill drops "checked" until a check passes', async () => {
    const base = createMockApi();
    const assetsVerify = vi.fn(base.assetsVerify).mockRejectedValueOnce(new Error('Access is denied to model.bin.'));
    await renderModels({ overrides: { assetsVerify } });
    await ready('whisper/small');
    fireEvent.click(smallCheck());
    await waitFor(() => expect(toast).toHaveBeenCalled());
    await waitFor(() => expect(pill('whisper/small')).toBe('Installed'));
    // The page opened again keeps it: the failed check belongs to the host, not to the page.
    fireEvent.click(within(screen.getByRole('navigation', { name: 'Settings categories' })).getByRole('button', { name: /^Delivery/ }));
    fireEvent.click(within(screen.getByRole('navigation', { name: 'Settings categories' })).getByRole('button', { name: /^Models & downloads/ }));
    await ready('whisper/small');
    expect(pill('whisper/small')).toBe('Installed');
    fireEvent.click(smallCheck());
    await waitFor(() => expect(pill('whisper/small')).toMatch(/^Installed · checked/));
  });

  it('an error is a toast in the host words, and the row stays installed', async () => {
    await renderModels({ seed: { assetsVerify: 'fails' } });
    fireEvent.click(within(await ready('whisper/small')).getByRole('button', { name: CHECK_SMALL }));
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith('The files of Small could not be checked: Access is denied to model.bin.', expect.objectContaining({ tone: 'error' })),
    );
    await waitFor(() => expect(smallCheck().getAttribute('aria-busy')).toBeNull());
    expect(pill('whisper/small')).toBe('Installed');
  });

  it('an error with no words ends the sentence without a colon', async () => {
    await renderModels({ seed: { assetsVerify: 'silent' } });
    fireEvent.click(within(await ready('whisper/small')).getByRole('button', { name: CHECK_SMALL }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith('The files of Small could not be checked.', expect.objectContaining({ tone: 'error' })));
  });

  it('gives up on a host that never answers after a wait, says so in a toast, and the button works again', async () => {
    await renderModels({ seed: { assetsVerify: 'hangs' } });
    const small = await ready('whisper/small');
    vi.useFakeTimers({ shouldAdvanceTime: true });
    fireEvent.click(within(small).getByRole('button', { name: CHECK_SMALL }));
    await waitFor(() => expect(smallCheck().getAttribute('aria-busy')).toBe('true'));
    await act(async () => void (await vi.advanceTimersByTimeAsync(VERIFY_WAIT_MS + 100)));
    await waitFor(() => expect(smallCheck().getAttribute('aria-busy')).toBeNull());
    expect(toast).toHaveBeenCalledWith('The files of Small were not checked: the app did not answer in 2 minutes.', expect.objectContaining({ tone: 'error' }));
    expect(pill('whisper/small')).toBe('Installed');
  });

  it('stays busy when the pane, or the whole page, is opened again while it checks', async () => {
    const { api } = await renderModels({ seed: { assetsVerify: 'hangs' } });
    const verify = vi.spyOn(api, 'assetsVerify');
    fireEvent.click(within(await ready('whisper/small')).getByRole('button', { name: CHECK_SMALL }));
    const busy = () => expect(smallCheck().getAttribute('aria-busy')).toBe('true');
    await waitFor(busy);
    const nav = () => within(screen.getByRole('navigation', { name: 'Settings categories' }));
    fireEvent.click(nav().getByRole('button', { name: /^Delivery/ }));
    await waitFor(() => expect(document.querySelector('[data-asset]')).toBeNull());
    fireEvent.click(nav().getByRole('button', { name: /^Models & downloads/ }));
    await ready('whisper/small');
    await waitFor(busy);
    cleanup();
    await renderModels({ reuse: api });
    await ready('whisper/small');
    await waitFor(busy);
    fireEvent.click(smallCheck());
    expect(verify).toHaveBeenCalledTimes(1);
  });

  it('keeps the check button on the name line of a long-named asset: the name cell shrinks and wraps, the actions do not', async () => {
    await renderModels({ seed: { assetNames: 'long' } });
    const small = await ready('whisper/small');
    expect(small.querySelector('th')!.textContent!.length).toBeGreaterThan(80);
    expect(small.querySelector('th')!.className).toContain('break-words');
    expect(small.className).toContain('grid-cols-[minmax(0,1fr)_auto]');
    const actions = within(small)
      .getByRole('button', { name: /^Check the files of / })
      .closest('td')!;
    expect(actions.className).toContain('whitespace-nowrap');
    expect(actions.className).toContain('row-start-1');
  });
});
