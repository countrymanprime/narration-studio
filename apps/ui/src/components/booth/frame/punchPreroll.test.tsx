// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../../api/ApiContext';
import { createMockApi } from '../../../api/mockApi';
import { defaultKeymap } from '../../../input/keymap';
import type { NarrationApi } from '../../../types';
import { BoothFooter } from './BoothFooter';

afterEach(cleanup);

// The punch pre-roll (Teleprompter.punch_preroll_seconds, a global number the host reads in "Punch from here") is set in the Levels menu, next to the
// microphone, and only where a DAW punches. The Settings page lists it under Set on a page and opens the Booth.
function menu(engine: 'daw' | 'builtin', over: Partial<NarrationApi> = {}) {
  const save = vi.fn(async () => undefined);
  const api = createMockApi({ saveSettings: save, ...over } as Partial<NarrationApi>);
  render(
    <ApiProvider api={api}>
      <BoothFooter
        record={<button>Record</button>}
        seconds={0}
        recording={false}
        mic={{ engine, dawName: 'REAPER', reachable: true, device: 'USB Mic', onDevice: vi.fn() }}
        roomTone="Room tone −58 dBFS"
        keymap={defaultKeymap()}
      />
    </ApiProvider>,
  );
  return { save, open: () => userEvent.click(screen.getByRole('button', { name: 'Levels' })) };
}

describe('the Levels menu punch pre-roll', () => {
  it('shows the stored pre-roll for a DAW and saves a change at the global layer', async () => {
    const { save, open } = menu('daw');
    await open();
    const box = (await screen.findByRole('textbox', { name: 'Punch pre-roll (seconds)' })) as HTMLInputElement;
    expect(box.value).toBe('3');
    fireEvent.change(box, { target: { value: '5' } });
    fireEvent.blur(box);
    await waitFor(() => expect(save).toHaveBeenCalledWith('Teleprompter', 'global', { punch_preroll_seconds: '5' }));
  });

  it('clamps a value past the host range instead of saving it', async () => {
    const { save, open } = menu('daw');
    await open();
    const box = await screen.findByRole('textbox', { name: 'Punch pre-roll (seconds)' });
    fireEvent.change(box, { target: { value: '99' } });
    fireEvent.blur(box);
    await waitFor(() => expect(save).toHaveBeenCalledWith('Teleprompter', 'global', { punch_preroll_seconds: '10' }));
  });

  it('is not offered with the built-in recorder, which has no punch', async () => {
    const { open } = menu('builtin');
    await open();
    await screen.findByRole('dialog', { name: 'Levels' });
    expect(screen.queryByRole('textbox', { name: 'Punch pre-roll (seconds)' })).toBeNull();
  });

  it('says so when the setting cannot be read, and saves nothing', async () => {
    const { save, open } = menu('daw', {
      settingsForScope: async () => {
        throw new Error('The settings file is unreadable.');
      },
    } as Partial<NarrationApi>);
    await open();
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', expect.stringContaining('The settings file is unreadable.'));
    expect(save).not.toHaveBeenCalled();
  });

  it('shows the host sentence when a save is refused, and keeps the typed value out of the stored one', async () => {
    const { open } = menu('daw', {
      saveSettings: async () => {
        throw new Error('The settings file is read-only.');
      },
    } as Partial<NarrationApi>);
    await open();
    const box = await screen.findByRole('textbox', { name: 'Punch pre-roll (seconds)' });
    fireEvent.change(box, { target: { value: '4' } });
    fireEvent.blur(box);
    expect(await screen.findByText(/read-only/)).toBeTruthy();
  });
});
