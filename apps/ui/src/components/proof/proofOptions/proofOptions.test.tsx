// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../../api/ApiContext';
import { createMockApi } from '../../../api/mockApi';
import type { ScopedSettingField } from '../../../types';
import type { NarrationApi } from '../../../types';
import { ProofOptions } from './ProofOptions';

afterEach(cleanup);

const number = (key: string, label: string, value: string, isSet = false): ScopedSettingField => ({
  key,
  label,
  kind: 'number',
  choices: [],
  value: isSet ? value : '',
  isSet,
  effectiveValue: value,
  effectiveSource: isSet ? 'project' : 'repo default',
  number: { min: 60, max: 3600, step: 1, unit: 's' },
});
const choice = (key: string, label: string, choices: string[], value: string): ScopedSettingField => ({
  key,
  label,
  kind: 'choice',
  choices,
  value: '',
  isSet: false,
  effectiveValue: value,
  effectiveSource: 'repo default',
});
const color = (key: string, label: string, value: string, isSet = false): ScopedSettingField => ({
  key,
  label,
  kind: 'color',
  choices: [],
  value: isSet ? value : '',
  isSet,
  effectiveValue: value,
  effectiveSource: isSet ? 'project' : 'repo default',
});

const FIELDS = {
  Demo: [
    number('target', 'Target length (seconds)', '300'),
    choice('preset', 'Preset', ['sample', 'spot_check'], 'sample'),
    color('tint', 'Tint', 'B5473C', true),
  ],
};

function mount(over: Partial<NarrationApi> = {}) {
  const save = vi.fn(async () => undefined);
  const api = createMockApi({ settingsForScope: async () => FIELDS, saveSettings: save, ...over } as Partial<NarrationApi>);
  const wrapper = ({ children }: { children: ReactNode }) => <ApiProvider api={api}>{children}</ApiProvider>;
  render(<ProofOptions title="Demo options" tool="Demo" keys={['target', 'preset', 'tint']} />, { wrapper });
  return { save, open: () => userEvent.click(screen.getByRole('button', { name: /Demo options/ })) };
}

describe('Proof options', () => {
  it('is closed until opened, then shows each setting at the value in force for this project', async () => {
    const { open } = mount();
    expect(screen.queryByRole('textbox', { name: 'Target length (seconds)' })).toBeNull();
    await open();
    expect((await screen.findByRole('textbox', { name: 'Target length (seconds)' })) as HTMLInputElement).toHaveProperty('value', '300');
    expect((screen.getByRole('combobox', { name: 'Preset' }) as HTMLSelectElement).value).toBe('sample');
    expect((screen.getByRole('textbox', { name: 'Tint' }) as HTMLInputElement).value).toBe('B5473C');
  });

  it('saves a number at the project layer once it is a valid, in-range value, and a choice as picked', async () => {
    const { save, open } = mount();
    await open();
    const box = await screen.findByRole('textbox', { name: 'Target length (seconds)' });
    fireEvent.change(box, { target: { value: '600' } });
    fireEvent.blur(box);
    await waitFor(() => expect(save).toHaveBeenCalledWith('Demo', 'project', { target: '600' }));
    fireEvent.change(screen.getByRole('combobox', { name: 'Preset' }), { target: { value: 'spot_check' } });
    await waitFor(() => expect(save).toHaveBeenCalledWith('Demo', 'project', { preset: 'spot_check' }));
  });

  it('clamps a number past the host range instead of saving it', async () => {
    const { save, open } = mount();
    await open();
    const box = await screen.findByRole('textbox', { name: 'Target length (seconds)' });
    fireEvent.change(box, { target: { value: '99999' } });
    fireEvent.blur(box);
    await waitFor(() => expect(save).toHaveBeenCalledWith('Demo', 'project', { target: '3600' }));
  });

  it('saves a colour as six hex digits without the hash, in capitals, and ignores text that is not a colour', async () => {
    const { save, open } = mount();
    await open();
    const hex = await screen.findByRole('textbox', { name: 'Tint' });
    fireEvent.change(hex, { target: { value: 'zzz' } });
    fireEvent.blur(hex);
    expect(save).not.toHaveBeenCalled();
    fireEvent.change(hex, { target: { value: '#3f6ea6' } });
    fireEvent.blur(hex);
    await waitFor(() => expect(save).toHaveBeenCalledWith('Demo', 'project', { tint: '3F6EA6' }));
  });

  it('offers Reset only on a setting this project overrides, and Reset hands the setting back to the default', async () => {
    const { save, open } = mount();
    await open();
    await screen.findByRole('textbox', { name: 'Tint' });
    expect(screen.getAllByRole('button', { name: /^Reset / })).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Reset Tint' }));
    await waitFor(() => expect(save).toHaveBeenCalledWith('Demo', 'project', { tint: null }));
  });

  it('says why when the settings cannot be read, and shows no rows', async () => {
    const { open } = mount({
      settingsForScope: async () => {
        throw new Error('The settings file is unreadable.');
      },
    } as Partial<NarrationApi>);
    await open();
    expect((await screen.findByRole('alert')).textContent).toContain('unreadable');
    expect(screen.queryByRole('combobox', { name: 'Preset' })).toBeNull();
  });

  it('says why when a save is refused, and keeps the value in force', async () => {
    const { open } = mount({
      saveSettings: async () => {
        throw new Error('The settings file is read-only.');
      },
    } as Partial<NarrationApi>);
    await open();
    fireEvent.change(await screen.findByRole('combobox', { name: 'Preset' }), { target: { value: 'spot_check' } });
    expect((await screen.findByRole('alert')).textContent).toContain('read-only');
    expect((screen.getByRole('combobox', { name: 'Preset' }) as HTMLSelectElement).value).toBe('sample');
  });
});
