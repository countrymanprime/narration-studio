// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../api/ApiContext';
import { createMockApi } from '../../api/mockApi';
import type { NarrationApi, ScopedSettingField } from '../../types';
import { StageSuggestionOptions } from './StageSuggestionOptions';

afterEach(cleanup);

const field = (key: string, label: string, kind: 'bool' | 'choice', value: string): ScopedSettingField => ({
  key,
  label,
  kind,
  choices: kind === 'choice' ? ['required', 'ignored'] : [],
  value: '',
  isSet: false,
  effectiveValue: value,
  effectiveSource: 'repo default',
});

function mount() {
  const save = vi.fn(async () => undefined);
  const readAgain = vi.fn();
  const api = createMockApi({
    settingsForScope: async () => ({
      StageRecommendations: [
        field('suggestions_enabled', 'Suggest stage advances', 'bool', 'true'),
        field('recording.text_present', 'Text present in order (recording)', 'choice', 'required'),
      ],
    }),
    saveSettings: save,
  } as unknown as Partial<NarrationApi>);
  const wrapper = ({ children }: { children: ReactNode }) => <ApiProvider api={api}>{children}</ApiProvider>;
  render(<StageSuggestionOptions onSaved={readAgain} />, { wrapper });
  return { save, readAgain };
}

describe('Stage suggestion options', () => {
  it('is closed until opened, then offers the switch and each signal with readable choices', async () => {
    mount();
    expect(screen.queryByRole('switch')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: /Stage suggestion options/ }));
    expect((await screen.findByRole('switch', { name: 'Suggest stage advances' })).getAttribute('aria-checked')).toBe('true');
    const select = screen.getByRole('combobox', { name: 'Text present in order (recording)' }) as HTMLSelectElement;
    expect([...select.options].map((o) => o.textContent)).toEqual(['Required', 'Ignored']);
  });

  it('saves a change for this project and has the board read its suggestions again', async () => {
    const { save, readAgain } = mount();
    await userEvent.click(screen.getByRole('button', { name: /Stage suggestion options/ }));
    fireEvent.change(await screen.findByRole('combobox', { name: 'Text present in order (recording)' }), { target: { value: 'ignored' } });
    await waitFor(() => expect(save).toHaveBeenCalledWith('StageRecommendations', 'project', { 'recording.text_present': 'ignored' }));
    await waitFor(() => expect(readAgain).toHaveBeenCalledTimes(1));
  });
});
