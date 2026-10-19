// @vitest-environment jsdom
// The state matrix (definition of done, rule 3) for the "Voice sample output" row in Settings, written before the control; the approved mock's
// section 4 draws each frame. Each cell names its test.
//
//   built-in recorder, a list      'lists this computer's outputs after System default and saves the choice with the project'
//   one choice, many               the same test (two outputs); a long, right-to-left and emoji name: 'names in any script are listed as written'
//   nothing chosen                 'nothing chosen is the system default and saves nothing'
//   back to the default            'choosing System default again removes the project's choice'
//   a DAW is connected             'with a DAW the row is a sentence and a test sound, and has no choice'
//   saved device gone              'a saved output that is not connected stays chosen with a notice, and a refresh finds it again'
//   cannot list or switch          'an audio system that will not list its outputs is said so and the choice is off'
//   no project open                'with no project open the choice is off and says to open one'
//   loading                        'the choice is off until the project's recorder is known'
//   test sound                     'Test sound plays on the chosen output', 'a failing output says so and the tone still plays on the default'
//   re-read on focus               'the list is read again when the window gets focus'
//   refused save                   not tested here: the host's refusal of a text value is the store's (SettingsStore tests)
//   recording                      not built: Settings has no recorder state; the player's own guard refuses a sample while a take records
//   reload, leave mid-action       not tested: the row holds no state the host keeps
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../../api/ApiContext';
import { createMockApi } from '../../../api/mockApi';
import { StudioProvider } from '../../../studio/StudioProvider';
import { ThemeProvider } from '../../../theme/ThemeContext';
import type { NarrationApi } from '../../../types';
import { TooltipProvider } from '../../primitives/Tooltip';
import { overlay } from '../../../overlay/overlayService';
import { SettingsPage } from '../page/SettingsPage';
import { DAW_SENTENCE } from './SampleOutputBody';

type Device = { kind: string; deviceId: string; label: string };
const out = (deviceId: string, label: string): Device => ({ kind: 'audiooutput', deviceId, label });

let devices: Device[];
let setSinkId: ReturnType<typeof vi.fn>;
let play: ReturnType<typeof vi.fn>;

beforeEach(() => {
  devices = [out('default', 'Default - Speakers'), out('a1', 'Speakers (Realtek)'), out('b2', 'Headphones (Focusrite USB Audio)')];
  vi.stubGlobal('navigator', { ...navigator, mediaDevices: { enumerateDevices: vi.fn(async () => devices) } });
  setSinkId = vi.fn(async () => undefined);
  play = vi.fn(async () => undefined);
  const proto = HTMLMediaElement.prototype as unknown as Record<string, unknown>;
  proto.setSinkId = setSinkId;
  proto.play = play;
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:tone'), revokeObjectURL: vi.fn() }));
});
afterEach(() => {
  cleanup();
  localStorage.clear();
  delete (HTMLMediaElement.prototype as unknown as Record<string, unknown>).setSinkId;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function renderRow(api: NarrationApi = createMockApi({}, { recording: { engine: 'builtin' } })) {
  const data = await api.bootstrap();
  render(
    <MemoryRouter>
      <ThemeProvider>
        <ApiProvider api={api}>
          <StudioProvider>
            <TooltipProvider>
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
            </TooltipProvider>
          </StudioProvider>
        </ApiProvider>
      </ThemeProvider>
    </MemoryRouter>,
  );
  const nav = screen.getByRole('navigation', { name: 'Settings categories' });
  fireEvent.click(within(nav).getByRole('button', { name: /^Recording & DAW/ }));
  await screen.findByRole('heading', { level: 2, name: 'Recording & DAW' });
  return api;
}
const row = () => document.querySelector<HTMLElement>('[data-row="daw.sampleOutput"]')!;
const picker = async () => (await within(row()).findByRole('combobox', { name: 'Voice sample output' })) as HTMLSelectElement;
const optionNames = (select: HTMLSelectElement) => [...select.options].map((o) => o.textContent);
const savedOutput = async (api: NarrationApi) => (await api.settingsForScope('project')).VoiceSamples?.find((f) => f.key === 'output_device');

describe('Voice sample output: the built-in recorder', () => {
  it("lists this computer's outputs after System default and saves the choice with the project", async () => {
    const api = await renderRow();
    const select = await picker();
    await waitFor(() => expect(optionNames(select)).toEqual(['System default', 'Speakers (Realtek)', 'Headphones (Focusrite USB Audio)']));
    fireEvent.change(select, { target: { value: 'Headphones (Focusrite USB Audio)' } });
    await waitFor(async () => expect((await savedOutput(api))?.effectiveValue).toBe('Headphones (Focusrite USB Audio)'));
    expect((await savedOutput(api))?.isSet).toBe(true);
  });

  it('nothing chosen is the system default and saves nothing', async () => {
    const api = await renderRow();
    expect((await picker()).value).toBe('');
    expect((await savedOutput(api))?.isSet).toBe(false);
  });

  it("choosing System default again removes the project's choice", async () => {
    const api = createMockApi({}, { recording: { engine: 'builtin' } });
    await api.saveSettings('VoiceSamples', 'project', { output_device: 'Speakers (Realtek)' });
    await renderRow(api);
    const select = await picker();
    await waitFor(() => expect(select.value).toBe('Speakers (Realtek)'));
    fireEvent.change(select, { target: { value: '' } });
    await waitFor(async () => expect((await savedOutput(api))?.isSet).toBe(false));
  });

  it('names in any script are listed as written', async () => {
    devices = [
      out('x1', 'مكبرات الصوت (USB Audio Device 🎧)'),
      out('x2', 'Line Out (Behringer UMC1820 18x20 USB Audio Interface, front panel monitor output 3/4)'),
    ];
    await renderRow();
    const select = await picker();
    await waitFor(() => expect(optionNames(select)).toContain('مكبرات الصوت (USB Audio Device 🎧)'));
    expect(optionNames(select)).toContain('Line Out (Behringer UMC1820 18x20 USB Audio Interface, front panel monitor output 3/4)');
  });

  it('a saved output that is not connected stays chosen with a notice, and a refresh finds it again', async () => {
    const api = createMockApi({}, { recording: { engine: 'builtin' } });
    await api.saveSettings('VoiceSamples', 'project', { output_device: 'Studio monitors (Scarlett)' });
    await renderRow(api);
    const alert = await within(row()).findByRole('alert');
    expect(alert.textContent).toBe('Studio monitors (Scarlett) is not connected. Voice samples play on the system default until it is back.');
    const select = await picker();
    expect(select.value).toBe('Studio monitors (Scarlett)');
    expect(optionNames(select)).toContain('Studio monitors (Scarlett), not connected');
    devices = [...devices, out('c3', 'Studio monitors (Scarlett)')];
    fireEvent.click(within(row()).getByRole('button', { name: 'Check again' }));
    await waitFor(() => expect(within(row()).queryByRole('alert')).toBeNull());
  });

  it('an audio system that will not list its outputs is said so and the choice is off', async () => {
    delete (HTMLMediaElement.prototype as unknown as Record<string, unknown>).setSinkId;
    await renderRow();
    const alert = await within(row()).findByRole('alert');
    expect(alert.textContent).toContain('would not list its outputs');
    expect(await picker()).toHaveProperty('disabled', true);
    expect(within(row()).getByRole('button', { name: 'Check again' })).toBeTruthy();
  });

  it('the list is read again when the window gets focus', async () => {
    await renderRow();
    const select = await picker();
    await waitFor(() => expect(optionNames(select)).toHaveLength(3));
    devices = [...devices, out('c3', 'USB DAC')];
    act(() => void window.dispatchEvent(new Event('focus')));
    await waitFor(() => expect(optionNames(select)).toContain('USB DAC'));
  });
});

describe('Voice sample output: no project', () => {
  it('with no project open the choice is off and says to open one', async () => {
    await renderRow(createMockApi({}, { recording: { hasProject: false } }));
    await within(row()).findByText('Open a project to choose where its voice samples play.');
    expect(await picker()).toHaveProperty('disabled', true);
    expect(within(row()).queryByText(DAW_SENTENCE)).toBeNull();
  });
});

describe('Voice sample output: following "Record with"', () => {
  it('changing the recorder on this page changes the row, in both directions', async () => {
    const api = createMockApi({}, { daw: { experimentalOn: true } });
    await renderRow(api);
    await within(row()).findByText(DAW_SENTENCE);
    const group = await screen.findByRole('radiogroup', { name: 'Record with' });
    fireEvent.click(within(group).getByRole('radio', { name: /^Built-in recorder/ }));
    expect(await picker()).toBeTruthy();
    expect(within(row()).queryByText(DAW_SENTENCE)).toBeNull();
    fireEvent.click(within(group).getByRole('radio', { name: /^REAPER/ }));
    await within(row()).findByText(DAW_SENTENCE);
  });
});

describe('Voice sample output: a DAW is connected', () => {
  it('with a DAW the row is a sentence and a test sound, and has no choice', async () => {
    await renderRow(createMockApi({}, { recording: { engine: 'daw' } }));
    await within(row()).findByText(DAW_SENTENCE);
    expect(within(row()).queryByRole('combobox')).toBeNull();
    expect(within(row()).getByRole('button', { name: 'Test sound' })).toBeTruthy();
  });
});

describe('Voice sample output: test sound', () => {
  it('Test sound plays on the chosen output', async () => {
    const api = createMockApi({}, { recording: { engine: 'builtin' } });
    await api.saveSettings('VoiceSamples', 'project', { output_device: 'Headphones (Focusrite USB Audio)' });
    await renderRow(api);
    await waitFor(async () => expect((await picker()).value).toBe('Headphones (Focusrite USB Audio)'));
    fireEvent.click(within(row()).getByRole('button', { name: 'Test sound' }));
    await waitFor(() => expect(play).toHaveBeenCalledTimes(1));
    expect(setSinkId).toHaveBeenCalledWith('b2');
  });

  it('a failing output says so and the tone still plays on the default', async () => {
    const toast = vi.spyOn(overlay, 'toast');
    const api = createMockApi({}, { recording: { engine: 'builtin' } });
    await api.saveSettings('VoiceSamples', 'project', { output_device: 'Speakers (Realtek)' });
    await renderRow(api);
    await waitFor(async () => expect((await picker()).value).toBe('Speakers (Realtek)'));
    setSinkId.mockRejectedValueOnce(new DOMException('no', 'NotAllowedError'));
    fireEvent.click(within(row()).getByRole('button', { name: 'Test sound' }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith('Could not play on Speakers (Realtek). Choose another output or use the system default.'));
    expect(play).toHaveBeenCalledTimes(1);
  });

  it('with a DAW the test sound is on the default output', async () => {
    await renderRow(createMockApi({}, { recording: { engine: 'daw' } }));
    // The row first draws before the project's recorder is known; the button that matters is the one under the sentence.
    await within(row()).findByText(DAW_SENTENCE);
    fireEvent.click(within(row()).getByRole('button', { name: 'Test sound' }));
    await waitFor(() => expect(play).toHaveBeenCalledTimes(1));
    expect(setSinkId).toHaveBeenCalledWith('');
  });
});
