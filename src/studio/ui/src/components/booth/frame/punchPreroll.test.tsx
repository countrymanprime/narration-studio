// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../../api/ApiContext';
import { createMockApi } from '../../../api/mockApi';
import { defaultKeymap } from '../../../input/keymap';
import type { DawCapabilitySupport } from '../../../api/contracts/daw';
import type { NarrationApi } from '../../../types';
import { BoothFooter } from './BoothFooter';

afterEach(cleanup);

// The punch pre-roll (Teleprompter.punch_preroll_seconds, a global number the host reads in "Punch from here") is set in the Levels menu, next to the
// microphone, and only where a DAW punches. The Settings page lists it under Set on a page and opens the Booth.
function menu(engine: 'daw' | 'builtin', over: Partial<NarrationApi> = {}, preroll?: DawCapabilitySupport) {
  const save = vi.fn(async () => undefined);
  const api = createMockApi({ saveSettings: save, ...over } as Partial<NarrationApi>, { daw: { toggles: { punch_preroll: 'on' } } });
  render(
    <ApiProvider api={api}>
      <BoothFooter
        record={<button>Record</button>}
        seconds={0}
        recording={false}
        mic={{
          engine,
          dawName: 'REAPER',
          reachable: true,
          device: 'USB Mic',
          onDevice: vi.fn(),
          ...(preroll ? { levels: { monitor: undefined, input: undefined, preroll } } : {}),
        }}
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

describe("the Levels menu punch pre-roll is REAPER's own when REAPER has one", () => {
  const on: DawCapabilitySupport = { level: 'supported', available: true };

  it("shows REAPER's pre-roll in one short line, off, with its length, and never the app's seconds", async () => {
    const { save, open } = menu('daw', {}, on);
    await open();
    expect(await screen.findByText('Pre-roll off · 2 measures (4.0 s)')).toBeTruthy();
    expect(screen.queryByText(/a punch records from the word/)).toBeNull();
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(save).not.toHaveBeenCalled();
  });

  it('puts the explanation behind an info button a keyboard reaches and a screen reader hears', async () => {
    const { open } = menu('daw', {}, on);
    await open();
    const info = await screen.findByRole('button', { name: 'About REAPER’s pre-roll' });
    const about = info.getAttribute('aria-description') ?? '';
    expect(about).toContain('One measure is 2.0 s at the edit cursor.');
    expect(about).toContain('Off, a punch records from the word with no lead-in.');
    expect(about).toContain('“Pre-roll: Toggle pre-roll on record”');
    await userEvent.tab();
    while (document.activeElement !== info && document.activeElement !== document.body) await userEvent.tab();
    expect(document.activeElement).toBe(info);
  });

  it('shows a pre-roll REAPER plays before recording, with its length in seconds', async () => {
    const read = vi.fn(async () => ({ ok: true, onRecord: true, measures: 1, measureSeconds: 1.8, message: '' }));
    const { open } = menu('daw', { dawPunchPreroll: read } as Partial<NarrationApi>, on);
    await open();
    expect(await screen.findByText('Pre-roll on · 1 measure (1.8 s)')).toBeTruthy();
    const about = screen.getByRole('button', { name: 'About REAPER’s pre-roll' }).getAttribute('aria-description') ?? '';
    expect(about).toContain('plays from the bar line 1 measure or more before the word, then records from the word');
  });

  it('reads it again when the window is looked at, since it is changed in REAPER', async () => {
    let onRecord = false;
    const read = vi.fn(async () => ({ ok: true, onRecord, measures: 2, measureSeconds: 2, message: '' }));
    const { open } = menu('daw', { dawPunchPreroll: read } as Partial<NarrationApi>, on);
    await open();
    await screen.findByText(/^Pre-roll off/);
    onRecord = true;
    fireEvent.focus(window);
    expect(await screen.findByText('Pre-roll on · 2 measures (4.0 s)')).toBeTruthy();
  });

  it('shows a fractional length and a long measure as they are', async () => {
    const read = vi.fn(async () => ({ ok: true, onRecord: false, measures: 1.5, measureSeconds: 40, message: '' }));
    const { open } = menu('daw', { dawPunchPreroll: read } as Partial<NarrationApi>, on);
    await open();
    expect(await screen.findByText('Pre-roll off · 1.5 measures (60.0 s)')).toBeTruthy();
  });

  it("says the capability's own sentence when REAPER has a pre-roll the app may not read now", async () => {
    const off: DawCapabilitySupport = { level: 'supported', available: false, reason: 'turned_off', message: 'Turned off in Settings.' };
    const { open } = menu('daw', {}, off);
    await open();
    expect(await screen.findByText('Turned off in Settings.')).toBeTruthy();
    expect(screen.queryByRole('textbox', { name: 'Punch pre-roll (seconds)' })).toBeNull();
  });

  it('says so when REAPER refuses or cannot be reached', async () => {
    const refuse = vi.fn(async () => ({ ok: false, onRecord: false, measures: 0, measureSeconds: 0, message: 'REAPER did not report its pre-roll.' }));
    const first = menu('daw', { dawPunchPreroll: refuse } as Partial<NarrationApi>, on);
    await first.open();
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'REAPER did not report its pre-roll.');
    cleanup();
    const fail = vi.fn(async () => {
      throw new Error('the bridge did not answer');
    });
    const second = menu('daw', { dawPunchPreroll: fail } as Partial<NarrationApi>, on);
    await second.open();
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', expect.stringContaining('the bridge did not answer'));
  });

  it("keeps the app's own pre-roll with a DAW that has none of its own", async () => {
    const none: DawCapabilitySupport = {
      level: 'not_yet_available',
      available: false,
      reason: 'not_yet',
      message: 'Punch pre-roll is not available with Audacity yet.',
    };
    const { open } = menu('daw', {}, none);
    await open();
    expect(await screen.findByRole('textbox', { name: 'Punch pre-roll (seconds)' })).toBeTruthy();
  });
});
