// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EnginePanelLink, EnginePanelProvider, useOpenRecordingSettings } from './EnginePanelContext';

afterEach(cleanup);

function SettingsPointer() {
  const open = useOpenRecordingSettings();
  return <button onClick={open}>Settings pointer</button>;
}

// #3416 item 55: the overlay host renders beside the routes, not under the provider, so a dialog opened through the overlay service (Check recordings) found no
// provider: "Open the audio engine panel" closed the dialog and opened nothing. Two separate React roots stand in for the app and the overlay host.
describe('the engine panel openers reach a component rendered outside the provider', () => {
  it('opens the panel from a pointer in another root while the provider is mounted, and does nothing once it is gone', async () => {
    const openPanel = vi.fn();
    const openSettings = vi.fn();
    const app = render(
      <EnginePanelProvider value={openPanel} openRecordingSettings={openSettings}>
        <p>app</p>
      </EnginePanelProvider>,
    );
    const host = document.body.appendChild(document.createElement('div'));
    const overlayHost = render(
      <>
        <EnginePanelLink />
        <SettingsPointer />
      </>,
      { container: host },
    );

    await userEvent.click(screen.getByRole('button', { name: 'Open the audio engine panel' }));
    await userEvent.click(screen.getByRole('button', { name: 'Settings pointer' }));
    expect(openPanel).toHaveBeenCalledOnce();
    expect(openSettings).toHaveBeenCalledOnce();

    app.unmount();
    await userEvent.click(screen.getByRole('button', { name: 'Open the audio engine panel' }));
    expect(openPanel).toHaveBeenCalledOnce();
    overlayHost.unmount();
  });

  it('keeps using the provider above a pointer when there is one', async () => {
    const outer = vi.fn();
    const inner = vi.fn();
    render(
      <EnginePanelProvider value={outer}>
        <EnginePanelProvider value={inner}>
          <EnginePanelLink />
        </EnginePanelProvider>
      </EnginePanelProvider>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Open the audio engine panel' }));
    expect(inner).toHaveBeenCalledOnce();
    expect(outer).not.toHaveBeenCalled();
  });

  it('keeps the first provider when a second one unmounts, and its settings opener when the second has none', async () => {
    const first = vi.fn();
    const firstSettings = vi.fn();
    render(
      <EnginePanelProvider value={first} openRecordingSettings={firstSettings}>
        <p>app</p>
      </EnginePanelProvider>,
    );
    const second = render(
      <EnginePanelProvider value={vi.fn()}>
        <p>a story</p>
      </EnginePanelProvider>,
    );
    const host = document.body.appendChild(document.createElement('div'));
    render(
      <>
        <EnginePanelLink />
        <SettingsPointer />
      </>,
      { container: host },
    );
    await userEvent.click(screen.getByRole('button', { name: 'Settings pointer' }));
    expect(firstSettings).toHaveBeenCalledOnce();
    second.unmount();
    await userEvent.click(screen.getByRole('button', { name: 'Open the audio engine panel' }));
    expect(first).toHaveBeenCalledOnce();
  });

  it('does nothing without any provider (a component test)', async () => {
    render(<EnginePanelLink />);
    await userEvent.click(screen.getByRole('button', { name: 'Open the audio engine panel' }));
  });
});
