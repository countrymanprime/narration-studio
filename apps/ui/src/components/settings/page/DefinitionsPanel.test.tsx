// @vitest-environment jsdom
// Settings > Definitions and pronunciations (SN-M93) over the browser mock host: the source saved as Script.definition_source, the local
// dictionary asset with Download or Remove, and the online service's status.
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../../api/ApiContext';
import { createMockApi } from '../../../api/mockApi';
import { definitionSourceOf } from '../../../api/schemas/settings';
import { overlay } from '../../../overlay/overlayService';
import type { NarrationApi } from '../../../types';
import { TooltipProvider } from '../../primitives/Tooltip';
import { DefinitionsPanel } from './DefinitionsPanel';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function mount(api: NarrationApi) {
  return render(
    <ApiProvider api={api}>
      <TooltipProvider>
        <DefinitionsPanel />
      </TooltipProvider>
    </ApiProvider>,
  );
}

const panel = () => screen.getByRole('region', { name: 'Definitions and pronunciations' });
const radio = (name: RegExp) => within(panel()).getByRole('radio', { name });
const checked = (name: RegExp) => radio(name).getAttribute('aria-checked');
const saved = async (api: NarrationApi) => definitionSourceOf(await api.settingsForScope('global'));
const localRow = () => radio(/^Local dictionary/).closest('div.flex') as HTMLElement;
const apiRow = () => radio(/^Online service/).closest('div.flex') as HTMLElement;

describe('Definitions and pronunciations (SN-M93)', () => {
  it('switches the source, shows the local dictionary installed or not and the service online or offline', async () => {
    const api = createMockApi();
    await api.pronunciationOnlineKeySet('0123456789abcdef');
    const toast = vi.spyOn(overlay, 'toast');
    const user = userEvent.setup();
    mount(api);

    // The source: web by default, and each choice is saved to the host for every project.
    await waitFor(() => expect(checked(/^Web page/)).toBe('true'));
    await user.click(radio(/^Local dictionary/));
    await waitFor(async () => expect(await saved(api)).toBe('local'));
    expect(checked(/^Local dictionary/)).toBe('true');
    await user.click(radio(/^Online service/));
    await waitFor(async () => expect(await saved(api)).toBe('api'));

    // The local dictionary: installed in the mock, removed, then downloaded again.
    await within(localRow()).findByText('Installed');
    await user.click(within(localRow()).getByRole('button', { name: 'Remove' }));
    await within(localRow()).findByText('Not installed');
    expect(toast).toHaveBeenCalledWith('Local dictionary removed.');
    await user.click(within(localRow()).getByRole('button', { name: 'Download' }));
    await within(localRow()).findByText('Installed', {}, { timeout: 5000 });
    expect(toast).toHaveBeenCalledWith('Local dictionary downloaded.');

    // The online service follows the network.
    expect(within(apiRow()).getByText('Online')).toBeTruthy();
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    window.dispatchEvent(new Event('offline'));
    await within(apiRow()).findByText('Offline');
    window.dispatchEvent(new Event('online'));
    await within(apiRow()).findByText('Online');
  });

  it('reads a source chosen elsewhere (the Words tab) and says when no key is saved for the online service', async () => {
    const api = createMockApi();
    await api.saveSettings('Script', 'global', { definition_source: 'api' });
    mount(api);
    await waitFor(() => expect(checked(/^Online service/)).toBe('true'));
    await within(apiRow()).findByText('No key saved');
  });

  it('puts the source back and says why when the host refuses the save', async () => {
    const api = createMockApi({ saveSettings: async () => Promise.reject(new Error('The settings file is read-only.')) });
    const user = userEvent.setup();
    mount(api);
    await waitFor(() => expect(checked(/^Web page/)).toBe('true'));
    await user.click(radio(/^Local dictionary/));
    expect((await within(panel()).findByRole('alert')).textContent).toContain('The settings file is read-only.');
    expect(checked(/^Web page/)).toBe('true');
  });
});
