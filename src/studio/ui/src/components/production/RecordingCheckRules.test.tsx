// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../api/ApiContext';
import { createMockApi } from '../../api/mockApi';
import { providedCommands } from '../../input/commandProviders';
import { RecordingCheckRules } from './RecordingCheckRules';

afterEach(cleanup);

async function openRules() {
  const store = createMockApi();
  const saveSettings = vi.fn(store.saveSettings);
  const onSaved = vi.fn();
  const api = createMockApi({ saveSettings, settingsForScope: store.settingsForScope });
  const wrapper = ({ children }: { children: ReactNode }) => <ApiProvider api={api}>{children}</ApiProvider>;
  render(<RecordingCheckRules onSaved={onSaved} />, { wrapper });
  expect(screen.queryByRole('dialog')).toBeNull();
  act(() =>
    providedCommands()
      .find((command) => command.label === 'Open Recording check rules')!
      .run(),
  );
  const dialog = await screen.findByRole('dialog', { name: 'Recording check rules' });
  return { dialog, saveSettings, onSaved };
}

describe('the recording check rules, opened from the jump menu', () => {
  it('shows the five rules at the values in force, with the note that they are proposed', async () => {
    const { dialog } = await openRules();
    expect(((await within(dialog).findByRole('textbox', { name: 'Longest run of missing words allowed' })) as HTMLInputElement).value).toBe('3');
    for (const name of ['Share of each paragraph that must be read', 'Longest misread still counted as read', 'Shortest match that counts as read']) {
      expect(within(dialog).getByRole('textbox', { name })).toBeTruthy();
    }
    expect(within(dialog).getByRole('switch', { name: 'Check changed chapters in the background' }).getAttribute('aria-checked')).toBe('true');
    expect(within(dialog).getByText('Proposed values, not yet calibrated')).toBeTruthy();
  });

  it('saves a changed rule for this project and has the page read the checks again', async () => {
    const { dialog, saveSettings, onSaved } = await openRules();
    const box = await within(dialog).findByRole('textbox', { name: 'Longest run of missing words allowed' });
    fireEvent.change(box, { target: { value: '5' } });
    fireEvent.blur(box);
    await waitFor(() => expect(saveSettings).toHaveBeenCalledWith('RecordingCoverage', 'project', { max_missing_run: '5' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
  });
});
