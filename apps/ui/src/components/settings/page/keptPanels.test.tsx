// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../../api/ApiContext';
import { createMockApi } from '../../../api/mockApi';
import type { DawLaunchResult } from '../../../api/contracts/project';
import type { NarrationApi } from '../../../types';
import { DawPanel } from './DawPanel';
import { LocalModelCard } from './LocalModelCard';
import { ProjectDataPanel } from './ProjectDataPanel';
import { SettingsFormsProvider } from './settingsForms';

afterEach(cleanup);

function withForms(api: NarrationApi, children: React.ReactNode) {
  return render(
    <ApiProvider api={api}>
      <SettingsFormsProvider notify={vi.fn()} onDirtyChange={vi.fn()} registerActions={vi.fn()}>
        {children}
      </SettingsFormsProvider>
    </ApiProvider>,
  );
}

describe('LocalModelCard (the TTS and Proof panels)', () => {
  it('removes the installed voice only after the confirm, once, and reads the catalog again', async () => {
    const api = createMockApi();
    const catalog = await api.ttsCatalog();
    let installed = true;
    api.ttsCatalog = vi.fn(async () => ({
      ...catalog,
      voices: catalog.voices.map((voice) =>
        voice.id === catalog.voice.id ? { ...voice, installState: installed ? ('installed' as const) : ('not_installed' as const) } : voice,
      ),
    }));
    let finish: () => void = () => undefined;
    const remove = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)));
    api.ttsRemove = remove;
    const notify = vi.fn();
    withForms(api, <LocalModelCard kind="voice" fields={[]} notify={notify} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Remove local voice…' }));
    expect(remove).not.toHaveBeenCalled();
    const confirm = await screen.findByRole('button', { name: 'Remove voice' });
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    await waitFor(() => expect(confirm.getAttribute('aria-busy')).toBe('true'));
    expect(remove).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledWith(catalog.voice.id);

    installed = false;
    finish();
    await waitFor(() => expect(notify).toHaveBeenCalledWith('Local preview voice removed.'));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Remove local voice…' })).toBeNull());
    expect(screen.getByText(/Not installed/)).toBeTruthy();
  });

  it('names the selected Whisper model and offers no Remove while it is not installed', async () => {
    const api = createMockApi();
    const catalog = await api.whisperCatalog();
    const selected = catalog.models.find((model) => model.id === catalog.model.id)!;
    api.whisperCatalog = async () => ({ ...catalog, models: catalog.models.map((model) => ({ ...model, installState: 'not_installed' as const })) });
    const remove = vi.spyOn(api, 'whisperRemove');
    withForms(api, <LocalModelCard kind="model" fields={[]} notify={vi.fn()} />);
    expect(await screen.findByText(selected.displayName)).toBeTruthy();
    expect(screen.getByText(/Not installed · \d+ MB/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Remove local model…' })).toBeNull();
    expect(remove).not.toHaveBeenCalled();
  });
});

describe('DawPanel (DAW Integration)', () => {
  it('launches REAPER once while the first launch is still starting, and says when it started', async () => {
    const api = createMockApi();
    const data = await api.bootstrap();
    let finish: () => void = () => undefined;
    const launch = vi.fn(
      () => new Promise<DawLaunchResult>((resolve) => (finish = () => resolve({ launched: true, path: 'C:/REAPER/reaper.exe', source: 'detected' }))),
    );
    api.launchDaw = launch;
    const notify = vi.fn();
    withForms(api, <DawPanel data={{ ...data, dawFileLinked: true }} notify={notify} onLinkDawFile={vi.fn()} />);
    const button = await screen.findByRole('button', { name: 'Launch REAPER' });
    fireEvent.click(button);
    const starting = await screen.findByRole('button', { name: 'Starting REAPER…' });
    expect((starting as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(starting);
    expect(launch).toHaveBeenCalledTimes(1);
    finish();
    await waitFor(() => expect(notify).toHaveBeenCalledWith('REAPER started (C:/REAPER/reaper.exe).'));
  });

  it('shows the project link in This project, and links through the shared action', async () => {
    const api = createMockApi();
    const data = await api.bootstrap();
    const link = vi.fn();
    withForms(api, <DawPanel data={{ ...data, dawFileLinked: false }} notify={vi.fn()} onLinkDawFile={link} />);
    const panel = screen.getByRole('region', { name: 'DAW Integration' });
    fireEvent.click(within(panel).getByRole('button', { name: 'This project' }));
    expect(await within(panel).findByText('No REAPER project linked')).toBeTruthy();
    expect(within(panel).queryByRole('button', { name: 'Launch REAPER' })).toBeNull();
    fireEvent.click(within(panel).getByRole('button', { name: 'Link a REAPER project file' }));
    expect(link).toHaveBeenCalledTimes(1);
  });
});

describe('ProjectDataPanel', () => {
  it('clears only after the confirm, once, and hands over to the app when done', async () => {
    const api = createMockApi();
    let finish: () => void = () => undefined;
    const clear = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)));
    api.clearProjectData = clear;
    const cleared = vi.fn(async () => undefined);
    withForms(api, <ProjectDataPanel notify={vi.fn()} onProjectDataCleared={cleared} />);
    fireEvent.click(screen.getByRole('button', { name: 'Clear derived project data…' }));
    expect(clear).not.toHaveBeenCalled();
    const confirm = await screen.findByRole('button', { name: 'Clear project data' });
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    expect(clear).toHaveBeenCalledTimes(1);
    finish();
    await waitFor(() => expect(cleared).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Clear project data' })).toBeNull());
  });
});
