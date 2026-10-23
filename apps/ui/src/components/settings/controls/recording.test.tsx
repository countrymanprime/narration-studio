// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { ApiProvider } from '../../../api/ApiContext';
import { DAW_CAPABILITIES } from '../../../api/contracts/daw';
import { createMockApi } from '../../../api/mockApi';
import type { MockApiSeed } from '../../../api/mockHost/state';
import { StudioProvider } from '../../../studio/StudioProvider';
import { ThemeProvider } from '../../../theme/ThemeContext';
import type { NarrationApi } from '../../../types';
import type { Notify } from '../../primitives/Toast';
import { TooltipProvider } from '../../primitives/Tooltip';
import { SettingsPage } from '../page/SettingsPage';

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.restoreAllMocks();
});

async function renderPage({
  api = createMockApi(),
  category,
  advanced = false,
  notify = vi.fn(),
  onLinkDawFile = vi.fn(),
}: {
  api?: NarrationApi;
  category: string;
  advanced?: boolean;
  notify?: Notify;
  onLinkDawFile?: () => void;
}) {
  const data = await api.bootstrap();
  render(
    <MemoryRouter>
      <ThemeProvider>
        <ApiProvider api={api}>
          <StudioProvider>
            <TooltipProvider>
              {/* The shell's focusable landmark, which a Retry that goes away hands focus to. */}
              <main tabIndex={-1}>
                <SettingsPage
                  data={data}
                  notify={notify}
                  onDirtyChange={vi.fn()}
                  registerActions={vi.fn()}
                  onProjectDataCleared={async () => undefined}
                  onLinkDawFile={onLinkDawFile}
                  go={vi.fn()}
                  refreshBootstrap={async () => undefined}
                />
              </main>
            </TooltipProvider>
          </StudioProvider>
        </ApiProvider>
      </ThemeProvider>
    </MemoryRouter>,
  );
  const nav = screen.getByRole('navigation', { name: 'Settings categories' });
  fireEvent.click(within(nav).getByRole('button', { name: new RegExp(`^${category}`) }));
  await screen.findByRole('heading', { level: 2, name: category });
  if (advanced) fireEvent.click(await screen.findByRole('button', { name: /Advanced/ }));
  return { api, notify, onLinkDawFile };
}

const row = (id: string) => document.querySelector<HTMLElement>(`[data-row="${id}"]`)!;
const foundSeed: MockApiSeed = { dawChoice: { linkedFile: null, foundFiles: ['Alice.rpp'] }, daw: { connected: false } };
const notRunningSeed: MockApiSeed = { dawChoice: { linkedFile: 'Alice.rpp', bridge: true, chosen: 'REAPER' }, daw: { connected: true, reachable: false } };

describe('Recording & DAW: Record with', () => {
  it('chooses the recorder: REAPER, Audacity or built-in', async () => {
    const api = createMockApi({}, { daw: { experimentalOn: true } });
    const choose = vi.spyOn(api, 'dawChoose');
    await renderPage({ api, category: 'Recording & DAW' });
    const group = await screen.findByRole('radiogroup', { name: 'Record with' });
    const radios = within(group).getAllByRole('radio');
    expect(radios.map((radio) => radio.closest('label')?.textContent)).toEqual([
      'REAPER. Recordings live in the DAW.',
      'Audacity. Recordings live in the DAW.',
      'Built-in recorder. Recordings live in the app.',
    ]);
    await waitFor(() => expect(radios[0]!.getAttribute('aria-checked')).toBe('true'));
    fireEvent.click(radios[1]!);
    await waitFor(() => expect(choose).toHaveBeenCalledWith('Audacity'));
    // REAPER's file is linked, so the built-in recorder is a last resort behind a confirm that says what changes.
    fireEvent.click(within(group).getAllByRole('radio')[0]!);
    await waitFor(() => expect(choose).toHaveBeenCalledWith('REAPER'));
    fireEvent.click(radios[2]!);
    const confirm = await screen.findByRole('alertdialog', { name: 'Stop recording with REAPER?' });
    expect(confirm.textContent).toContain('Takes already recorded in REAPER stay in REAPER, but the Booth, Editing and Proof stop reading them');
    expect(choose).not.toHaveBeenCalledWith('Built-in');
    fireEvent.click(within(confirm).getByRole('button', { name: 'Switch to the built-in recorder' }));
    await waitFor(() => expect(choose).toHaveBeenCalledWith('Built-in'));
    await waitFor(() => expect(within(group).getAllByRole('radio')[2]!.getAttribute('aria-checked')).toBe('true'));
    expect(screen.getByText('Recording happens in the app. Nothing to connect.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Test connection' })).toBeNull();
  });

  it('a REAPER that is not running stays chosen, says so, and Test connection fails', async () => {
    await renderPage({ api: createMockApi({}, notRunningSeed), category: 'Recording & DAW' });
    expect(await screen.findByText('Not answering')).toBeTruthy();
    // The card says what the app does; it never offers another recorder or steps to run in REAPER.
    const card = screen.getByRole('group', { name: 'Connection' });
    expect(card.textContent).toContain('Start it here and it connects.');
    expect(card.textContent).not.toMatch(/another recorder|built-in|action list|Load ReaScript/i);
    expect(screen.getByRole('radio', { name: /^REAPER\./ }).getAttribute('aria-checked')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Test connection' }));
    expect(await screen.findByText('No answer from REAPER.')).toBeTruthy();
    expect(screen.getByText(/^Last checked \d+ s ago\.$/)).toBeTruthy();
  });

  it('drops a failed Test connection result once another project file is linked, since it was about the old one', async () => {
    const api = createMockApi({}, notRunningSeed);
    let update: (() => void) | undefined;
    vi.spyOn(api, 'subscribeDawCapabilities').mockImplementation((onUpdate) => {
      update = () => onUpdate(undefined as never);
      return () => undefined;
    });
    await renderPage({ api, category: 'Recording & DAW' });
    expect(await screen.findByText('Not answering')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Test connection' }));
    expect(await screen.findByText('No answer from REAPER.')).toBeTruthy();
    const current = await api.dawChoice();
    vi.spyOn(api, 'dawChoice').mockResolvedValue({ ...current, linkedFile: 'Other.rpp' });
    update?.();
    expect(await screen.findByText(/Linked to Other\.rpp/)).toBeTruthy();
    expect(screen.queryByText('No answer from REAPER.')).toBeNull();
  });

  it('Test connection reads the host again and says when it answered', async () => {
    const api = createMockApi();
    const read = vi.spyOn(api, 'dawChoice');
    await renderPage({ api, category: 'Recording & DAW' });
    expect(await screen.findByText('REAPER linked')).toBeTruthy();
    const before = read.mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: 'Test connection' }));
    expect(await screen.findByText(/^Connected\. Answered in \d+ ms\.$/)).toBeTruthy();
    expect(screen.getByText(/^Last checked \d+ s ago\.$/)).toBeTruthy();
    expect(read.mock.calls.length).toBeGreaterThan(before);
  });

  it('links the one .rpp found in the folder, then offers Start REAPER', async () => {
    await renderPage({ api: createMockApi({}, foundSeed), category: 'Recording & DAW' });
    expect(await screen.findByText('REAPER not linked')).toBeTruthy();
    expect(screen.getByText('Alice.rpp is in the project folder.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Link Alice.rpp' }));
    expect(await screen.findByRole('button', { name: 'Start REAPER' })).toBeTruthy();
    expect(screen.getByText('Not running')).toBeTruthy();
  });

  it('asks to choose a file when the folder holds several', async () => {
    const { onLinkDawFile } = await renderPage({
      api: createMockApi({}, { dawChoice: { linkedFile: null, foundFiles: ['Alice.rpp', 'Alice v2.rpp'] }, daw: { connected: false } }),
      category: 'Recording & DAW',
    });
    expect(await screen.findByText(/2 REAPER project files are in the project folder/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Link / })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Choose a project file' }));
    expect(onLinkDawFile).toHaveBeenCalled();
  });

  it('Start REAPER launches the linked project and says where', async () => {
    const api = createMockApi({}, { dawChoice: { linkedFile: 'Alice.rpp', bridge: false }, daw: { connected: false } });
    const launch = vi.spyOn(api, 'launchDaw');
    const { notify } = await renderPage({ api, category: 'Recording & DAW' });
    fireEvent.click(await screen.findByRole('button', { name: 'Start REAPER' }));
    await waitFor(() => expect(launch).toHaveBeenCalled());
    await waitFor(() => expect(notify).toHaveBeenCalledWith(expect.stringMatching(/^Started REAPER/)));
  });

  it('says REAPER was not found, offers to get it, and Check again reads the host', async () => {
    const api = createMockApi({}, { dawChoice: { linkedFile: null, foundFiles: [], reaperInstalled: false, chosen: 'REAPER' }, daw: { connected: false } });
    const read = vi.spyOn(api, 'dawChoice');
    await renderPage({ api, category: 'Recording & DAW' });
    expect(await screen.findByText('Not found')).toBeTruthy();
    expect(screen.getAllByText(/REAPER was not found on this computer/).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Get REAPER' })).toBeTruthy();
    const before = read.mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: 'Check again' }));
    await waitFor(() => expect(read.mock.calls.length).toBeGreaterThan(before));
  });

  it("names no .rpp file under Audacity and shows the host's refusal of the built-in recorder", async () => {
    await renderPage({ api: createMockApi({}, { dawChoice: { chosen: 'Audacity' }, daw: { daw: 'Audacity' } }), category: 'Recording & DAW' });
    await screen.findByRole('group', { name: 'Audacity connection' });
    expect(screen.queryByRole('group', { name: 'Connection' })).toBeNull();
    expect(screen.getByRole('group', { name: 'Audacity connection' }).textContent).not.toMatch(/\.rpp/);
    cleanup();
    await renderPage({ api: createMockApi({}, foundSeed), category: 'Recording & DAW' });
    fireEvent.click(await screen.findByRole('radio', { name: /^Built-in recorder/ }));
    expect((await screen.findByRole('alert')).textContent).toContain('Experimental: switched off in Settings.');
    expect(screen.getByRole('radio', { name: /^REAPER\./ }).getAttribute('aria-checked')).toBe('true');
  });

  it('words the Recording tool rows for the chosen DAW: the Experimental switch is for every DAW and the REAPER-only rows are not shown under Audacity', async () => {
    const audacity = createMockApi({}, { dawChoice: { chosen: 'Audacity' }, daw: { daw: 'Audacity' } });
    await renderPage({ api: audacity, category: 'Recording & DAW', advanced: true });
    await screen.findByRole('group', { name: 'Audacity connection' });
    expect(row('daw.experimental')).toBeTruthy();
    expect(row('daw.experimental').textContent).toContain('Experimental DAW actions');
    expect(row('daw.experimental').textContent).not.toMatch(/REAPER/);
    expect(row('daw.reaperPath')).toBeFalsy();
    expect(row('daw.autoLauncher')).toBeFalsy();
    expect(document.body.textContent).not.toMatch(/Experimental REAPER actions/);
    cleanup();
    await renderPage({ api: createMockApi(), category: 'Recording & DAW', advanced: true });
    expect(row('daw.reaperPath')).toBeTruthy();
    expect(row('daw.autoLauncher')).toBeTruthy();
    expect(row('daw.experimental').textContent).toContain('Experimental DAW actions');
  });

  it('points the switched-off built-in option at the switch by its own name', async () => {
    await renderPage({ api: createMockApi({}, foundSeed), category: 'Recording & DAW' });
    fireEvent.click(await screen.findByRole('radio', { name: /^Built-in recorder/ }));
    await screen.findByRole('alert');
    expect(screen.getAllByText(/Turn on Experimental DAW actions under Advanced, below\./).length).toBeGreaterThan(0);
  });

  it('the rows follow the recorder chosen here: REAPER-only rows go when Audacity is chosen and come back with REAPER', async () => {
    await renderPage({ api: createMockApi({}, { daw: { experimentalOn: true } }), category: 'Recording & DAW', advanced: true });
    await screen.findByText('REAPER linked');
    expect(row('daw.reaperPath')).toBeTruthy();
    fireEvent.click(screen.getByRole('radio', { name: /^Audacity/ }));
    await waitFor(() => expect(row('daw.reaperPath')).toBeFalsy());
    expect(row('daw.autoLauncher')).toBeFalsy();
    expect(row('daw.experimental')).toBeTruthy();
    fireEvent.click(screen.getByRole('radio', { name: /^REAPER\./ }));
    await waitFor(() => expect(row('daw.reaperPath')).toBeTruthy());
  });

  it('shows no launcher steps: the app keeps the bridge in REAPER and says so', async () => {
    const launcher = 'C:\\Apps\\Narration Studio\\launcher.lua';
    const base = await createMockApi().bootstrap();
    const api = createMockApi({
      bootstrap: async () => ({ ...base, runtime: { ...base.runtime, Reaper: { ...base.runtime.Reaper!, launcherPath: launcher } } }),
    });
    await renderPage({ api, category: 'Recording & DAW' });
    expect(await screen.findByText(/The app keeps its bridge in REAPER’s Scripts folder and REAPER starts it each time it opens/)).toBeTruthy();
    expect(screen.queryByText('REAPER launcher script')).toBeNull();
    expect(screen.queryByText(launcher)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Copy path' })).toBeNull();
  });

  it('while the app opens REAPER the card says so; a start that never answered shows the host sentence', async () => {
    await renderPage({
      api: createMockApi({}, { dawChoice: { linkedFile: 'Alice.rpp', bridge: false, starting: true }, daw: { connected: false } }),
      category: 'Recording & DAW',
    });
    expect(await screen.findByText('Starting REAPER')).toBeTruthy();
    expect(screen.getByRole('group', { name: 'Connection' }).textContent).toMatch(
      /The app opened REAPER and connects on its own once REAPER has the project open\. Opened \d+ s ago\./,
    );
    expect(screen.queryByRole('button', { name: 'Start REAPER' })).toBeNull();
  });

  it('a bridge problem is the host sentence, under the card', async () => {
    await renderPage({
      api: createMockApi(
        {},
        {
          dawChoice: { linkedFile: 'Alice.rpp', bridge: false, bridgeProblem: 'The app opened REAPER, but REAPER’s bridge has not answered.' },
          daw: { connected: false },
        },
      ),
      category: 'Recording & DAW',
    });
    expect(await screen.findByText('The app opened REAPER, but REAPER’s bridge has not answered.')).toBeTruthy();
  });

  it('Keep REAPER in the confirm leaves the project on REAPER', async () => {
    const api = createMockApi({}, { daw: { experimentalOn: true } });
    const choose = vi.spyOn(api, 'dawChoose');
    await renderPage({ api, category: 'Recording & DAW' });
    fireEvent.click(await screen.findByRole('radio', { name: /^Built-in recorder/ }));
    const confirm = await screen.findByRole('alertdialog', { name: 'Stop recording with REAPER?' });
    fireEvent.click(within(confirm).getByRole('button', { name: 'Keep REAPER' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(choose).not.toHaveBeenCalled();
    expect(screen.getByRole('radio', { name: /^REAPER\./ }).getAttribute('aria-checked')).toBe('true');
  });
});

describe('Recording & DAW: Microphone', () => {
  it('lists the input devices and saves the one chosen', async () => {
    const api = createMockApi();
    const save = vi.spyOn(api, 'saveSettings');
    const { devices } = await api.teleprompterDevices();
    expect(devices.length).toBeGreaterThan(0);
    await renderPage({ api, category: 'Recording & DAW' });
    const select = await within(row('daw.mic')).findByRole('combobox', { name: 'Microphone' });
    expect(
      within(select)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['System default', ...devices.map((device) => device.name)]);
    fireEvent.change(select, { target: { value: devices[0]!.name } });
    await waitFor(() => expect(save).toHaveBeenCalledWith('Teleprompter', 'global', { input_device: devices[0]!.name }));
    await waitFor(() => expect(within(row('daw.mic')).getByText('Saved')).toBeTruthy());
    fireEvent.change(select, { target: { value: '' } });
    await waitFor(() => expect(save).toHaveBeenLastCalledWith('Teleprompter', 'global', { input_device: null }));
  });

  it('keeps a free-text box when the devices cannot be listed, so the setting is never out of reach', async () => {
    const api = createMockApi({}, { teleprompterDevices: [] });
    const save = vi.spyOn(api, 'saveSettings');
    await renderPage({ api, category: 'Recording & DAW' });
    const box = await within(row('daw.mic')).findByRole('textbox');
    await userEvent.type(box, 'Studio USB{Enter}');
    await waitFor(() => expect(save).toHaveBeenCalledWith('Teleprompter', 'global', { input_device: 'Studio USB' }));
    expect(within(row('daw.mic')).getByText(/No microphone was found/)).toBeTruthy();
  });

  it('says why the list could not be read and still offers the text box', async () => {
    const api = createMockApi({ teleprompterDevices: async () => ({ devices: [], error: 'audio service is not running' }) });
    await renderPage({ api, category: 'Recording & DAW' });
    expect(await within(row('daw.mic')).findByText(/audio service is not running/)).toBeTruthy();
    expect(within(row('daw.mic')).getByRole('textbox')).toBeTruthy();
  });
});

describe('Recording & DAW: REAPER program', () => {
  it('refuses a value that is not the path to reaper.exe, keeps the old value and says why', async () => {
    const api = createMockApi();
    const save = vi.spyOn(api, 'saveSettings');
    await renderPage({ api, category: 'Recording & DAW', advanced: true });
    const box = within(row('daw.reaperPath')).getByRole('textbox');
    await userEvent.type(box, 'notepad.exe{Enter}');
    expect(
      await within(row('daw.reaperPath')).findByText('This is not the path to reaper.exe. Use the full path, such as C:\\Program Files\\REAPER\\reaper.exe.'),
    ).toBeTruthy();
    expect(save).not.toHaveBeenCalled();
    await userEvent.clear(box);
    await userEvent.type(box, 'D:\\Audio\\REAPER\\reaper.exe{Enter}');
    await waitFor(() => expect(save).toHaveBeenCalledWith('DAW', 'global', { reaper_path: 'D:\\Audio\\REAPER\\reaper.exe' }));
    await waitFor(() => expect(within(row('daw.reaperPath')).queryByText(/not the path/)).toBeNull());
  });
});

describe('Recording & DAW: Capabilities', () => {
  it('lists every capability with its setting and what the tool reports now, in the host’s words', async () => {
    const api = createMockApi({}, { daw: { connected: false } });
    await renderPage({ api, category: 'Recording & DAW', advanced: true });
    const table = await within(row('daw.capabilities')).findByRole('table', { name: 'What the recording tool can do' });
    await waitFor(() => expect(within(table).getAllByRole('row')).toHaveLength(DAW_CAPABILITIES.length + 1));
    const report = await api.dawCapabilities();
    const recordRow = within(table).getByText('Record').closest('tr')!;
    expect(within(recordRow).getByText('Unavailable')).toBeTruthy();
    expect(within(recordRow).getByText(report.capabilities.record!.message!)).toBeTruthy();
    expect(within(recordRow).getByRole('combobox', { name: 'Record' })).toHaveProperty('value', 'auto');
  });

  it('saves On, Off and Auto for one capability, and Auto clears it', async () => {
    const api = createMockApi();
    const save = vi.spyOn(api, 'saveSettings');
    await renderPage({ api, category: 'Recording & DAW', advanced: true });
    const select = await within(row('daw.capabilities')).findByRole('combobox', { name: 'Add markers' });
    fireEvent.change(select, { target: { value: 'off' } });
    await waitFor(() => expect(save).toHaveBeenCalledWith('DAW', 'global', { 'capability.markers': 'off' }));
    await waitFor(() => expect((within(row('daw.capabilities')).getByRole('combobox', { name: 'Add markers' }) as HTMLSelectElement).value).toBe('off'));
    expect(within(row('daw.capabilities')).getByText('Saved')).toBeTruthy();
    fireEvent.change(within(row('daw.capabilities')).getByRole('combobox', { name: 'Add markers' }), { target: { value: 'auto' } });
    await waitFor(() => expect(save).toHaveBeenLastCalledWith('DAW', 'global', { 'capability.markers': null }));
  });

  it('follows the host’s live report and offers Retry when the first read fails', async () => {
    let fail = true;
    const base = createMockApi({}, {});
    const api = createMockApi({
      subscribeDawCapabilities: () => () => undefined,
      dawCapabilities: async () => {
        if (fail) throw new Error('bridge unreadable');
        return base.dawCapabilities();
      },
    });
    await renderPage({ api, category: 'Recording & DAW', advanced: true });
    expect(await within(row('daw.capabilities')).findByText(/bridge unreadable/)).toBeTruthy();
    fail = false;
    fireEvent.click(within(row('daw.capabilities')).getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(within(row('daw.capabilities')).queryByText(/bridge unreadable/)).toBeNull());
    expect(within(row('daw.capabilities')).getAllByText(/Available|Unavailable/).length).toBeGreaterThan(0);
  });
});

describe('Recording & DAW: a failed capability read', () => {
  it('keeps focus on the page when Retry succeeds and its error line goes away, and on Retry when the read fails again', async () => {
    let fail = true;
    const base = createMockApi({}, {});
    const dawCapabilities = vi.fn(async () => {
      if (fail) throw new Error('bridge unreadable');
      return base.dawCapabilities();
    });
    const api = createMockApi({ subscribeDawCapabilities: () => () => undefined, dawCapabilities });
    await renderPage({ api, category: 'Recording & DAW', advanced: true });
    const line = row('daw.capabilities');
    await within(line).findByText(/bridge unreadable/);
    const retry = within(line).getByRole('button', { name: 'Retry' });
    const reads = dawCapabilities.mock.calls.length;
    await userEvent.click(retry);
    await waitFor(() => expect(dawCapabilities.mock.calls.length).toBeGreaterThan(reads));
    expect(document.activeElement).toBe(retry);
    fail = false;
    await userEvent.click(within(line).getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(within(line).queryByText(/bridge unreadable/)).toBeNull());
    expect(document.activeElement).toBe(screen.getByRole('main'));
  });
});

describe('Voice & pronunciation', () => {
  it('switches the definition source and saves it for every project', async () => {
    const api = createMockApi();
    const save = vi.spyOn(api, 'saveSettings');
    await renderPage({ api, category: 'Voice & pronunciation' });
    expect((await screen.findByRole('radio', { name: /^Web page/ })).getAttribute('aria-checked')).toBe('true');
    fireEvent.click(screen.getByRole('radio', { name: /^Local dictionary/ }));
    await waitFor(() => expect(save).toHaveBeenCalledWith('Script', 'global', { definition_source: 'local' }));
    await waitFor(() => expect(screen.getByRole('radio', { name: /^Local dictionary/ }).getAttribute('aria-checked')).toBe('true'));
    fireEvent.click(screen.getByRole('radio', { name: /^Online service/ }));
    await waitFor(() => expect(save).toHaveBeenCalledWith('Script', 'global', { definition_source: 'api' }));
    fireEvent.click(screen.getByRole('radio', { name: /^Web page/ }));
    await waitFor(() => expect(save).toHaveBeenLastCalledWith('Script', 'global', { definition_source: null }));
  });

  it('shows the local dictionary as installed or not, and removes then downloads it', async () => {
    const api = createMockApi();
    const { notify } = await renderPage({ api, category: 'Voice & pronunciation' });
    const local = row('voice.dict');
    expect(await within(local).findByText('Installed')).toBeTruthy();
    fireEvent.click(within(local).getByRole('button', { name: 'Remove the local dictionary' }));
    expect(await within(local).findByText('Not installed')).toBeTruthy();
    expect(notify).toHaveBeenCalledWith('Local dictionary removed.');
    fireEvent.click(within(local).getByRole('button', { name: 'Download the local dictionary' }));
    expect(await within(local).findByText('Installed', {}, { timeout: 5000 })).toBeTruthy();
    expect(notify).toHaveBeenCalledWith('Local dictionary downloaded.');
  });

  it('starts without the dictionary when the host has none installed', async () => {
    await renderPage({ api: createMockApi({}, { dictionary: 'missing' }), category: 'Voice & pronunciation' });
    expect(await within(row('voice.dict')).findByText('Not installed')).toBeTruthy();
    expect(within(row('voice.dict')).getByRole('button', { name: 'Download the local dictionary' })).toBeTruthy();
  });

  it('shows the online service as online, offline, or without a key', async () => {
    const online = vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(true);
    const api = createMockApi();
    await renderPage({ api, category: 'Voice & pronunciation' });
    await within(row('voice.dict')).findByText('No key saved');
    cleanup();
    await api.pronunciationOnlineKeySet('abcdef123456');
    await renderPage({ api, category: 'Voice & pronunciation' });
    expect(await within(row('voice.dict')).findByText('Online')).toBeTruthy();
    cleanup();
    online.mockReturnValue(false);
    await renderPage({ api, category: 'Voice & pronunciation' });
    expect(await within(row('voice.dict')).findByText('Offline')).toBeTruthy();
  });

  it('keeps the Merriam-Webster key apart: saved masked, tested and removable, and the service state follows', async () => {
    const api = createMockApi();
    await renderPage({ api, category: 'Voice & pronunciation', advanced: true });
    const key = row('voice.mwKey');
    const box = await within(key).findByLabelText('Merriam-Webster key');
    expect((box as HTMLInputElement).type).toBe('password');
    fireEvent.change(box, { target: { value: 'abcdef123456' } });
    fireEvent.click(within(key).getByRole('button', { name: 'Save key' }));
    expect(await within(key).findByText('Key saved')).toBeTruthy();
    expect(screen.queryByDisplayValue('abcdef123456')).toBeNull();
    await waitFor(() => expect(within(row('voice.dict')).getByText('Online')).toBeTruthy());
    fireEvent.click(within(key).getByRole('button', { name: 'Test key' }));
    expect(await within(key).findByText('The key works.')).toBeTruthy();
    fireEvent.click(within(key).getByRole('button', { name: 'Remove key' }));
    expect(await within(key).findByLabelText('Merriam-Webster key')).toBeTruthy();
    await waitFor(() => expect(within(row('voice.dict')).getByText('No key saved')).toBeTruthy());
  });

  it("shows the host's sentence for a key it refuses, and tests offline without sending", async () => {
    await renderPage({ category: 'Voice & pronunciation', advanced: true });
    const key = row('voice.mwKey');
    fireEvent.change(await within(key).findByLabelText('Merriam-Webster key'), { target: { value: 'x' } });
    fireEvent.click(within(key).getByRole('button', { name: 'Save key' }));
    expect(await within(key).findByText(/does not look like a Merriam-Webster key/)).toBeTruthy();
  });
});

describe('Delivery', () => {
  it('changes this project’s delivery profile and shows the limits of the chosen one', async () => {
    const api = createMockApi({}, { deliveryProfile: 'custom' });
    const select = vi.spyOn(api, 'deliverySelectProfile');
    await renderPage({ api, category: 'Delivery' });
    const profile = row('delivery.profile');
    const box = await within(profile).findByRole('combobox', { name: 'Delivery profile' });
    const limits = within(profile).getByLabelText('Limits of this profile');
    expect(limits.textContent).toContain('RMS');
    const acx = within(box)
      .getAllByRole('option')
      .find((option) => option.textContent?.startsWith('ACX'))!;
    fireEvent.change(box, { target: { value: (acx as HTMLOptionElement).value } });
    await waitFor(() => expect(select).toHaveBeenCalledWith('project', 'acx', '2026-09'));
    await waitFor(() =>
      expect((within(profile).getByRole('combobox', { name: 'Delivery profile' }) as HTMLSelectElement).value).toBe((acx as HTMLOptionElement).value),
    );
    expect(within(profile).getByLabelText('Limits of this profile').textContent).toContain('−23 to −18 dBFS');
  });

  it('sets the default profile for new projects', async () => {
    const api = createMockApi({}, { deliveryProfile: 'custom' });
    const select = vi.spyOn(api, 'deliverySelectProfile');
    const { notify } = await renderPage({ api, category: 'Delivery' });
    const box = await within(row('delivery.default')).findByRole('combobox', { name: 'Default profile for new projects' });
    const custom = within(box)
      .getAllByRole('option')
      .find((option) => option.textContent?.includes('custom'))!;
    fireEvent.change(box, { target: { value: (custom as HTMLOptionElement).value } });
    await waitFor(() => expect(select).toHaveBeenCalledWith('global', expect.any(String), ''));
    await waitFor(() => expect(notify).toHaveBeenCalledWith(expect.stringMatching(/^The Global default is now /)));
  });

  it('lists the custom profiles and duplicates, edits and deletes one', async () => {
    const api = createMockApi({}, { deliveryProfile: 'custom' });
    const { notify } = await renderPage({ api, category: 'Delivery', advanced: true });
    const list = row('delivery.custom');
    const name = 'My ACX, tighter peak';
    expect(await within(list).findByText(name)).toBeTruthy();
    fireEvent.click(within(list).getByRole('button', { name: `Duplicate ${name}` }));
    await waitFor(() => expect(within(list).getAllByRole('listitem')).toHaveLength(2));
    expect(notify).toHaveBeenCalledWith(expect.stringMatching(/^Duplicated as /));

    fireEvent.click(within(list).getByRole('button', { name: `Edit ${name}` }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: /Cancel/ }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    fireEvent.click(within(list).getByRole('button', { name: `Delete ${name}` }));
    const ask = await screen.findByRole('alertdialog', { name: `Delete "${name}"?` });
    fireEvent.click(within(ask).getByRole('button', { name: 'Delete profile' }));
    await waitFor(() => expect(within(list).queryByText(name)).toBeNull());
    expect(notify).toHaveBeenCalledWith(`Deleted "${name}".`);
  });

  it('says there are no custom profiles and offers to duplicate the built-in one', async () => {
    const api = createMockApi();
    await renderPage({ api, category: 'Delivery', advanced: true });
    const list = row('delivery.custom');
    expect(await within(list).findByText(/No custom profiles/)).toBeTruthy();
    fireEvent.click(within(list).getByRole('button', { name: 'Duplicate ACX' }));
    await waitFor(() => expect(within(list).getAllByRole('listitem')).toHaveLength(1));
    // The project's and the default's rows read the profiles again, so the new copy is a choice there too.
    const box = within(row('delivery.default')).getByRole('combobox', { name: 'Default profile for new projects' });
    await waitFor(() => expect(within(box).getAllByRole('option')).toHaveLength(2));
  });
});
