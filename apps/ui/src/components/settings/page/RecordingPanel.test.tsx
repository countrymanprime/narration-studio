// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ApiProvider } from '../../../api/ApiContext';
import { createMockApi } from '../../../api/mockApi';
import type { NarrationApi } from '../../../types';
import { RecordingPanel } from './RecordingPanel';

afterEach(cleanup);

const mount = (api: NarrationApi) =>
  render(
    <ApiProvider api={api}>
      <RecordingPanel />
    </ApiProvider>,
  );

describe('RecordingPanel (SN-M92)', () => {
  it('names the DAW from the capability report', async () => {
    const api = createMockApi();
    const report = await api.dawCapabilities();
    mount(api);
    const group = await screen.findByRole('radiogroup', { name: 'Recording' });
    const labels = within(group)
      .getAllByRole('radio')
      .map((radio) => radio.parentElement?.textContent ?? '');
    expect(labels[0]).toBe(`${report.daw}. Recordings live in the DAW.`);
    expect(labels).toHaveLength(2);
  });

  it("says the host's refusal and keeps the choice it had", async () => {
    const api = createMockApi();
    api.recorderChooseEngine = async () => {
      throw new Error('stop the take before changing how the project records');
    };
    mount(api);
    const builtin = await screen.findByRole('radio', { name: /^Built-in recorder/ });
    const daw = screen.getByRole('radio', { name: /Recordings live in the DAW/ });
    expect(daw.getAttribute('aria-checked')).toBe('true');
    fireEvent.click(builtin);
    expect((await screen.findByRole('alert')).textContent).toContain('stop the take before changing how the project records');
    expect(daw.getAttribute('aria-checked')).toBe('true');
    expect(builtin.getAttribute('aria-checked')).toBe('false');
  });

  it('says built-in is not supported on this machine and keeps the choice', async () => {
    const api = createMockApi();
    api.recorderChooseEngine = async () => {
      throw new Error('the built-in recorder needs Windows');
    };
    mount(api);
    fireEvent.click(await screen.findByRole('radio', { name: /^Built-in recorder/ }));
    expect((await screen.findByRole('alert')).textContent).toContain('the built-in recorder needs Windows');
    expect(screen.getByRole('radio', { name: /Recordings live in the DAW/ }).getAttribute('aria-checked')).toBe('true');
  });

  it('saves the built-in recorder and reads the answer back', async () => {
    const api = createMockApi();
    mount(api);
    fireEvent.click(await screen.findByRole('radio', { name: /^Built-in recorder/ }));
    await waitFor(() => expect(screen.getByRole('radio', { name: /^Built-in recorder/ }).getAttribute('aria-checked')).toBe('true'));
    expect((await api.recorderState()).engine).toBe('builtin');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('offers no DAW row when the launch reports none', async () => {
    const api = createMockApi();
    const report = await api.dawCapabilities();
    api.dawCapabilities = async () => ({ ...report, daw: 'none', reachable: false });
    mount(api);
    await screen.findByRole('radio', { name: /^Built-in recorder/ });
    expect(screen.getAllByRole('radio')).toHaveLength(1);
  });
});
