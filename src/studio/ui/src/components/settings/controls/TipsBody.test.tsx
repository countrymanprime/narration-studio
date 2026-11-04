// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../../api/ApiContext';
import { createMockApi } from '../../../api/mockApi';
import type { NarrationApi } from '../../../types';
import { FirstUseTip } from '../../../tips/FirstUseTip';
import { ROWS } from '../registry/rows';
import { search } from '../registry/search';
import { LIVE_CHANGED } from '../data/customChanged';
import { SettingsHostProvider, type SettingsHost } from '../row/SettingsHost';
import { TipsBody } from './AppearanceBodies';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const notify = vi.fn();
const host = { notify } as unknown as SettingsHost;
const seen = async (api: NarrationApi) => (await api.settingsForScope('global')).Tips?.find((field) => field.key === 'seen')?.effectiveValue;

const mount = (api: NarrationApi) =>
  render(
    <ApiProvider api={api}>
      <SettingsHostProvider value={host}>
        <TipsBody />
        <FirstUseTip id="script.select-text" used={false} />
      </SettingsHostProvider>
    </ApiProvider>,
  );

describe('the first-use tips setting (parity audit)', () => {
  it('is a row under App & updates, found by the words a narrator uses, and Changed reads the live store', () => {
    expect(ROWS.find((row) => row.id === 'app.tips')).toMatchObject({ cat: 'app', scope: 'computer' });
    for (const query of ['show tips again', 'reset tips', 'first use hints']) expect(search(query).some((hit) => hit.row?.id === 'app.tips')).toBe(true);
    const context = { voiceSetup: {} as never, syncConsent: undefined };
    expect(LIVE_CHANGED['app.tips']?.({ ...context, tipsSeen: new Set() })).toBe(false);
    expect(LIVE_CHANGED['app.tips']?.({ ...context, tipsSeen: null })).toBe(false);
    expect(LIVE_CHANGED['app.tips']?.({ ...context, tipsSeen: new Set(['script.select-text']) })).toBe(true);
  });

  it('says none are dismissed, and offers nothing to reset', async () => {
    mount(createMockApi());
    expect(await screen.findByText('None dismissed')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Show tips again' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('counts the dismissed tips, and Show tips again clears them in the host and shows a tip that was hidden', async () => {
    const api = createMockApi();
    const user = userEvent.setup();
    mount(api);
    await user.click(await screen.findByRole('button', { name: 'Got it' }));
    expect(await screen.findByText('1 dismissed')).toBeTruthy();
    expect(screen.queryByRole('complementary', { name: 'Tip' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Show tips again' }));
    expect(await screen.findByText('None dismissed')).toBeTruthy();
    expect(await screen.findByRole('complementary', { name: 'Tip' })).toBeTruthy();
    await waitFor(async () => expect(await seen(api)).toBe(''));
  });

  it('says the tips could not be read instead of reading forever, and Retry reads them once more', async () => {
    const api = createMockApi();
    const read = vi.spyOn(api, 'settingsForScope').mockRejectedValueOnce(new Error('no read'));
    const user = userEvent.setup();
    mount(api);
    expect(await screen.findByText('Could not be read')).toBeTruthy();
    expect(screen.queryByText('Reading…')).toBeNull();
    read.mockRestore();
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('None dismissed')).toBeTruthy();
  });

  it('keeps the dismissed tips and says so when the host refuses the reset', async () => {
    const api = createMockApi();
    const user = userEvent.setup();
    mount(api);
    await user.click(await screen.findByRole('button', { name: 'Got it' }));
    await screen.findByText('1 dismissed');
    vi.spyOn(api, 'saveSettings').mockRejectedValueOnce(new Error('disk full'));
    await user.click(screen.getByRole('button', { name: 'Show tips again' }));
    await waitFor(() => expect(notify).toHaveBeenCalledWith(expect.stringContaining('disk full'), 'error'));
    expect(screen.getByText('1 dismissed')).toBeTruthy();
  });
});
