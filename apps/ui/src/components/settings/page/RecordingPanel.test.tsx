// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../../api/ApiContext';
import { createMockApi } from '../../../api/mockApi';
import type { MockApiSeed } from '../../../api/mockHost/state';
import type { NarrationApi } from '../../../types';
import { RecordingPanel } from './RecordingPanel';

afterEach(cleanup);

const mount = (api: NarrationApi, onLinkDawFile = vi.fn()) =>
  render(
    <ApiProvider api={api}>
      <RecordingPanel onLinkDawFile={onLinkDawFile} notify={vi.fn()} />
    </ApiProvider>,
  );

const foundSeed: MockApiSeed = { dawChoice: { linkedFile: null, foundFiles: ['Alice.rpp'] }, daw: { connected: false } };

describe('RecordingPanel', () => {
  it('lists every engine the app supports, whatever the project records with', async () => {
    mount(createMockApi({}, { daw: { daw: 'none' } }));
    const group = await screen.findByRole('radiogroup', { name: 'Recording' });
    const labels = within(group)
      .getAllByRole('radio')
      .map((radio) => radio.getAttribute('aria-label') ?? radio.closest('label')?.textContent ?? '');
    expect(labels).toEqual(['REAPER. Recordings live in the DAW.', 'Audacity. Recordings live in the DAW.', 'Built-in recorder. Recordings live in the app.']);
  });

  it('chooses REAPER for a folder holding one .rpp and links it in one click', async () => {
    const api = createMockApi({}, foundSeed);
    mount(api);
    await waitFor(() => expect(screen.getByRole('radio', { name: /^REAPER\./ }).getAttribute('aria-checked')).toBe('true'));
    expect(screen.getByText('REAPER not linked')).toBeTruthy();
    expect(screen.getByText('Alice.rpp is in the project folder.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Link Alice.rpp' }));
    expect(await screen.findByText('REAPER linked: Alice.rpp')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Start REAPER' })).toBeTruthy();
  });

  it('asks the narrator to choose when the folder holds several project files', async () => {
    const onLinkDawFile = vi.fn();
    mount(createMockApi({}, { dawChoice: { linkedFile: null, foundFiles: ['Alice.rpp', 'Alice v2.rpp'] }, daw: { connected: false } }), onLinkDawFile);
    expect(await screen.findByText(/2 REAPER project files are in the project folder/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Link / })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Choose a project file' }));
    expect(onLinkDawFile).toHaveBeenCalled();
  });

  it('saves the built-in recorder and reads the answer back', async () => {
    const api = createMockApi({}, foundSeed);
    mount(api);
    fireEvent.click(await screen.findByRole('radio', { name: /^Built-in recorder/ }));
    await waitFor(() => expect(screen.getByRole('radio', { name: /^Built-in recorder/ }).getAttribute('aria-checked')).toBe('true'));
    expect((await api.recorderState()).engine).toBe('builtin');
    expect(screen.queryByTestId('recording-daw-status')).toBeNull();
  });

  it("says the host's refusal and keeps the choice it had", async () => {
    const api = createMockApi({}, foundSeed);
    api.dawChoose = async () => {
      throw new Error('stop the take before changing how the project records');
    };
    mount(api);
    const builtin = await screen.findByRole('radio', { name: /^Built-in recorder/ });
    await waitFor(() => expect(screen.getByRole('radio', { name: /^REAPER\./ }).getAttribute('aria-checked')).toBe('true'));
    fireEvent.click(builtin);
    expect((await screen.findByRole('alert')).textContent).toContain('stop the take before changing how the project records');
    expect(screen.getByRole('radio', { name: /^REAPER\./ }).getAttribute('aria-checked')).toBe('true');
  });

  it('says why an engine cannot record and where to fix it', async () => {
    mount(createMockApi({}, { dawChoice: { linkedFile: null, foundFiles: [], reaperInstalled: false, chosen: 'REAPER' }, daw: { connected: false } }));
    expect(await screen.findByText(/REAPER was not found on this computer/)).toBeTruthy();
    expect(screen.getAllByText(/Experimental: switched off in Settings\./).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: 'DAW Integration' }).length).toBeGreaterThan(0);
    expect(screen.getByText(/No REAPER project file is in the project folder yet/)).toBeTruthy();
  });
});
