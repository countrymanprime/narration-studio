// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../../api/ApiContext';
import { createMockApi } from '../../../api/mockApi';
import { OverlayProvider } from '../../../overlay/OverlayProvider';
import { createOverlayService } from '../../../overlay/overlayService';
import type { NarrationApi } from '../../../types';
import { DiagnosticsSection } from './DiagnosticsSection';

afterEach(cleanup);

function renderSection(overrides: Partial<NarrationApi> = {}) {
  const service = createOverlayService();
  const toast = vi.spyOn(service, 'toast');
  render(
    <ApiProvider api={createMockApi(overrides)}>
      <OverlayProvider service={service}>
        <DiagnosticsSection />
      </OverlayProvider>
    </ApiProvider>,
  );
  return toast;
}

describe('DiagnosticsSection', () => {
  it('previews what the bundle holds and what it leaves out, and writes nothing', async () => {
    const save = vi.fn(async () => ({ path: '' }));
    renderSection({ systemSaveDiagnostics: save });
    fireEvent.click(screen.getByRole('button', { name: 'Preview the diagnostics bundle' }));
    const dialog = await screen.findByRole('dialog', { name: 'Diagnostics bundle' });
    expect(dialog.textContent).toContain('trace.jsonl');
    expect(dialog.textContent).toContain('sidecar stderr');
    expect(dialog.textContent).toMatch(/0 lines dropped/);
    expect(save).not.toHaveBeenCalled();
  });

  it('says what an empty bundle means when nothing was recorded', async () => {
    renderSection({
      systemDiagnosticsPreview: async () => ({
        format: 1,
        createdAt: '2026-09-26T12:00:00Z',
        appVersion: '0.0.0-dev',
        redactionVersion: 1,
        traceEnabled: false,
        files: [],
        excluded: [],
        leakCheck: { terms: 0, linesDropped: 1 },
        note: '',
      }),
    });
    fireEvent.click(screen.getByRole('button', { name: 'Preview the diagnostics bundle' }));
    const dialog = await screen.findByRole('dialog', { name: 'Diagnostics bundle' });
    expect(dialog.textContent).toContain('Nothing has been recorded yet.');
    expect(dialog.textContent).toMatch(/1 line dropped/);
  });

  it('saves, copies the path and says where the file is', async () => {
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const toast = renderSection();
    fireEvent.click(screen.getByRole('button', { name: 'Save the diagnostics bundle' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('C:/Users/narrator/Documents/diagnostics-20260926T120000.zip'));
    expect(toast).toHaveBeenCalledWith(expect.stringContaining('The path is copied'));
  });

  it('does nothing when the folder picker is closed', async () => {
    const toast = renderSection({ systemSaveDiagnostics: async () => ({ path: '' }) });
    fireEvent.click(screen.getByRole('button', { name: 'Save the diagnostics bundle' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save the diagnostics bundle' }).getAttribute('aria-busy')).not.toBe('true'));
    expect(toast).not.toHaveBeenCalled();
  });

  it('shows a failed save as an error toast', async () => {
    const toast = renderSection({
      systemSaveDiagnostics: async () => {
        throw new Error('disk full');
      },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save the diagnostics bundle' }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.stringContaining('disk full'), { tone: 'error' }));
  });
});
