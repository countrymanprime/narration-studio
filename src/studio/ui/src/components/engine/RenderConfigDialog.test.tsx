// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RenderConfigDialog } from './RenderConfigDialog';
import { ApiProvider } from '../../api/ApiContext';
import { createMockApi } from '../../api/mockApi';
import type { NarrationApi } from '../../types';

afterEach(cleanup);

function renderDialog(overrides: Partial<NarrationApi> = {}, initial: Parameters<typeof createMockApi>[1] = {}, onClose = vi.fn()) {
  const api = createMockApi(overrides, initial);
  render(
    <ApiProvider api={api}>
      <RenderConfigDialog onClose={onClose} />
    </ApiProvider>,
  );
  return { api, onClose };
}

const footerButton = (name: string) => screen.getAllByRole('button', { name }).find((button) => button.closest('[data-dialog-actions]'));

describe('RenderConfigDialog', () => {
  it('prefills the suggested output folder', async () => {
    renderDialog();
    await waitFor(() => expect((screen.getByLabelText('Output folder') as HTMLInputElement).value).toContain('renders'));
  });

  it('configures the render and shows the resulting file names plus the manual-render instruction', async () => {
    const user = userEvent.setup();
    const { api } = renderDialog();
    const configureSpy = vi.spyOn(api, 'renderConfigConfigure');

    await waitFor(() => expect((screen.getByLabelText('Output folder') as HTMLInputElement).value).not.toBe(''));
    await user.click(screen.getByRole('button', { name: 'Configure render' }));

    await waitFor(() => expect(configureSpy).toHaveBeenCalled());
    expect(await screen.findByText(/Render is configured for 2 chapter files\. Press Render in REAPER/)).toBeTruthy();
    expect(screen.getByText(/Chapter 1\.wav/)).toBeTruthy();
    expect(screen.getByText(/Chapter 2\.wav/)).toBeTruthy();
  });

  it('shows the configured state when seeded, without stepping through a run', async () => {
    renderDialog({}, { renderConfig: 'success' });
    expect(await screen.findByText(/Render is configured for 2 chapter files/)).toBeTruthy();
  });

  it('draws the manual-render shortcut as a key cap, not plain text', async () => {
    renderDialog({}, { renderConfig: 'success' });
    await screen.findByText(/Render is configured for 2 chapter files/);
    expect(screen.getByRole('img', { name: 'Ctrl + Alt + R' })).toBeTruthy();
  });

  it('reports when no chapter regions exist yet', async () => {
    renderDialog({}, { renderConfig: 'no-regions' });
    expect(await screen.findByText(/No chapter regions were found yet/)).toBeTruthy();
  });

  it('shows a REAPER error state', async () => {
    renderDialog({}, { renderConfig: 'error' });
    const alerts = await screen.findAllByRole('alert');
    expect(alerts.some((alert) => alert.textContent?.includes('cannot configure render settings'))).toBe(true);
  });

  it('disables Close and Configure while a run is in flight', async () => {
    const user = userEvent.setup();
    renderDialog();

    await waitFor(() => expect((screen.getByLabelText('Output folder') as HTMLInputElement).value).not.toBe(''));
    await user.click(screen.getByRole('button', { name: 'Configure render' }));

    await waitFor(() => expect((screen.getByRole('button', { name: 'Close' }) as HTMLButtonElement).disabled).toBe(true));
  });

  it('the API surface offers only configure-render methods, never a render-triggering one', () => {
    const { api } = renderDialog();
    // Matches this dialog's own vocabulary (REAPER's render, `renderConfig*`/`subscribeRenderConfig`), not a chapter's
    // rendered file (`proofing*Render*`), a different, unrelated "render".
    const renderNamed = Object.keys(api).filter((name) => /^(render|subscribeRender)/i.test(name));
    expect(renderNamed.sort()).toEqual(['renderConfigConfigure', 'renderConfigState', 'renderConfigSuggestFolder', 'subscribeRenderConfig']);
  });

  // Alignment audit R3EN2-7: the instruction was printed twice, once muted and once bold, over a 12 px list; ENX-28: Configure stayed primary.
  it('says the instruction once, in one result block, and makes Close the primary', async () => {
    renderDialog({}, { renderConfig: 'success' });
    expect(await screen.findByRole('status')).toBeTruthy();
    expect(screen.getAllByText(/Press Render in REAPER/)).toHaveLength(1);
    expect(screen.queryByText(/^Render configured for/)).toBeNull();
    expect(footerButton('Close')?.className).toContain('bg-[var(--accent)]');
    expect(footerButton('Configure render')?.className).not.toContain('bg-[var(--accent)]');
  });

  // R3EN2-8: no regions read as a quiet success; the way forward was a button behind the dialog.
  it('warns when there are no chapter regions and offers to create them', async () => {
    const user = userEvent.setup();
    const onCreateRegions = vi.fn();
    render(
      <ApiProvider api={createMockApi({}, { renderConfig: 'no-regions' })}>
        <RenderConfigDialog onClose={vi.fn()} onCreateRegions={onCreateRegions} />
      </ApiProvider>,
    );
    expect(await screen.findByText(/No chapter regions were found yet/)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Create chapter regions…' }));
    expect(onCreateRegions).toHaveBeenCalledTimes(1);
  });
});
