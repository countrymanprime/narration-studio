// @vitest-environment jsdom
// The first-use tip over the browser mock host: shown until it is dismissed, kept dismissed in the host's settings, and never lost to a
// failed read or save.
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../api/ApiContext';
import { createMockApi } from '../api/mockApi';
import { overlay } from '../overlay/overlayService';
import type { NarrationApi } from '../types';
import { FirstUseTip } from './FirstUseTip';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const mount = (api: NarrationApi, used = false) =>
  render(
    <ApiProvider api={api}>
      <FirstUseTip id="script.select-text" used={used} />
    </ApiProvider>,
  );

const seen = async (api: NarrationApi) => (await api.settingsForScope('global')).Tips?.find((field) => field.key === 'seen')?.effectiveValue;

describe('a first-use tip', () => {
  it('shows its sentence, and Got it hides it and keeps it hidden for a new page of the same host', async () => {
    const api = createMockApi();
    const first = mount(api);
    expect((await screen.findByRole('complementary', { name: 'Tip' })).textContent).toContain('Select text in the reader');
    await userEvent.setup().click(screen.getByRole('button', { name: 'Got it' }));
    expect(screen.queryByRole('complementary', { name: 'Tip' })).toBeNull();
    await waitFor(async () => expect(await seen(api)).toBe('script.select-text'));
    first.unmount();
    mount(api);
    await waitFor(() => expect(api.settingsForScope).toBeDefined());
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.queryByRole('complementary', { name: 'Tip' })).toBeNull();
  });

  it('is dismissed by using what it explains, with no button press', async () => {
    const api = createMockApi();
    const view = mount(api);
    await screen.findByRole('complementary', { name: 'Tip' });
    view.rerender(
      <ApiProvider api={api}>
        <FirstUseTip id="script.select-text" used />
      </ApiProvider>,
    );
    await waitFor(async () => expect(await seen(api)).toBe('script.select-text'));
    expect(screen.queryByRole('complementary', { name: 'Tip' })).toBeNull();
  });

  it('shows nothing when the host cannot say what was dismissed, rather than guess', async () => {
    const api = { ...createMockApi(), settingsForScope: () => Promise.reject(new Error('unreadable')) } as NarrationApi;
    mount(api);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.queryByRole('complementary', { name: 'Tip' })).toBeNull();
  });

  it('puts the tip back and says so when the dismissal cannot be saved', async () => {
    const toast = vi.spyOn(overlay, 'toast').mockImplementation(() => undefined);
    const api = { ...createMockApi(), saveSettings: () => Promise.reject(new Error('disk is read-only')) } as NarrationApi;
    mount(api);
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Got it' }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith('The tip could not be saved as read: disk is read-only', { tone: 'error' }));
    expect(screen.getByRole('complementary', { name: 'Tip' })).toBeTruthy();
  });
});
