// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../../api/ApiContext';
import { MOCK_ACX, mockCustomProfile } from '../../../api/deliveryProfilesMock';
import { createMockApi } from '../../../api/mockApi';
import type { DeliveryProfile, DeliveryProfilesApi, DeliveryProfilesState, NarrationApi } from '../../../types';
import { ProfileCard } from './ProfileCard';
import { limitsOf } from './limitText';

afterEach(cleanup);

const stateOf = (profile: DeliveryProfile, profiles = profile.builtIn ? [MOCK_ACX, mockCustomProfile()] : [MOCK_ACX, profile]): DeliveryProfilesState => ({
  profiles,
  globalDefault: { id: MOCK_ACX.id },
  hasProject: true,
  projectChoice: null,
  projectProfile: profile.builtIn ? `${profile.id}@${profile.version}` : `${profile.id}@r${profile.revision}`,
});

function mount(overrides: Partial<DeliveryProfilesApi> = {}, profile: DeliveryProfile = MOCK_ACX, props: Parameters<typeof ProfileCard>[0] = {}) {
  const state = stateOf(profile);
  const api: NarrationApi = createMockApi({
    deliveryProfiles: async () => state,
    deliverySelectProfile: vi.fn(async () => state),
    deliverySaveProfile: vi.fn(async () => profile),
    ...overrides,
  });
  render(
    <ApiProvider api={api}>
      <ProfileCard {...props} />
    </ApiProvider>,
  );
  return api;
}

describe('ProfileCard', () => {
  it('acx-is-built-in-and-read-only: limits and format are text, the name is a pill, no input exists', async () => {
    mount();
    expect(await screen.findByText('Built in')).toBeTruthy();
    expect(screen.getByText('RMS')).toBeTruthy();
    expect(screen.getByText('−23 to −18 dBFS')).toBeTruthy();
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('a-custom-profile-has-editable-limits-format-and-name', async () => {
    mount({}, mockCustomProfile());
    expect(await screen.findByRole('textbox', { name: 'Profile name' })).toHaveProperty('value', 'My ACX, tighter peak');
    expect(screen.getByRole('textbox', { name: 'RMS lowest' })).toHaveProperty('value', '-24');
    expect(screen.getByRole('textbox', { name: 'Peak highest' })).toHaveProperty('value', '-3.5');
    expect(screen.getAllByText('no lowest').length).toBeGreaterThan(0);
    expect(screen.getAllByText('dBFS').length).toBeGreaterThan(0);
    expect(screen.getByText('Files')).toBeTruthy();
    expect(screen.getByRole('textbox', { name: 'File length highest' })).toHaveProperty('value', '120');
  });

  it('a-limit-that-is-not-a-number-is-ignored, and an edit saves with the host rule ids', async () => {
    const custom = mockCustomProfile();
    const save = vi.fn(async () => custom);
    mount({ deliverySaveProfile: save }, custom);
    const user = userEvent.setup();
    const box = await screen.findByRole('textbox', { name: 'RMS lowest' });
    await user.clear(box);
    await user.type(box, 'loud{Enter}');
    expect(save).not.toHaveBeenCalled();
    expect(box).toHaveProperty('value', '-24');
    await user.clear(box);
    await user.type(box, '-25{Enter}');
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    const edit = (save.mock.calls[0] as unknown as [{ id: string; rules: { id: string; min: number | null }[] }])[0];
    expect(edit.id).toBe(custom.id);
    expect(edit.rules.map((rule) => rule.id)).toEqual(custom.rules.map((rule) => rule.id));
    expect(edit.rules.find((rule) => rule.id === 'acx.rms')?.min).toBe(-25);
  });

  it('changing-the-profile-or-a-limit-drops-the-built-state', async () => {
    const onChange = vi.fn();
    mount({}, mockCustomProfile(), { onChange });
    const user = userEvent.setup();
    const box = await screen.findByRole('textbox', { name: 'Peak highest' });
    await user.clear(box);
    await user.type(box, '-4{Enter}');
    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1));
    await user.selectOptions(screen.getByRole('combobox'), 'acx@2026-09');
    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(2));
  });

  it('the-menu-lists-built-ins-first-and-marks-them', async () => {
    const select = vi.fn(async () => stateOf(MOCK_ACX));
    mount({ deliverySelectProfile: select }, mockCustomProfile());
    const user = userEvent.setup();
    const menu = await screen.findByRole('combobox');
    const labels = Array.from(menu.querySelectorAll('option')).map((option) => option.textContent);
    expect(labels).toEqual(['ACX (built in)', 'My ACX, tighter peak']);
    await user.selectOptions(menu, 'acx@2026-09');
    expect(select).toHaveBeenCalledWith('project', 'acx', '2026-09');
  });

  it('profile-gated-rows-use-the-one-lookup: no profile id literal in the folder', () => {
    const dir = __dirname;
    const offenders = readdirSync(dir)
      .filter((file) => /\.tsx?$/.test(file) && !/\.(test|stories)\./.test(file))
      .filter((file) => /['"`](acx|none)['"`]/i.test(readFileSync(join(dir, file), 'utf8')));
    expect(offenders).toEqual([]);
  });

  it('a-custom-edit-flips-a-pass-to-a-fail: the exported limits carry the edited number', async () => {
    const custom = mockCustomProfile();
    const edited: DeliveryProfile = { ...custom, rules: custom.rules.map((rule) => (rule.id === 'acx.peak' ? { ...rule, max: -6 } : rule)) };
    expect(limitsOf(custom).find((limit) => limit.id === 'acx.peak')?.max).toBe(-3.5);
    expect(limitsOf(edited).find((limit) => limit.id === 'acx.peak')?.max).toBe(-6);
    const onProfile = vi.fn();
    mount({}, edited, { onProfile });
    await screen.findByText('Files');
    expect(onProfile).toHaveBeenCalledWith(edited, limitsOf(edited));
  });

  it('the-host-refuses-an-edit-to-a-built-in-and-the-card-shows-its-sentence', async () => {
    const sentence = 'a built-in profile cannot be changed; duplicate it to change its numbers';
    const custom = mockCustomProfile();
    mount({ deliverySaveProfile: async () => Promise.reject(new Error(sentence)) }, custom);
    const user = userEvent.setup();
    const box = await screen.findByRole('textbox', { name: 'RMS lowest' });
    await user.clear(box);
    await user.type(box, '-25{Enter}');
    expect((await screen.findByRole('alert')).textContent).toContain(sentence);
  });
});
