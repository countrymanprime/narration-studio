// @vitest-environment jsdom
// The profile card's state matrix (docs/research/delivery-state-matrix.md, D1 to D4): each test is one cell.
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../../api/ApiContext';
import { MOCK_ACX, mockCustomProfile } from '../../../api/deliveryProfilesMock';
import { createMockApi } from '../../../api/mockApi';
import type { DeliveryProfile, DeliveryProfilesApi, DeliveryProfilesState } from '../../../types';
import { ProfileCard } from './ProfileCard';
import { fromShown } from './limitText';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const keyOf = (profile: DeliveryProfile) => (profile.builtIn ? `${profile.id}@${profile.version}` : `${profile.id}@r${profile.revision}`);
const stateOf = (profile: DeliveryProfile, profiles = [MOCK_ACX, mockCustomProfile()]): DeliveryProfilesState => ({
  profiles,
  globalDefault: { id: MOCK_ACX.id },
  hasProject: true,
  projectChoice: null,
  projectProfile: keyOf(profile),
});

function mount(overrides: Partial<DeliveryProfilesApi> = {}, profile: DeliveryProfile = mockCustomProfile()) {
  const api = createMockApi({
    deliveryProfiles: async () => stateOf(profile),
    deliverySelectProfile: vi.fn(async () => stateOf(profile)),
    deliverySaveProfile: vi.fn(async () => profile),
    ...overrides,
  });
  render(
    <ApiProvider api={api}>
      <ProfileCard />
    </ApiProvider>,
  );
  return api;
}

const lastSave = (save: ReturnType<typeof vi.fn>) =>
  (save.mock.calls.at(-1) as unknown as [{ name: string; rules: { id: string; min: number | null; max: number | null }[] }])[0];

describe('D1 Profile menu', () => {
  it('loading, failed and recovering: the card says it could not read the profiles, with Check again', async () => {
    let fail = true;
    mount({
      deliveryProfiles: async () => {
        if (fail) throw new Error('the profile file is locked');
        return stateOf(mockCustomProfile());
      },
    });
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('The delivery profiles could not be read, not heard yet: the profile file is locked');
    fail = false;
    await userEvent.click(screen.getByRole('button', { name: 'Check again' }));
    expect(await screen.findByRole('textbox', { name: 'Profile name' })).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it("refused: the host's sentence is shown and the menu works again", async () => {
    const select = vi.fn().mockRejectedValueOnce(new Error('there is no delivery profile "gone"')).mockResolvedValue(stateOf(MOCK_ACX));
    mount({ deliverySelectProfile: select });
    const user = userEvent.setup();
    await user.selectOptions(await screen.findByRole('combobox'), 'acx@2026-09');
    expect((await screen.findByRole('alert')).textContent).toContain('there is no delivery profile "gone"');
    expect(screen.getByRole('combobox')).toHaveProperty('disabled', false);
    await user.selectOptions(screen.getByRole('combobox'), 'acx@2026-09');
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
  });

  it('rapid double-fire: the menu is off while the host answers, so a second choice is not sent', async () => {
    let finish!: (state: DeliveryProfilesState) => void;
    const select = vi.fn(() => new Promise<DeliveryProfilesState>((resolve) => (finish = resolve)));
    mount({ deliverySelectProfile: select });
    const menu = await screen.findByRole('combobox');
    fireEvent.change(menu, { target: { value: 'acx@2026-09' } });
    expect(menu).toHaveProperty('disabled', true);
    fireEvent.change(menu, { target: { value: 'acx@2026-09' } });
    expect(select).toHaveBeenCalledOnce();
    await act(async () => finish(stateOf(MOCK_ACX)));
    await waitFor(() => expect(screen.getByRole('combobox')).toHaveProperty('disabled', false));
  });

  it('stale: a profile changed in Settings is picked up when the window regains focus', async () => {
    let current: DeliveryProfile = mockCustomProfile();
    mount({ deliveryProfiles: async () => stateOf(current) });
    expect(await screen.findByRole('textbox', { name: 'Profile name' })).toBeTruthy();
    current = MOCK_ACX;
    act(() => window.dispatchEvent(new Event('focus')));
    expect(await screen.findByText('Built in')).toBeTruthy();
    expect(screen.queryByRole('textbox', { name: 'Profile name' })).toBeNull();
  });

  it('the host went quiet after the card was drawn: it says it cannot tell and keeps the card', async () => {
    let fail = false;
    mount({
      deliveryProfiles: async () => {
        if (fail) throw new Error('gone quiet');
        return stateOf(mockCustomProfile());
      },
    });
    expect(await screen.findByRole('textbox', { name: 'Profile name' })).toBeTruthy();
    fail = true;
    act(() => window.dispatchEvent(new Event('focus')));
    expect((await screen.findByRole('alert')).textContent).toMatch(/Can't tell whether this is still the project's profile, last heard \d+ s ago: gone quiet/);
    expect(screen.getByRole('textbox', { name: 'Profile name' })).toBeTruthy();
  });

  it('long, right-to-left and emoji profile names are listed whole in the menu', async () => {
    const names = ['ملف التسليم 🎧', 'x'.repeat(200), 'פרופיל ' + '📚'.repeat(20)];
    const custom = names.map((name, i): DeliveryProfile => ({ ...mockCustomProfile(), id: `custom-${i}`, name }));
    mount({ deliveryProfiles: async () => stateOf(custom[0]!, [MOCK_ACX, ...custom]) }, custom[0]);
    const menu = await screen.findByRole('combobox');
    const labels = Array.from(menu.querySelectorAll('option')).map((option) => option.textContent);
    expect(labels).toEqual(['ACX (built in)', ...names]);
  });
});

describe('D2 Profile name', () => {
  it('blank or spaces only: ignored and the box shows the saved name again', async () => {
    const save = vi.fn(async () => mockCustomProfile());
    mount({ deliverySaveProfile: save });
    const user = userEvent.setup();
    const box = await screen.findByRole('textbox', { name: 'Profile name' });
    await user.clear(box);
    await user.type(box, '   {Enter}');
    expect(save).not.toHaveBeenCalled();
    expect(box).toHaveProperty('value', 'My ACX, tighter peak');
  });

  it('blank: says the name was kept, because a profile needs one', async () => {
    mount();
    const user = userEvent.setup();
    const box = await screen.findByRole('textbox', { name: 'Profile name' });
    await user.clear(box);
    await user.type(box, '  {Enter}');
    expect((await screen.findByRole('alert')).textContent).toBe('A profile needs a name, so the name was left as it was.');
  });

  it('too long: says the name was kept, in the same words as a blank one, and never asks the host', async () => {
    const save = vi.fn(async () => mockCustomProfile());
    mount({ deliverySaveProfile: save });
    const user = userEvent.setup();
    const box = await screen.findByRole('textbox', { name: 'Profile name' });
    await user.clear(box);
    await user.click(box);
    await user.paste('x'.repeat(81));
    await user.keyboard('{Enter}');
    expect((await screen.findByRole('alert')).textContent).toBe("A profile's name can be at most 80 characters, so the name was left as it was.");
    expect(save).not.toHaveBeenCalled();
    expect(box).toHaveProperty('value', 'My ACX, tighter peak');
  });

  it('80 characters exactly: saved', async () => {
    const save = vi.fn(async () => mockCustomProfile());
    mount({ deliverySaveProfile: save });
    const user = userEvent.setup();
    const box = await screen.findByRole('textbox', { name: 'Profile name' });
    await user.clear(box);
    await user.click(box);
    await user.paste('x'.repeat(80));
    await user.keyboard('{Enter}');
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
  });

  it('locked while a build runs: no name or limit boxes, and the menu is off', async () => {
    const api = createMockApi({ deliveryProfiles: async () => stateOf(mockCustomProfile()) });
    render(
      <ApiProvider api={api}>
        <ProfileCard locked />
      </ApiProvider>,
    );
    expect(await screen.findByText('Locked while it builds')).toBeTruthy();
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.getByRole('combobox')).toHaveProperty('disabled', true);
  });

  it('long (80 characters), right-to-left and emoji: saved as typed, surrounding spaces trimmed', async () => {
    const save = vi.fn(async () => mockCustomProfile());
    mount({ deliverySaveProfile: save });
    const user = userEvent.setup();
    const box = await screen.findByRole('textbox', { name: 'Profile name' });
    for (const name of ['ملف التسليم 🎧', 'פרופיל 📚', 'y'.repeat(80)]) {
      await user.clear(box);
      await user.type(box, `  ${name}  {Enter}`);
      await waitFor(() => expect(lastSave(save).name).toBe(name));
    }
  });

  it('the host refuses the name (here, one already taken): its sentence is shown and the box reverts', async () => {
    const save = vi.fn().mockRejectedValue(new Error('a profile named "Mine" already exists'));
    mount({ deliverySaveProfile: save });
    const user = userEvent.setup();
    const box = await screen.findByRole('textbox', { name: 'Profile name' });
    await user.clear(box);
    await user.type(box, 'Mine{Enter}');
    expect((await screen.findByRole('alert')).textContent).toContain('already exists');
    expect(box).toHaveProperty('value', 'My ACX, tighter peak');
  });

  it('leave mid-action: leaving with a half-typed name saves nothing', async () => {
    const save = vi.fn(async () => mockCustomProfile());
    mount({ deliverySaveProfile: save });
    const user = userEvent.setup();
    const box = await screen.findByRole('textbox', { name: 'Profile name' });
    await user.clear(box);
    await user.type(box, 'half typed');
    cleanup();
    expect(save).not.toHaveBeenCalled();
  });
});

describe('D3 and D4 Limits and the longest file', () => {
  const typed = (text: string) => fromShown({ metric: 'rms', unit: 'dBFS' } as never, text);

  it('what counts as a number: signs, decimals, exponents and spaces do; blanks, words and infinities do not', () => {
    expect(typed('-25')).toBe(-25);
    expect(typed(' 7.5 ')).toBe(7.5);
    expect(typed('1e3')).toBe(1000);
    expect(typed('0')).toBe(0);
    expect(typed('\u221225')).toBe(-25);
    expect(Object.is(typed('-0'), 0)).toBe(true);
    expect(Object.is(fromShown({ metric: 'duration_seconds', unit: 's' } as never, '-0'), 0)).toBe(true);
    for (const bad of ['', '   ', 'loud', 'NaN', 'Infinity', '-Infinity', '1e999', '--5', '5 dB']) expect(typed(bad), bad).toBeUndefined();
    expect(fromShown({ metric: 'duration_seconds', unit: 's' } as never, '90')).toBe(5400);
  });

  it('text that is not a number says so, and an earlier refusal does not stay up', async () => {
    const save = vi.fn().mockRejectedValueOnce(new Error('RMS: the lowest (-10) is above the highest (-18)')).mockResolvedValue(mockCustomProfile());
    mount({ deliverySaveProfile: save });
    const user = userEvent.setup();
    const box = await screen.findByRole('textbox', { name: 'RMS lowest' });
    await user.clear(box);
    await user.type(box, '-10{Enter}');
    expect((await screen.findByRole('alert')).textContent).toContain('the lowest (-10)');
    await user.clear(box);
    await user.type(box, 'abc{Enter}');
    expect((await screen.findByRole('alert')).textContent).toBe('RMS: that is not a number, so the limit was left as it was.');
    expect(box).toHaveProperty('value', '-24');
  });

  it('zero, negative and huge numbers are sent as typed for the host to judge', async () => {
    const save = vi.fn(async () => mockCustomProfile());
    mount({ deliverySaveProfile: save });
    const user = userEvent.setup();
    const box = await screen.findByRole('textbox', { name: 'RMS lowest' });
    for (const [text, value] of [
      ['0', 0],
      ['-96', -96],
      ['99999999', 99999999],
    ] as const) {
      await user.clear(box);
      await user.type(box, `${text}{Enter}`);
      await waitFor(() => expect(lastSave(save).rules.find((rule) => rule.id === 'acx.rms')?.min).toBe(value));
    }
  });

  it("the lowest above the highest is the host's refusal: its sentence is shown and the box reverts", async () => {
    const save = vi.fn().mockRejectedValue(new Error('RMS: the lowest (-10) is above the highest (-18)'));
    mount({ deliverySaveProfile: save });
    const user = userEvent.setup();
    const box = await screen.findByRole('textbox', { name: 'RMS lowest' });
    await user.clear(box);
    await user.type(box, '-10{Enter}');
    expect((await screen.findByRole('alert')).textContent).toContain('the lowest (-10) is above the highest (-18)');
    expect(box).toHaveProperty('value', '-24');
  });

  it('the longest file is edited in minutes and saved in seconds', async () => {
    const save = vi.fn(async () => mockCustomProfile());
    mount({ deliverySaveProfile: save });
    const user = userEvent.setup();
    const box = await screen.findByRole('textbox', { name: 'File length highest' });
    await user.clear(box);
    await user.type(box, '90{Enter}');
    await waitFor(() => expect(lastSave(save).rules.find((rule) => rule.id === 'acx.file_length')?.max).toBe(5400));
  });

  it('a save that never answers leaves the page usable and the menu off, with no second save', async () => {
    const save = vi.fn(() => new Promise<DeliveryProfile>(() => undefined));
    mount({ deliverySaveProfile: save });
    const user = userEvent.setup();
    const box = await screen.findByRole('textbox', { name: 'RMS lowest' });
    await user.clear(box);
    await user.type(box, '-25{Enter}');
    expect(save).toHaveBeenCalledOnce();
    expect(screen.getByRole('combobox')).toHaveProperty('disabled', true);
  });

  it('a built-in has no boxes at all, so nothing can be typed into it', async () => {
    mount({ deliveryProfiles: async () => stateOf(MOCK_ACX) }, MOCK_ACX);
    expect(await screen.findByText('Built in')).toBeTruthy();
    expect(screen.queryByRole('textbox')).toBeNull();
  });
});
