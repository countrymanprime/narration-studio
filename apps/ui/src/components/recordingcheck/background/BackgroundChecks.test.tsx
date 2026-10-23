// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../../api/ApiContext';
import { createMockApi } from '../../../api/mockApi';
import type { MockApiSeed } from '../../../api/mockHost/state';
import { useChapterSync } from '../../../hooks/useChapterSync';
import { overlay } from '../../../overlay/overlayService';
import type { NarrationApi } from '../../../types';
import { BackgroundChecks } from './BackgroundChecks';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/** App's wiring: one chapter sync subscription handed down. */
function Harness({ api }: { api: NarrationApi }) {
  const chapterSync = useChapterSync(api);
  return <BackgroundChecks chapterSync={chapterSync} />;
}

function mount(seed: MockApiSeed) {
  const api = createMockApi({}, seed);
  const saveSettings = vi.spyOn(api, 'saveSettings');
  const coverageCancel = vi.spyOn(api, 'coverageCancel');
  const toast = vi.spyOn(overlay, 'toast');
  render(
    <ApiProvider api={api}>
      <Harness api={api} />
    </ApiProvider>,
  );
  return { api, saveSettings, coverageCancel, toast };
}

describe('BackgroundChecks', () => {
  it('shows nothing when nothing is checked or waiting', async () => {
    const { api } = mount({});
    await api.chapterSyncState();
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Background recording check' })).toBeNull());
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('asks before the first background check, naming the models, and confirms', async () => {
    const { saveSettings } = mount({ backgroundChecks: 'confirm' });
    const dialog = await screen.findByRole('alertdialog', { name: 'Check recordings in the background?' });
    expect(dialog.textContent).toContain('tiny + small');
    expect(dialog.textContent).toContain('2 chapters changed');
    fireEvent.click(screen.getByRole('button', { name: 'Check in the background' }));
    await waitFor(() => expect(saveSettings).toHaveBeenCalledWith('RecordingCoverage', 'global', { background_checks_confirmed: 'true' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
  });

  it('Not now turns background checks off and says where to turn them on', async () => {
    const { saveSettings, toast } = mount({ backgroundChecks: 'confirm' });
    await screen.findByRole('alertdialog');
    fireEvent.click(screen.getByRole('button', { name: 'Not now' }));
    await waitFor(() =>
      expect(saveSettings).toHaveBeenCalledWith('RecordingCoverage', 'global', { background_checks_confirmed: 'true', background_checks: 'false' }),
    );
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(toast).toHaveBeenCalledWith(expect.stringContaining('Settings › Speech › Recording check'));
  });

  it('shows a running check with its models and queue, and toasts its start once', async () => {
    const { toast } = mount({ backgroundChecks: 'running' });
    const status = await screen.findByRole('region', { name: 'Background recording check' });
    await waitFor(() => expect(status.textContent).toMatch(/Checking .+ in the background · 42%/));
    await waitFor(() => expect(status.textContent).toContain('tiny + small · 1 chapter waiting'));
    expect(screen.getByRole('progressbar')).toBeTruthy();
    await waitFor(() => expect(toast).toHaveBeenCalledTimes(1));
    expect(toast.mock.calls[0][0]).toMatch(/in the background with tiny \+ small\. Only audio not checked before is listened to\./);
  });

  it('Cancel stops this check only', async () => {
    const { coverageCancel, saveSettings } = mount({ backgroundChecks: 'running' });
    await screen.findByRole('button', { name: 'Cancel' });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(coverageCancel).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Background recording check' })).toBeNull());
    expect(saveSettings).not.toHaveBeenCalled();
  });

  it('Pause turns background checks off, stops the running one and offers Resume', async () => {
    const { coverageCancel, saveSettings, toast } = mount({ backgroundChecks: 'running' });
    fireEvent.click(await screen.findByRole('button', { name: 'Pause' }));
    await waitFor(() => expect(saveSettings).toHaveBeenCalledWith('RecordingCoverage', 'global', { background_checks: 'false' }));
    await waitFor(() => expect(coverageCancel).toHaveBeenCalled());
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.stringContaining('paused'), expect.objectContaining({ action: expect.anything() })));
    const resume = toast.mock.calls.find(([text]) => text.includes('paused'))?.[1]?.action;
    resume?.onAction();
    await waitFor(() => expect(saveSettings).toHaveBeenCalledWith('RecordingCoverage', 'global', { background_checks: null }));
  });

  it('says how many chapters wait and why when none can start', async () => {
    mount({ backgroundChecks: 'waiting' });
    const status = await screen.findByRole('region', { name: 'Background recording check' });
    expect(status.textContent).toContain('2 chapters waiting to be checked: REAPER is recording');
    expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull();
  });
});
